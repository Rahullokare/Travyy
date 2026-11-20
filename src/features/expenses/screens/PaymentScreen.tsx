import { Stack } from 'expo-router';
import { useState } from 'react';
import type { Member } from '@/domain/models';
import { formatMoney, minorToInput, parseAmount } from '@/domain/money';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { fontFor, makeStyles, radius } from '@/shared/theme';
import { Button, Chip, ChipRow, EmptyState, ScreenScroll, Section, Text, TextField } from '@/shared/ui';
import { useLedgerStore } from '@/store';
import { localDay } from '../dates';
import { displayName } from '../ledger';
import { closeForm } from '../navigation';

/** Record that someone paid someone back. Travyy only notes it: the money moves outside the app. */
export function PaymentScreen({
  tripId,
  from,
  to,
  amount,
}: {
  tripId: string;
  from?: string;
  to?: string;
  amount?: number;
}) {
  const ledger = useLedgerStore((s) => s.ledgers[tripId]);
  const addSettlement = useLedgerStore((s) => s.addSettlement);
  const styles = useStyles();
  const currency = ledger?.currency ?? 'USD';

  const [fromId, setFromId] = useState(from);
  const [toId, setToId] = useState(to);
  const [amountText, setAmountText] = useState(amount ? minorToInput(amount, currency) : '');

  if (!ledger) return <EmptyState icon="wallet" title="Trip not found" body="It may have been deleted." />;

  const amountMinor = parseAmount(amountText, currency);
  const valid = !!fromId && !!toId && fromId !== toId && !!amountMinor;

  const save = () => {
    if (!valid) return;
    addSettlement(tripId, { fromId, toId, amountMinor, paidOn: localDay() });
    track('payment_recorded', { suggested: !!from });
    haptics.success();
    closeForm(tripId);
  };

  const picker = (selected: string | undefined, onSelect: (id: string) => void, skip?: string) => (
    <ChipRow bleed>
      {ledger.members
        .filter((m: Member) => m.id !== skip)
        .map((m: Member) => (
          <Chip
            key={m.id}
            label={displayName(m)}
            selected={m.id === selected}
            onPress={() => {
              haptics.selection();
              onSelect(m.id);
            }}
          />
        ))}
    </ChipRow>
  );

  return (
    <ScreenScroll automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Record a payment' }} />
      <Section title="Who paid">{picker(fromId, setFromId)}</Section>
      <Section title="Who got it">{picker(toId, setToId, fromId)}</Section>
      <TextField
        label={`Amount (${currency})`}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="0"
        style={styles.amount}
      />
      <Text variant="caption" style={styles.note}>
        {valid
          ? `This takes ${formatMoney(amountMinor, currency)} off what's owed. Pay however you like: cash, UPI, bank.`
          : 'Pay however you like: cash, UPI, bank. This just keeps the balances right.'}
      </Text>
      <Button title="Record payment" iconName="checkmark" disabled={!valid} onPress={save} />
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  amount: {
    fontSize: 28,
    minHeight: 60,
    fontFamily: fontFor('800'),
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  note: { padding: 14, borderRadius: radius.md, backgroundColor: t.colors.surfaceSunken, overflow: 'hidden' },
}));
