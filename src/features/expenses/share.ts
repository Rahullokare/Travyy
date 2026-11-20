import type { TripLedger } from '@/domain/models';
import { formatMoney } from '@/domain/money';
import { memberTotals, netBalances, suggestPayments, totalSpent } from './ledger';

/** Plain-text summary for the group chat. Uses real names: "You" would mean someone else there. */
export function ledgerAsText(tripName: string, ledger: TripLedger): string {
  const money = (minor: number) => formatMoney(minor, ledger.currency);
  const name = (id: string) => ledger.members.find((m) => m.id === id)?.name ?? 'Someone';

  const people = memberTotals(ledger).map(
    ({ member, paid, share }) => `${member.name}: paid ${money(paid)}, share ${money(share)}`,
  );
  const payments = suggestPayments(netBalances(ledger)).map(
    (p) => `${name(p.fromId)} pays ${name(p.toId)} ${money(p.amountMinor)}`,
  );
  return [
    `${tripName}: ${money(totalSpent(ledger.expenses))} spent`,
    people.join('\n'),
    payments.length ? `To settle up\n${payments.join('\n')}` : 'All settled up',
    'Split with Travyy',
  ].join('\n\n');
}

/** What deleting the trip will take with it, for the confirm prompt. */
export function tripDeleteMessage(ledger: TripLedger | undefined): string {
  const keeps = 'Your saved spots stay saved.';
  const count = ledger?.expenses.length ?? 0;
  if (!ledger || count === 0) return keeps;
  const costs = `This also deletes ${count} logged ${count === 1 ? 'cost' : 'costs'}`;
  const unsettled = suggestPayments(netBalances(ledger)).length > 0;
  return `${costs}${unsettled ? ', and the group hasn’t settled up yet' : ''}. ${keeps}`;
}
