import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Expense, Member } from '@/domain/models';
import { sanitizeLedgers, useAppStore, useLedgerStore } from '@/store';

const asha: Member = { id: 'a', name: 'Asha', isSelf: true };
const bilal: Member = { id: 'b', name: 'Bilal' };
const chen: Member = { id: 'c', name: 'Chen' };

const dinner: Omit<Expense, 'createdAt' | 'updatedAt'> = {
  id: 'e1',
  title: 'Dinner',
  category: 'food',
  spentOn: '2026-11-06',
  amountMinor: 2000,
  payers: [{ memberId: 'a', amountMinor: 2000 }],
  splitMode: 'equal',
  shares: [
    { memberId: 'a', amountMinor: 1000 },
    { memberId: 'b', amountMinor: 1000 },
  ],
};

const store = () => useLedgerStore.getState();

beforeEach(() => {
  useAppStore.getState().reset();
  store().saveSetup('t1', { currency: 'INR', members: [asha, bilal] });
});

describe('expenses', () => {
  it('adds, then updates by id without duplicating', () => {
    store().saveExpense('t1', dinner);
    const created = store().ledgers.t1.expenses[0];
    store().saveExpense('t1', { ...dinner, title: 'Late dinner' });
    const { expenses } = store().ledgers.t1;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].title).toBe('Late dinner');
    expect(expenses[0].createdAt).toBe(created.createdAt);
  });

  it('removes', () => {
    store().saveExpense('t1', dinner);
    store().removeExpense('t1', 'e1');
    expect(store().ledgers.t1.expenses).toEqual([]);
  });

  it('ignores a trip with no ledger', () => {
    store().saveExpense('nope', dinner);
    expect(store().ledgers.nope).toBeUndefined();
  });
});

describe('saveSetup', () => {
  it('adds and renames people', () => {
    store().saveSetup('t1', { currency: 'INR', members: [asha, { ...bilal, name: 'Bil' }, chen] });
    expect(store().ledgers.t1.members.map((m) => m.name)).toEqual(['Asha', 'Bil', 'Chen']);
  });

  it('can drop someone who has no entries', () => {
    store().saveSetup('t1', { currency: 'INR', members: [asha] });
    expect(store().ledgers.t1.members).toEqual([asha]);
  });

  it('keeps anyone an entry refers to', () => {
    store().saveExpense('t1', dinner);
    store().saveSetup('t1', { currency: 'INR', members: [asha] });
    expect(store().ledgers.t1.members.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('only changes currency while there is nothing to convert', () => {
    store().saveSetup('t1', { currency: 'USD', members: [asha, bilal] });
    expect(store().ledgers.t1.currency).toBe('USD');
    store().saveExpense('t1', dinner);
    store().saveSetup('t1', { currency: 'EUR', members: [asha, bilal] });
    expect(store().ledgers.t1.currency).toBe('USD');
  });
});

describe('applyLookedUpRate', () => {
  const baht = (rateSource: 'auto' | 'cached' | 'manual') => ({
    ...dinner,
    original: { amountMinor: 800, currency: 'THB', rate: 2.5, rateDate: '2026-11-01', rateSource },
  });

  it('replaces a saved rate and updates the amounts', () => {
    store().saveExpense('t1', baht('cached'));
    store().applyLookedUpRate('t1', 'e1', 3, '2026-11-06');
    const [saved] = store().ledgers.t1.expenses;
    expect(saved.amountMinor).toBe(2400);
    expect(saved.original).toMatchObject({ rate: 3, rateSource: 'auto', rateDate: '2026-11-06' });
    expect(saved.payers).toEqual([{ memberId: 'a', amountMinor: 2400 }]);
  });

  it.each(['auto', 'manual'] as const)('never changes a rate that is %s', (source) => {
    store().saveExpense('t1', baht(source));
    store().applyLookedUpRate('t1', 'e1', 3, '2026-11-06');
    expect(store().ledgers.t1.expenses[0].amountMinor).toBe(2000);
  });

  it('does not bring back an expense deleted while the lookup was running', () => {
    store().saveExpense('t1', baht('cached'));
    store().removeExpense('t1', 'e1');
    store().applyLookedUpRate('t1', 'e1', 3, '2026-11-06');
    expect(store().ledgers.t1.expenses).toEqual([]);
  });
});

describe('settlements', () => {
  it('records and removes a payment', () => {
    const id = store().addSettlement('t1', {
      fromId: 'b',
      toId: 'a',
      amountMinor: 500,
      paidOn: '2026-11-06',
    });
    expect(store().ledgers.t1.settlements[0]).toMatchObject({ id, amountMinor: 500 });
    store().removeSettlement('t1', id);
    expect(store().ledgers.t1.settlements).toEqual([]);
  });
});

describe('with the rest of the app', () => {
  it('deleting a trip deletes its ledger', () => {
    const tripId = useAppStore.getState().createTrip({ name: 'Goa', city: 'Goa', placeIds: [], days: 1 });
    store().saveSetup(tripId, { currency: 'INR', members: [asha] });
    useAppStore.getState().removeTrip(tripId);
    expect(store().ledgers[tripId]).toBeUndefined();
    expect(store().ledgers.t1).toBeDefined();
  });

  it('resetting the app clears ledgers', () => {
    useAppStore.getState().reset();
    expect(store().ledgers).toEqual({});
  });

  it('deleting a saved place keeps the cost and its name', () => {
    const [placeId] = useAppStore
      .getState()
      .addPlaces([{ name: 'Scuba', lat: 1, lng: 1, category: 'activity', sourcePlatform: 'manual' }]);
    store().saveExpense('t1', { ...dinner, stop: { placeId, name: 'Scuba' } });
    useAppStore.getState().removePlace(placeId);
    expect(store().ledgers.t1.expenses[0].stop).toEqual({ placeId, name: 'Scuba' });
  });
});

describe('sanitizeLedgers', () => {
  const valid = { ...dinner, createdAt: 1, updatedAt: 1 };
  const header = { tripId: 't', currency: 'INR', createdAt: 1 };

  it('handles empty or garbage storage', () => {
    expect(sanitizeLedgers(undefined)).toEqual({});
    expect(sanitizeLedgers('garbage')).toEqual({});
    expect(sanitizeLedgers({ ledgers: 'nope' })).toEqual({});
  });

  it('drops expenses that do not balance, and keeps the good ones', () => {
    const result = sanitizeLedgers({
      ledgers: {
        t: {
          ...header,
          members: [asha, { name: 'no id' }],
          expenses: [
            valid,
            { ...valid, id: 'bad', amountMinor: 1999 },
            { ...valid, id: 'float', amountMinor: 20.5 },
          ],
          settlements: 'not an array',
        },
      },
    });
    expect(result.ledgers?.t.members).toEqual([asha]);
    expect(result.ledgers?.t.expenses.map((e) => e.id)).toEqual(['e1']);
    expect(result.ledgers?.t.settlements).toEqual([]);
  });

  it('keeps a cost paid in another currency, and drops one with a bad rate', () => {
    const original = {
      amountMinor: 800,
      currency: 'THB',
      rate: 2.5,
      rateDate: '2026-11-01',
      rateSource: 'auto',
    };
    const result = sanitizeLedgers({
      ledgers: {
        t: {
          ...header,
          members: [asha],
          expenses: [
            { ...valid, original },
            { ...valid, id: 'bad', original: { ...original, rate: 0 } },
          ],
        },
      },
    });
    expect(result.ledgers?.t.expenses.map((e) => e.id)).toEqual(['e1']);
    expect(result.ledgers?.t.expenses[0].original).toEqual(original);
  });

  it('drops a ledger with no people, a bad header, or the wrong key', () => {
    const result = sanitizeLedgers({
      ledgers: {
        t: { ...header, members: [] },
        u: { ...header, tripId: 'u', currency: 'rupees', members: [asha] },
        v: { ...header, members: [asha] },
      },
    });
    expect(result.ledgers).toEqual({});
  });
});
