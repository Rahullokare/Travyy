import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Expense, Member, Settlement, Trip, TripLedger } from '@/domain/models';
import { formatMoney } from '@/domain/money';
import { confirm, haptics } from '@/shared/lib/platform';
import { CONTENT_MAX_WIDTH, makeStyles, spacing } from '@/shared/theme';
import { Button, Card, Chip, EmptyState, Icon, ScreenScroll, Section, Text } from '@/shared/ui';
import { useLedgerStore } from '@/store';
import { EXPENSE_CATEGORY_META } from '../categories';
import { formatDay } from '../dates';
import {
  displayName,
  expensesByDay,
  hasProvisionalRate,
  memberTotals,
  netBalances,
  paidLabel,
  paymentLabel,
  selfMember,
  settlementsNewestFirst,
  suggestPayments,
  totalSpent,
} from '../ledger';

export function TripMoney({ trip }: { trip: Trip }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const ledger = useLedgerStore((s) => s.ledgers[trip.id]);

  if (!ledger) {
    return (
      <EmptyState
        emoji="💸"
        title="Split this trip's costs"
        body="Add who's coming, log what each person pays, and see who owes whom. No sign-up, works offline."
        action={
          <Button
            title="Add people"
            onPress={() => router.push({ pathname: '/trip/[id]/people', params: { id: trip.id } })}
          />
        }
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenScroll contentStyle={styles.content}>
        <LedgerBody ledger={ledger} />
      </ScreenScroll>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button
          title="Add expense"
          style={styles.footerButton}
          icon={<Icon name="add" size={18} color="onPrimary" />}
          onPress={() => router.push({ pathname: '/trip/[id]/expense', params: { id: trip.id } })}
        />
      </View>
    </View>
  );
}

function LedgerBody({ ledger }: { ledger: TripLedger }) {
  const { tripId, currency, members, expenses, settlements } = ledger;
  const money = (minor: number) => formatMoney(minor, currency);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const payments = useMemo(() => suggestPayments(netBalances(ledger)), [ledger]);
  const totals = useMemo(() => memberTotals(ledger), [ledger]);
  const days = useMemo(() => expensesByDay(expenses), [expenses]);

  if (expenses.length === 0 && settlements.length === 0) {
    return (
      <EmptyState
        emoji="🧾"
        title="No costs yet"
        body="Add the first one here, or use “Add cost” on any stop in your plan."
      />
    );
  }

  return (
    <>
      <SummaryCard ledger={ledger} />

      {payments.length > 0 ? (
        <Section title="To settle up">
          <Card>
            {payments.map((p) => (
              <View key={`${p.fromId}-${p.toId}`} style={rowStyle}>
                <View style={flexStyle}>
                  <Text>{paymentLabel(byId.get(p.fromId), byId.get(p.toId))}</Text>
                  <Text variant="bodyStrong" style={tabular}>
                    {money(p.amountMinor)}
                  </Text>
                </View>
                <Chip
                  label="Record"
                  onPress={() =>
                    router.push({
                      pathname: '/trip/[id]/payment',
                      params: { id: tripId, from: p.fromId, to: p.toId, amount: String(p.amountMinor) },
                    })
                  }
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="People">
        <Card>
          {totals.map(({ member, paid, share, net }) => (
            <View key={member.id} style={rowStyle}>
              <View style={flexStyle}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {displayName(member)}
                </Text>
                <Text variant="caption" style={tabular}>
                  Paid {money(paid)} · Share {money(share)}
                </Text>
              </View>
              <NetLabel member={member} net={net} money={money} />
            </View>
          ))}
        </Card>
      </Section>

      {days.map(({ day, totalMinor, expenses: list }) => (
        <Section key={day} title={`${formatDay(day)} · ${money(totalMinor)}`}>
          <Card style={{ paddingVertical: spacing.xs, paddingHorizontal: 0 }}>
            {list.map((e) => (
              <ExpenseRow key={e.id} expense={e} ledger={ledger} byId={byId} />
            ))}
          </Card>
        </Section>
      ))}

      {settlements.length > 0 ? (
        <Section title="Payments">
          <Card style={{ paddingVertical: spacing.xs, paddingHorizontal: 0 }}>
            {settlementsNewestFirst(settlements).map((s) => (
              <PaymentRow key={s.id} payment={s} tripId={tripId} byId={byId} money={money} />
            ))}
          </Card>
        </Section>
      ) : null}
    </>
  );
}

const rowStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 } as const;
const flexStyle = { flex: 1, gap: 2 } as const;
const tabular = { fontVariant: ['tabular-nums'] } as const;

function SummaryCard({ ledger }: { ledger: TripLedger }) {
  const styles = useStyles();
  const money = (minor: number) => formatMoney(minor, ledger.currency);
  const self = selfMember(ledger.members);
  const net = self ? (netBalances(ledger).get(self.id) ?? 0) : 0;
  return (
    <Card style={styles.summary}>
      <Text variant="label">Total spent</Text>
      <Text variant="stat">{money(totalSpent(ledger.expenses))}</Text>
      {self ? (
        <Text variant="bodyStrong" color={net > 0 ? 'success' : net < 0 ? 'danger' : 'textMuted'}>
          {net > 0 ? `You get back ${money(net)}` : net < 0 ? `You owe ${money(-net)}` : 'You’re all settled'}
        </Text>
      ) : null}
    </Card>
  );
}

function NetLabel({ member, net, money }: { member: Member; net: number; money: (minor: number) => string }) {
  if (net === 0) return <Text variant="caption">Settled</Text>;
  const gets = net > 0;
  const words = gets ? (member.isSelf ? 'get back' : 'gets back') : member.isSelf ? 'owe' : 'owes';
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text variant="caption">{words}</Text>
      <Text variant="bodyStrong" color={gets ? 'success' : 'danger'} style={tabular}>
        {money(Math.abs(net))}
      </Text>
    </View>
  );
}

function ExpenseRow({
  expense,
  ledger,
  byId,
}: {
  expense: Expense;
  ledger: TripLedger;
  byId: ReadonlyMap<string, Member>;
}) {
  const styles = useStyles();
  const meta = EXPENSE_CATEGORY_META[expense.category];
  const payer = byId.get(expense.payers[0]?.memberId ?? '');
  const self = selfMember(ledger.members);
  const yourShare = expense.shares.find((s) => s.memberId === self?.id)?.amountMinor;
  const people = expense.shares.length;
  const details = [
    `${displayName(payer)} paid`,
    `${people} ${people === 1 ? 'person' : 'people'}`,
    expense.stop && expense.stop.name !== expense.title ? expense.stop.name : undefined,
    expense.original
      ? `${formatMoney(expense.original.amountMinor, expense.original.currency)}${hasProvisionalRate(expense) ? ' (rate may update)' : ''}`
      : undefined,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expense.title}, ${formatMoney(expense.amountMinor, ledger.currency)}`}
      onPress={() =>
        router.push({ pathname: '/trip/[id]/expense', params: { id: ledger.tripId, expenseId: expense.id } })
      }
      style={({ pressed }) => [styles.expense, pressed && styles.pressed]}
    >
      <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
        <Text style={styles.emoji}>{expense.stop ? '📍' : meta.emoji}</Text>
      </View>
      <View style={flexStyle}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {expense.title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {details.join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="bodyStrong" style={tabular}>
          {formatMoney(expense.amountMinor, ledger.currency)}
        </Text>
        {yourShare !== undefined ? (
          <Text variant="caption" style={tabular}>
            You {formatMoney(yourShare, ledger.currency)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function PaymentRow({
  payment,
  tripId,
  byId,
  money,
}: {
  payment: Settlement;
  tripId: string;
  byId: ReadonlyMap<string, Member>;
  money: (minor: number) => string;
}) {
  const styles = useStyles();
  const removeSettlement = useLedgerStore((s) => s.removeSettlement);
  const label = paidLabel(byId.get(payment.fromId), byId.get(payment.toId));
  const onPress = async () => {
    if (
      await confirm({
        title: 'Delete this payment?',
        message: `${label} ${money(payment.amountMinor)} on ${formatDay(payment.paidOn)}. The balances will go back.`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      removeSettlement(tripId, payment.id);
      haptics.selection();
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${money(payment.amountMinor)}`}
      accessibilityHint="Opens a prompt to delete it"
      onPress={onPress}
      style={({ pressed }) => [styles.expense, pressed && styles.pressed]}
    >
      <View style={[styles.badge, styles.paymentBadge]}>
        <Icon name="swap-horizontal" size={20} color="accent" />
      </View>
      <View style={flexStyle}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption">{formatDay(payment.paidOn)}</Text>
      </View>
      <Text variant="bodyStrong" style={tabular}>
        {money(payment.amountMinor)}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  summary: { gap: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  footerButton: { width: '100%', maxWidth: CONTENT_MAX_WIDTH - spacing.xl, alignSelf: 'center' },
  expense: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  pressed: { backgroundColor: t.colors.surfacePressed },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  paymentBadge: { backgroundColor: t.colors.accentSoft },
  emoji: { fontSize: 20, lineHeight: 26 },
}));
