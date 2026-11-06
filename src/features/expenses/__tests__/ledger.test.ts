import { describe, expect, it } from '@jest/globals';
import type { Expense, Member, TripLedger } from '@/domain/models';
import { ExpenseSchema } from '@/domain/models';
import {
  allocate,
  computeShares,
  expensesByDay,
  lastParticipants,
  memberInUse,
  memberTotals,
  netBalances,
  paidLabel,
  paymentLabel,
  stopCosts,
  suggestPayments,
} from '../ledger';
import { ledgerAsText, tripDeleteMessage } from '../share';

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

/** Repeatable pseudo-random numbers, so a failure here can be replayed. */
function random(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state % max;
  };
}

const members: Member[] = [
  { id: 'a', name: 'Asha', isSelf: true },
  { id: 'b', name: 'Bilal' },
  { id: 'c', name: 'Chen' },
  { id: 'd', name: 'Dee' },
];

function expense(id: string, amountMinor: number, payerId: string, shares: [string, number][]): Expense {
  return {
    id,
    title: id,
    category: 'food',
    spentOn: '2026-11-06',
    amountMinor,
    payers: [{ memberId: payerId, amountMinor }],
    splitMode: 'exact',
    shares: shares.map(([memberId, minor]) => ({ memberId, amountMinor: minor })),
    createdAt: 1,
    updatedAt: 1,
  };
}

function ledger(partial: Partial<TripLedger>): TripLedger {
  return { tripId: 't', currency: 'USD', members, expenses: [], settlements: [], createdAt: 0, ...partial };
}

describe('allocate', () => {
  it('always adds up to the total, for any weights', () => {
    const next = random(7);
    for (let run = 0; run < 500; run++) {
      const weights = Array.from({ length: 1 + next(12) }, () => 1 + next(10000));
      const total = next(100_000_000);
      const amounts = allocate(total, weights, `seed-${run}`);
      expect(sum(amounts)).toBe(total);
      expect(amounts.every((a) => Number.isInteger(a) && a >= 0)).toBe(true);
    }
  });

  it('stays exact at the largest amount the app allows', () => {
    const amounts = allocate(100_000_000_000, [10000, 3333, 1], 'x');
    expect(sum(amounts)).toBe(100_000_000_000);
  });

  it('gives the same result for the same seed', () => {
    expect(allocate(100, [1, 1, 1], 'expense-1')).toEqual(allocate(100, [1, 1, 1], 'expense-1'));
  });

  it('never moves more than one unit between equal shares', () => {
    const amounts = allocate(100, [1, 1, 1], 'any');
    expect(Math.max(...amounts) - Math.min(...amounts)).toBe(1);
  });

  it('spreads spare units around across expenses', () => {
    const luckyPeople = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const amounts = allocate(100, [1, 1, 1], `expense-${i}`);
      luckyPeople.add(amounts.indexOf(Math.max(...amounts)));
    }
    expect(luckyPeople.size).toBe(3);
  });

  it('handles nothing to divide among', () => {
    expect(allocate(100, [0, 0], 's')).toEqual([0, 0]);
  });
});

describe('computeShares', () => {
  const everyone = members.map((m) => ({ memberId: m.id }));

  it('splits equally, keeping people whose share rounds to zero', () => {
    const result = computeShares(2, 'equal', everyone, 'e1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shares).toHaveLength(4);
      expect(sum(result.shares.map((s) => s.amountMinor))).toBe(2);
    }
  });

  it('needs at least one person', () => {
    expect(computeShares(100, 'equal', [], 'e1')).toEqual({ ok: false, reason: 'no_people' });
    expect(computeShares(100, 'shares', [{ memberId: 'a', input: 0 }], 'e1')).toEqual({
      ok: false,
      reason: 'no_people',
    });
  });

  it('checks percentages add up to 100', () => {
    const bad = computeShares(
      1000,
      'percent',
      [
        { memberId: 'a', input: 50 },
        { memberId: 'b', input: 45 },
      ],
      'e1',
    );
    expect(bad).toEqual({ ok: false, reason: 'percent_total', remaining: 5 });
    const over = computeShares(1000, 'percent', [{ memberId: 'a', input: 120 }], 'e1');
    expect(over).toEqual({ ok: false, reason: 'percent_total', remaining: -20 });
  });

  it('accepts fractional percentages and rounds exactly', () => {
    const result = computeShares(
      10000,
      'percent',
      [
        { memberId: 'a', input: 33.33 },
        { memberId: 'b', input: 33.33 },
        { memberId: 'c', input: 33.34 },
      ],
      'e1',
    );
    expect(result).toMatchObject({
      ok: true,
      shares: [
        { memberId: 'a', amountMinor: 3333, input: 33.33 },
        { memberId: 'b', amountMinor: 3333, input: 33.33 },
        { memberId: 'c', amountMinor: 3334, input: 33.34 },
      ],
    });
  });

  it('checks exact amounts add up, and reports what is left', () => {
    const short = computeShares(1000, 'exact', [{ memberId: 'a', input: 400 }], 'e1');
    expect(short).toEqual({ ok: false, reason: 'exact_total', remaining: 600 });
    const over = computeShares(1000, 'exact', [{ memberId: 'a', input: 1200 }], 'e1');
    expect(over).toEqual({ ok: false, reason: 'exact_total', remaining: -200 });
    const fine = computeShares(
      1000,
      'exact',
      [
        { memberId: 'a', input: 400 },
        { memberId: 'b', input: 600 },
        { memberId: 'c', input: 0 },
      ],
      'e1',
    );
    expect(fine).toMatchObject({ ok: true, shares: [{ memberId: 'a' }, { memberId: 'b' }] });
  });

  it('weights by shares: a couple counts as two', () => {
    const result = computeShares(
      9000,
      'shares',
      [
        { memberId: 'a', input: 2 },
        { memberId: 'b', input: 1 },
      ],
      'e1',
    );
    expect(result).toMatchObject({
      ok: true,
      shares: [
        { memberId: 'a', amountMinor: 6000, input: 2 },
        { memberId: 'b', amountMinor: 3000, input: 1 },
      ],
    });
  });

  it('refuses a weight too large to keep the maths exact', () => {
    expect(computeShares(100, 'shares', [{ memberId: 'a', input: 101 }], 'e1')).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('does not depend on the order people are listed in', () => {
    const forward = computeShares(100, 'equal', everyone, 'e1');
    const backward = computeShares(100, 'equal', [...everyone].reverse(), 'e1');
    expect(backward).toEqual(forward);
  });

  it('always produces a record the schema accepts', () => {
    const next = random(11);
    for (let run = 0; run < 200; run++) {
      const amountMinor = 1 + next(1_000_000);
      const mode = run % 2 === 0 ? ('equal' as const) : ('shares' as const);
      const people = members.slice(0, 1 + next(4)).map((m) => ({ memberId: m.id, input: 1 + next(5) }));
      const result = computeShares(amountMinor, mode, people, `e${run}`);
      if (!result.ok) throw new Error(result.reason);
      const parsed = ExpenseSchema.safeParse({
        ...expense(`e${run}`, amountMinor, 'a', []),
        splitMode: mode,
        shares: result.shares,
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('netBalances', () => {
  it('credits the payer and charges each share', () => {
    const net = netBalances(
      ledger({
        expenses: [
          expense('dinner', 3000, 'a', [
            ['a', 1000],
            ['b', 1000],
            ['c', 1000],
          ]),
        ],
      }),
    );
    expect(Object.fromEntries(net)).toEqual({ a: 2000, b: -1000, c: -1000 });
  });

  it('applies payments in the right direction', () => {
    const net = netBalances(
      ledger({
        expenses: [
          expense('dinner', 2000, 'a', [
            ['a', 1000],
            ['b', 1000],
          ]),
        ],
        settlements: [
          { id: 's', fromId: 'b', toId: 'a', amountMinor: 400, paidOn: '2026-11-06', createdAt: 1 },
        ],
      }),
    );
    expect(Object.fromEntries(net)).toEqual({ a: 600, b: -600 });
  });

  it('forgets an expense once it is gone', () => {
    const dinner = expense('dinner', 2000, 'a', [['b', 2000]]);
    const withDinner = ledger({ expenses: [dinner] });
    const withoutDinner = ledger({ expenses: withDinner.expenses.filter((e) => e.id !== 'dinner') });
    expect(netBalances(withoutDinner).size).toBe(0);
  });

  it('always nets to zero across the group', () => {
    const next = random(3);
    for (let run = 0; run < 100; run++) {
      const expenses = Array.from({ length: 1 + next(20) }, (_, i) => {
        const amountMinor = 1 + next(500000);
        const result = computeShares(
          amountMinor,
          'equal',
          members.slice(0, 1 + next(4)).map((m) => ({ memberId: m.id })),
          `e${i}`,
        );
        if (!result.ok) throw new Error(result.reason);
        return { ...expense(`e${i}`, amountMinor, members[next(4)].id, []), shares: result.shares };
      });
      expect(sum([...netBalances(ledger({ expenses })).values()])).toBe(0);
    }
  });
});

describe('suggestPayments', () => {
  const settleAll = (net: Map<string, number>) => {
    const after = new Map(net);
    for (const p of suggestPayments(net)) {
      after.set(p.fromId, (after.get(p.fromId) ?? 0) + p.amountMinor);
      after.set(p.toId, (after.get(p.toId) ?? 0) - p.amountMinor);
    }
    return after;
  };

  it('has nothing to suggest when everyone is even', () => {
    expect(suggestPayments(new Map())).toEqual([]);
    expect(suggestPayments(new Map([['a', 0]]))).toEqual([]);
  });

  it('pays the biggest creditor first', () => {
    expect(
      suggestPayments(
        new Map([
          ['a', 7000],
          ['b', 1000],
          ['c', -8000],
        ]),
      ),
    ).toEqual([
      { fromId: 'c', toId: 'a', amountMinor: 7000 },
      { fromId: 'c', toId: 'b', amountMinor: 1000 },
    ]);
  });

  it('cancels a cycle of debts completely', () => {
    expect(
      suggestPayments(
        new Map([
          ['a', 0],
          ['b', 0],
          ['c', 0],
        ]),
      ),
    ).toEqual([]);
  });

  it('clears every balance in at most n-1 payments', () => {
    const next = random(21);
    for (let run = 0; run < 300; run++) {
      const size = 2 + next(10);
      const values = Array.from({ length: size - 1 }, () => next(200000) - 100000);
      values.push(-sum(values));
      const net = new Map(values.map((v, i) => [`m${i}`, v]));
      const payments = suggestPayments(net);
      expect(payments.length).toBeLessThanOrEqual(size - 1);
      expect(payments.every((p) => p.amountMinor > 0)).toBe(true);
      expect([...settleAll(net).values()].every((v) => v === 0)).toBe(true);
    }
  });
});

describe('activity costs', () => {
  const scuba: Expense = {
    ...expense('scuba', 9000, 'b', [
      ['a', 3000],
      ['b', 3000],
      ['c', 3000],
    ]),
    stop: { placeId: 'p1', name: 'Scuba Centre' },
  };

  it('totals what was logged at a stop, and this phone owner’s part', () => {
    const costs = stopCosts(ledger({ expenses: [scuba, expense('taxi', 500, 'a', [['a', 500]])] }), 'p1');
    expect(costs.expenses).toEqual([scuba]);
    expect(costs.totalMinor).toBe(9000);
    expect(costs.selfShareMinor).toBe(3000);
  });

  it('is empty before a ledger exists', () => {
    expect(stopCosts(undefined, 'p1')).toEqual({ expenses: [], totalMinor: 0, selfShareMinor: undefined });
  });

  it('remembers who took part last time', () => {
    const later: Expense = {
      ...expense('gear', 1000, 'b', [
        ['b', 500],
        ['c', 500],
      ]),
      stop: scuba.stop,
      createdAt: 2,
    };
    expect(lastParticipants(ledger({ expenses: [scuba, later] }), 'p1')).toEqual(['b', 'c']);
    expect(lastParticipants(ledger({ expenses: [scuba] }), 'elsewhere')).toBeUndefined();
  });
});

describe('expensesByDay', () => {
  it('groups by date, newest first, with day totals', () => {
    const groups = expensesByDay([
      { ...expense('a', 100, 'a', [['a', 100]]), spentOn: '2026-11-05' },
      { ...expense('b', 200, 'a', [['a', 200]]), spentOn: '2026-11-06', createdAt: 1 },
      { ...expense('c', 300, 'a', [['a', 300]]), spentOn: '2026-11-06', createdAt: 2 },
    ]);
    expect(groups.map((g) => [g.day, g.totalMinor])).toEqual([
      ['2026-11-06', 500],
      ['2026-11-05', 100],
    ]);
    expect(groups[0].expenses.map((e) => e.id)).toEqual(['c', 'b']);
  });
});

describe('member helpers', () => {
  const data = ledger({
    expenses: [expense('x', 1000, 'a', [['b', 1000]])],
    settlements: [{ id: 's', fromId: 'c', toId: 'a', amountMinor: 1, paidOn: '2026-11-06', createdAt: 1 }],
  });

  it('knows who is referenced by an entry', () => {
    expect(memberInUse(data, 'a')).toBe(true);
    expect(memberInUse(data, 'b')).toBe(true);
    expect(memberInUse(data, 'c')).toBe(true);
    expect(memberInUse(data, 'd')).toBe(false);
  });

  it('reports paid, share and net per person', () => {
    expect(memberTotals(data).map((t) => [t.member.id, t.paid, t.share, t.net])).toEqual([
      ['a', 1000, 0, 999],
      ['b', 0, 1000, -1000],
      ['c', 0, 0, 1],
      ['d', 0, 0, 0],
    ]);
  });

  it('words a payment correctly for the phone owner', () => {
    expect(paymentLabel(members[0], members[1])).toBe('You pay Bilal');
    expect(paymentLabel(members[1], members[0])).toBe('Bilal pays you');
    expect(paidLabel(members[1], members[0])).toBe('Bilal paid you');
    expect(paidLabel(members[0], members[1])).toBe('You paid Bilal');
    expect(paymentLabel(undefined, members[1])).toBe('Someone pays Bilal');
  });
});

describe('ledgerAsText', () => {
  it('uses real names and lists the payments', () => {
    const text = ledgerAsText(
      'Goa',
      ledger({
        expenses: [
          expense('stay', 4000, 'a', [
            ['a', 2000],
            ['b', 2000],
          ]),
        ],
        members: members.slice(0, 2),
      }),
    );
    expect(text).toContain('Goa: $40 spent');
    expect(text).toContain('Asha: paid $40, share $20');
    expect(text).toContain('Bilal pays Asha $20');
    expect(text).not.toContain('You');
  });

  it('says so when nothing is owed', () => {
    expect(ledgerAsText('Goa', ledger({}))).toContain('All settled up');
  });
});

describe('tripDeleteMessage', () => {
  const owed = expense('stay', 4000, 'a', [
    ['a', 2000],
    ['b', 2000],
  ]);
  const even = expense('solo', 4000, 'a', [['a', 4000]]);

  it('stays simple with nothing logged', () => {
    expect(tripDeleteMessage(undefined)).toBe('Your saved spots stay saved.');
    expect(tripDeleteMessage(ledger({}))).toBe('Your saved spots stay saved.');
  });

  it('warns about costs, and more when someone still owes', () => {
    expect(tripDeleteMessage(ledger({ expenses: [even] }))).toBe(
      'This also deletes 1 logged cost. Your saved spots stay saved.',
    );
    expect(tripDeleteMessage(ledger({ expenses: [owed, even] }))).toBe(
      'This also deletes 2 logged costs, and the group hasn’t settled up yet. Your saved spots stay saved.',
    );
  });
});
