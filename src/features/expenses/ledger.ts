import type { Expense, ExpenseShare, Member, Settlement, SplitMode, TripLedger } from '@/domain/models';

/**
 * The maths behind a trip's shared costs, as plain functions. Balances are always worked out
 * from the expenses and payments, never stored, so an edit or delete can't leave one stale.
 */

type Entries = Pick<TripLedger, 'expenses' | 'settlements'>;

/** A stable number from an id, so the same expense always rounds the same way. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Divide `total` in proportion to integer `weights`, summing to exactly `total`. Leftover units
 * go to the largest remainders; ties rotate with `seed`, so one person doesn't absorb every
 * spare paisa across a trip.
 */
export function allocate(total: number, weights: number[], seed: string): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return weights.map(() => 0);
  const amounts = weights.map((w) => Math.floor((total * w) / sum));
  const remainders = weights.map((w) => (total * w) % sum);
  let leftover = total - amounts.reduce((s, a) => s + a, 0);

  const offset = hash(seed) % weights.length;
  const turn = (i: number) => (i - offset + weights.length) % weights.length;
  const order = weights.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a] || turn(a) - turn(b));
  for (const i of order) {
    if (leftover === 0) break;
    if (remainders[i] === 0) continue;
    amounts[i] += 1;
    leftover -= 1;
  }
  return amounts;
}

export interface SplitParticipant {
  memberId: string;
  /** Exact: minor units. Percent: 0 to 100. Shares: a weight such as 1 or 1.5. Equal: unused. */
  input?: number;
}

export type SplitResult =
  | { ok: true; shares: ExpenseShare[] }
  | { ok: false; reason: 'no_people' | 'too_large' }
  /** `remaining` is what's left to assign: minor units, or percentage points. Negative when over. */
  | { ok: false; reason: 'exact_total' | 'percent_total'; remaining: number };

/** Two decimal places of precision for percentages and share weights. */
const WEIGHT_SCALE = 100;
const MAX_WEIGHT = 100 * WEIGHT_SCALE;

export function computeShares(
  amountMinor: number,
  mode: SplitMode,
  participants: SplitParticipant[],
  seed: string,
): SplitResult {
  // Sorted by id so the result doesn't depend on the order people are listed in.
  const sorted = [...participants].sort((a, b) => (a.memberId < b.memberId ? -1 : 1));

  if (mode === 'exact') {
    const people = sorted.filter((p) => (p.input ?? 0) > 0);
    const remaining = amountMinor - people.reduce((s, p) => s + (p.input ?? 0), 0);
    if (remaining !== 0 || people.length === 0) return { ok: false, reason: 'exact_total', remaining };
    return {
      ok: true,
      shares: people.map((p) => ({ memberId: p.memberId, amountMinor: p.input ?? 0, input: p.input })),
    };
  }

  const scaled = (p: SplitParticipant) => (mode === 'equal' ? 1 : Math.round((p.input ?? 0) * WEIGHT_SCALE));
  const people = sorted.filter((p) => scaled(p) > 0);
  if (mode === 'percent') {
    const total = people.reduce((s, p) => s + scaled(p), 0);
    if (total !== 100 * WEIGHT_SCALE)
      return { ok: false, reason: 'percent_total', remaining: (100 * WEIGHT_SCALE - total) / WEIGHT_SCALE };
  }
  if (people.length === 0) return { ok: false, reason: 'no_people' };
  if (people.some((p) => scaled(p) > MAX_WEIGHT)) return { ok: false, reason: 'too_large' };

  const amounts = allocate(amountMinor, people.map(scaled), seed);
  return {
    ok: true,
    shares: people.map((p, i) => ({
      memberId: p.memberId,
      amountMinor: amounts[i],
      ...(mode === 'equal' ? {} : { input: p.input }),
    })),
  };
}

/** What each person is up or down overall: positive means they're owed money. */
export function netBalances({ expenses, settlements }: Entries): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, amount: number) => net.set(id, (net.get(id) ?? 0) + amount);
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.amountMinor);
    for (const s of e.shares) add(s.memberId, -s.amountMinor);
  }
  for (const s of settlements) {
    add(s.fromId, s.amountMinor);
    add(s.toId, -s.amountMinor);
  }
  return net;
}

export interface MemberTotals {
  member: Member;
  paid: number;
  share: number;
  net: number;
}

export function memberTotals(ledger: TripLedger): MemberTotals[] {
  const net = netBalances(ledger);
  return ledger.members.map((member) => ({
    member,
    paid: sumFor(ledger.expenses, member.id, 'payers'),
    share: sumFor(ledger.expenses, member.id, 'shares'),
    net: net.get(member.id) ?? 0,
  }));
}

function sumFor(expenses: Expense[], memberId: string, side: 'payers' | 'shares'): number {
  return expenses.reduce(
    (total, e) => total + e[side].reduce((s, p) => s + (p.memberId === memberId ? p.amountMinor : 0), 0),
    0,
  );
}

export interface SuggestedPayment {
  fromId: string;
  toId: string;
  amountMinor: number;
}

/**
 * The payments that clear every balance: the biggest debtor pays the biggest creditor, repeated.
 * The true minimum number of payments is NP-hard to find; this is simple, stable and close.
 */
export function suggestPayments(net: ReadonlyMap<string, number>): SuggestedPayment[] {
  const left = [...net.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, amount]) => ({ id, amount }));
  const payments: SuggestedPayment[] = [];
  for (;;) {
    let debtor = left[0];
    let creditor = left[0];
    for (const entry of left) {
      if (entry.amount < debtor.amount) debtor = entry;
      if (entry.amount > creditor.amount) creditor = entry;
    }
    if (!debtor || debtor.amount >= 0 || creditor.amount <= 0) return payments;
    const amountMinor = Math.min(-debtor.amount, creditor.amount);
    payments.push({ fromId: debtor.id, toId: creditor.id, amountMinor });
    debtor.amount += amountMinor;
    creditor.amount -= amountMinor;
  }
}

export function totalSpent(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + e.amountMinor, 0);
}

export function selfMember(members: Member[]): Member | undefined {
  return members.find((m) => m.isSelf);
}

/** The name on screen. Shared text uses `member.name`, because "You" means someone else there. */
export function displayName(member: Member | undefined): string {
  if (!member) return 'Someone';
  return member.isSelf ? 'You' : member.name;
}

/** "You" starts a sentence; mid-sentence it's "you". */
function objectName(member: Member | undefined): string {
  return member?.isSelf ? 'you' : displayName(member);
}

export function paymentLabel(from: Member | undefined, to: Member | undefined): string {
  return `${displayName(from)} ${from?.isSelf ? 'pay' : 'pays'} ${objectName(to)}`;
}

export function paidLabel(from: Member | undefined, to: Member | undefined): string {
  return `${displayName(from)} paid ${objectName(to)}`;
}

export interface StopCosts {
  expenses: Expense[];
  totalMinor: number;
  /** Undefined when nobody on the trip is marked as this phone's owner. */
  selfShareMinor?: number;
}

/** The costs logged against one itinerary stop. */
export function stopCosts(ledger: TripLedger | undefined, placeId: string): StopCosts {
  const expenses = (ledger?.expenses ?? []).filter((e) => e.stop?.placeId === placeId);
  const self = ledger && selfMember(ledger.members);
  return {
    expenses,
    totalMinor: totalSpent(expenses),
    selfShareMinor: self && sumFor(expenses, self.id, 'shares'),
  };
}

/** Who took part the last time a cost was logged here: the likeliest people for the next one. */
export function lastParticipants(ledger: TripLedger, placeId: string): string[] | undefined {
  const last = ledger.expenses.reduce<Expense | undefined>(
    (latest, e) => (e.stop?.placeId === placeId && (!latest || e.createdAt > latest.createdAt) ? e : latest),
    undefined,
  );
  return last?.shares.map((s) => s.memberId);
}

export interface ExpenseDay {
  day: string;
  totalMinor: number;
  expenses: Expense[];
}

/** Expenses by the date they were spent, newest first. */
export function expensesByDay(expenses: Expense[]): ExpenseDay[] {
  const days = new Map<string, Expense[]>();
  for (const e of expenses) days.set(e.spentOn, [...(days.get(e.spentOn) ?? []), e]);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({
      day,
      totalMinor: totalSpent(list),
      expenses: list.sort((a, b) => b.createdAt - a.createdAt),
    }));
}

export function settlementsNewestFirst(settlements: Settlement[]): Settlement[] {
  return [...settlements].sort((a, b) => b.createdAt - a.createdAt);
}

/** A person can only be taken off the trip while nothing refers to them. */
export function memberInUse({ expenses, settlements }: Entries, memberId: string): boolean {
  return (
    expenses.some(
      (e) => e.payers.some((p) => p.memberId === memberId) || e.shares.some((s) => s.memberId === memberId),
    ) || settlements.some((s) => s.fromId === memberId || s.toId === memberId)
  );
}
