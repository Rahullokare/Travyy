import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Expense, Member, Settlement, Trip, TripLedger } from '@/domain/models';
import { formatMoney } from '@/domain/money';
import { confirm, haptics } from '@/shared/lib/platform';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  IconBadge,
  Pill,
  ScreenScroll,
  Section,
  Text,
} from '@/shared/ui';
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
        icon="wallet"
        title="Split this trip's costs"
        body="Add who's coming, log what each person pays, and see who owes whom. No sign-up, works offline."
        action={
          <Button
            title="Add people"
            iconName="person-add"
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
          iconName="add"
          style={styles.footerButton}
          onPress={() => router.push({ pathname: '/trip/[id]/expense', params: { id: trip.id } })}
        />
      </View>
    </View>
  );
}

function LedgerBody({ ledger }: { ledger: TripLedger }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const { tripId, currency, members, expenses, settlements } = ledger;
  const money = (minor: number) => formatMoney(minor, currency);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const payments = useMemo(() => suggestPayments(netBalances(ledger)), [ledger]);
  const totals = useMemo(() => memberTotals(ledger), [ledger]);
  const days = useMemo(() => expensesByDay(expenses), [expenses]);

  if (expenses.length === 0 && settlements.length === 0) {
    return (
      <EmptyState
        icon="receipt-outline"
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
          <View style={[styles.group, lift(dark)]}>
            {payments.map((p, i) => {
              const from = byId.get(p.fromId);
              const to = byId.get(p.toId);
              return (
                <View key={`${p.fromId}-${p.toId}`} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <View style={styles.pair}>
                    <Avatar name={from?.name ?? '?'} seed={p.fromId} size={34} />
                    <View style={styles.pairArrow}>
                      <Icon name="arrow-forward" size={12} color="textSubtle" />
                    </View>
                    <Avatar name={to?.name ?? '?'} seed={p.toId} size={34} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="callout" numberOfLines={1}>
                      {paymentLabel(from, to)}
                    </Text>
                    <Text variant="heading" style={styles.tabular}>
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
              );
            })}
          </View>
        </Section>
      ) : null}

      <Section title="People">
        <View style={[styles.group, lift(dark)]}>
          {totals.map(({ member, paid, share, net }, i) => (
            <View key={member.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Avatar name={member.name} seed={member.id} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {member.isSelf ? `${member.name} (you)` : member.name}
                </Text>
                <Text variant="caption" style={styles.tabular}>
                  Paid {money(paid)} · Share {money(share)}
                </Text>
              </View>
              <NetLabel member={member} net={net} money={money} />
            </View>
          ))}
        </View>
      </Section>

      {days.map(({ day, totalMinor, expenses: list }) => (
        <View key={day} style={styles.day}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{formatDay(day)}</Text>
            <Text variant="caption" style={styles.tabular}>
              {money(totalMinor)}
            </Text>
          </View>
          <View style={[styles.group, lift(dark)]}>
            {list.map((e, i) => (
              <ExpenseRow key={e.id} expense={e} ledger={ledger} byId={byId} divider={i > 0} />
            ))}
          </View>
        </View>
      ))}

      {settlements.length > 0 ? (
        <Section title="Payments">
          <View style={[styles.group, lift(dark)]}>
            {settlementsNewestFirst(settlements).map((s, i) => (
              <PaymentRow key={s.id} payment={s} tripId={tripId} byId={byId} money={money} divider={i > 0} />
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}

function SummaryCard({ ledger }: { ledger: TripLedger }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const money = (minor: number) => formatMoney(minor, ledger.currency);
  const self = selfMember(ledger.members);
  const net = self ? (netBalances(ledger).get(self.id) ?? 0) : 0;
  const count = ledger.expenses.length;
  return (
    <View style={[styles.summary, lift(dark)]}>
      <Text variant="overline" color="textMuted">
        Total spent
      </Text>
      <Text variant="stat" style={styles.statBig}>
        {money(totalSpent(ledger.expenses))}
      </Text>
      <Text variant="caption">
        {count} expense{count === 1 ? '' : 's'} · {ledger.members.length} people · {ledger.currency}
      </Text>
      {self ? (
        <View style={styles.summaryStatus}>
          {net > 0 ? (
            <Pill tone="success" icon="arrow-down" label={`You get back ${money(net)}`} />
          ) : net < 0 ? (
            <Pill tone="danger" icon="arrow-up" label={`You owe ${money(-net)}`} />
          ) : (
            <Pill tone="neutral" icon="checkmark" label="You're all settled" />
          )}
        </View>
      ) : null}
    </View>
  );
}

function NetLabel({ member, net, money }: { member: Member; net: number; money: (minor: number) => string }) {
  const styles = useStyles();
  if (net === 0) return <Pill label="Settled" icon="checkmark" tone="neutral" />;
  const gets = net > 0;
  const words = gets ? (member.isSelf ? 'get back' : 'gets back') : member.isSelf ? 'owe' : 'owes';
  return (
    <View style={styles.end}>
      <Text variant="caption">{words}</Text>
      <Text variant="bodyStrong" color={gets ? 'success' : 'danger'} style={styles.tabular}>
        {money(Math.abs(net))}
      </Text>
    </View>
  );
}

function ExpenseRow({
  expense,
  ledger,
  byId,
  divider,
}: {
  expense: Expense;
  ledger: TripLedger;
  byId: ReadonlyMap<string, Member>;
  divider: boolean;
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
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.pressed]}
    >
      <IconBadge icon={expense.stop ? 'location' : meta.icon} color={meta.color} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {expense.title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {details.join(' · ')}
        </Text>
      </View>
      <View style={styles.end}>
        <Text variant="bodyStrong" style={styles.tabular}>
          {formatMoney(expense.amountMinor, ledger.currency)}
        </Text>
        {yourShare !== undefined ? (
          <Text variant="caption" style={styles.tabular}>
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
  divider,
}: {
  payment: Settlement;
  tripId: string;
  byId: ReadonlyMap<string, Member>;
  money: (minor: number) => string;
  divider: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
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
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.pressed]}
    >
      <IconBadge icon="swap-horizontal" color={colors.accent} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption">{formatDay(payment.paidOn)}</Text>
      </View>
      <Text variant="bodyStrong" style={styles.tabular}>
        {money(payment.amountMinor)}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, gap: 2 },
  content: { paddingBottom: spacing.xxl },
  tabular: { fontVariant: ['tabular-nums'] },
  end: { alignItems: 'flex-end', gap: 2 },
  summary: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: 6,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  statBig: { fontSize: 38, lineHeight: 46, letterSpacing: -1.4 },
  summaryStatus: { marginTop: 8 },
  group: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  pressed: { backgroundColor: t.colors.surfacePressed },
  pair: { flexDirection: 'row', alignItems: 'center' },
  pairArrow: {
    marginHorizontal: -2,
    zIndex: 1,
    padding: 2,
    borderRadius: 8,
    backgroundColor: t.colors.surface,
  },
  day: { gap: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  dayTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.1, color: t.colors.text },
  footer: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  footerButton: { width: '100%', maxWidth: CONTENT_MAX_WIDTH - spacing.xl, alignSelf: 'center' },
}));
