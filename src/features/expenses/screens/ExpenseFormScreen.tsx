import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import {
  EXPENSE_CATEGORIES,
  SPLIT_MODES,
  type Expense,
  type OriginalAmount,
  type ExpenseCategory,
  type SplitMode,
  type Trip,
  type TripLedger,
} from '@/domain/models';
import {
  convertMinor,
  CURRENCIES,
  formatMoney,
  impliedRate,
  MAX_AMOUNT_MINOR,
  minorToInput,
  parseAmount,
} from '@/domain/money';
import { track } from '@/shared/lib/analytics';
import { newId } from '@/shared/lib/id';
import { confirm, haptics } from '@/shared/lib/platform';
import { makeStyles, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  ScreenScroll,
  Section,
  Segmented,
  Text,
  TextField,
} from '@/shared/ui';
import { useAppStore, useLedgerStore } from '@/store';
import { useEntryRate } from '../api/rates';
import { EXPENSE_CATEGORY_META, expenseCategoryFor } from '../categories';
import { RatePanel } from '../components/RatePanel';
import { daysAgo, isValidDay, localDay } from '../dates';
import {
  currenciesUsed,
  displayName,
  lastParticipants,
  selfMember,
  splitConverted,
  type SplitResult,
} from '../ledger';
import { closeForm } from '../navigation';

const MODE_LABEL: Record<SplitMode, string> = {
  equal: 'Equally',
  exact: 'Exact',
  percent: 'Percent',
  shares: 'Shares',
};

const SPLIT_OPTIONS = SPLIT_MODES.map((value) => ({ value, label: MODE_LABEL[value] }));

/** Long place names would make a chip wider than the screen. */
function short(name: string): string {
  return name.length > 26 ? `${name.slice(0, 25).trimEnd()}…` : name;
}

function toNumber(text: string): number {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function ExpenseFormScreen({
  tripId,
  expenseId,
  placeId,
}: {
  tripId: string;
  expenseId?: string;
  placeId?: string;
}) {
  const ledger = useLedgerStore((s) => s.ledgers[tripId]);
  const trip = useAppStore((s) => s.trips.find((t) => t.id === tripId));
  const existing = ledger?.expenses.find((e) => e.id === expenseId);

  if (!ledger || !trip || (expenseId && !existing))
    return <EmptyState emoji="💸" title="Not found" body="It may have been deleted." />;
  return <ExpenseForm trip={trip} ledger={ledger} existing={existing} placeId={placeId} />;
}

function ExpenseForm({
  trip,
  ledger,
  existing,
  placeId,
}: {
  trip: Trip;
  ledger: TripLedger;
  existing?: Expense;
  placeId?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const saveExpense = useLedgerStore((s) => s.saveExpense);
  const removeExpense = useLedgerStore((s) => s.removeExpense);
  const places = useAppStore((s) => s.places);
  const { currency, members } = ledger;

  const stops = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    return trip.days.flatMap((d) => d.placeIds).flatMap((pid) => byId.get(pid) ?? []);
  }, [trip, places]);
  const startPlace = stops.find((p) => p.id === placeId);

  const everyone = members.map((m) => m.id);
  const [id] = useState(() => existing?.id ?? newId());
  const [title, setTitle] = useState(existing?.title ?? startPlace?.name ?? '');
  // Most costs abroad are in the local currency, so a new one starts in whatever was used last.
  const [paidCurrency, setPaidCurrency] = useState(
    existing ? (existing.original?.currency ?? currency) : (currenciesUsed(ledger)[0] ?? currency),
  );
  const [otherCurrency, setOtherCurrency] = useState(false);
  const [amountText, setAmountText] = useState(
    existing ? minorToInput(existing.original?.amountMinor ?? existing.amountMinor, paidCurrency) : '',
  );
  const [charging, setCharging] = useState(existing?.original?.rateSource === 'manual');
  const [chargedText, setChargedText] = useState(
    existing?.original?.rateSource === 'manual' ? minorToInput(existing.amountMinor, currency) : '',
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    existing?.category ?? (startPlace ? expenseCategoryFor(startPlace.category) : 'food'),
  );
  const [payerId, setPayerId] = useState(
    existing?.payers[0]?.memberId ?? selfMember(members)?.id ?? members[0].id,
  );
  const [mode, setMode] = useState<SplitMode>(existing?.splitMode ?? 'equal');
  const [included, setIncluded] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        existing?.shares.map((s) => s.memberId) ?? (placeId && lastParticipants(ledger, placeId)) ?? everyone,
      ),
  );
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    if (!existing || existing.splitMode === 'equal') return {};
    return Object.fromEntries(
      existing.shares.map((s) => [
        s.memberId,
        existing.splitMode === 'exact'
          ? minorToInput(s.input ?? s.amountMinor, paidCurrency)
          : String(s.input ?? ''),
      ]),
    );
  });
  const [stop, setStop] = useState(
    existing?.stop ?? (startPlace ? { placeId: startPlace.id, name: startPlace.name } : undefined),
  );
  // The stop this form opened on stays first, so the chip row doesn't hide what's selected.
  const [firstStopId] = useState(stop?.placeId);
  const [day, setDay] = useState(existing?.spentOn ?? localDay());
  const today = localDay();
  const yesterday = daysAgo(1);
  const [pickingDay, setPickingDay] = useState(day !== today && day !== yesterday);

  const paidMinor = parseAmount(amountText, paidCurrency) || undefined;
  const foreign = paidCurrency !== currency;
  const dayValid = isValidDay(day);
  const fx = useEntryRate(currency, paidCurrency, day, dayValid);

  // A rate stays with its expense: editing the title or amount mustn't change it. A saved rate
  // isn't kept, so editing also picks up a real one if it's available by now.
  const kept =
    existing?.original &&
    existing.original.currency === paidCurrency &&
    existing.spentOn === day &&
    existing.original.rateSource === 'auto'
      ? existing.original
      : undefined;
  const lookedUp =
    kept ??
    (fx.status === 'ready' ? { rate: fx.rate, rateDate: fx.rateDate, rateSource: fx.source } : undefined);
  const usingCharged = foreign && (charging || (!lookedUp && fx.status !== 'loading'));

  /** The amount in the trip's currency, and where it came from. */
  const converted = ((): { amountMinor: number; original?: OriginalAmount } | undefined => {
    if (paidMinor === undefined) return undefined;
    if (!foreign) return { amountMinor: paidMinor };
    const paid = { amountMinor: paidMinor, currency: paidCurrency };
    if (usingCharged) {
      const charged = parseAmount(chargedText, currency) || undefined;
      if (charged === undefined) return undefined;
      const rate = impliedRate(paidMinor, paidCurrency, charged, currency);
      return { amountMinor: charged, original: { ...paid, rate, rateDate: day, rateSource: 'manual' } };
    }
    if (!lookedUp) return undefined;
    const amountMinor = convertMinor(paidMinor, paidCurrency, currency, lookedUp.rate);
    if (amountMinor < 1 || amountMinor > MAX_AMOUNT_MINOR) return undefined;
    return { amountMinor, original: { ...paid, ...lookedUp } };
  })();
  const amountMinor = converted?.amountMinor;

  const result: SplitResult | undefined = useMemo(() => {
    if (amountMinor === undefined || paidMinor === undefined) return undefined;
    const fallback = mode === 'shares' ? '1' : '';
    const participants = members
      .filter((m) => included.has(m.id))
      .map((m) => {
        const text = inputs[m.id] ?? fallback;
        if (mode === 'equal') return { memberId: m.id };
        return {
          memberId: m.id,
          input: mode === 'exact' ? (parseAmount(text, paidCurrency) ?? 0) : toNumber(text),
        };
      });
    return splitConverted(amountMinor, paidMinor, mode, participants, id);
  }, [amountMinor, paidMinor, mode, members, included, inputs, paidCurrency, id]);

  const shareOf = (memberId: string) =>
    result?.ok ? result.shares.find((s) => s.memberId === memberId)?.amountMinor : undefined;

  const toggle = (memberId: string) => {
    haptics.selection();
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const chooseStop = (next: { placeId: string; name: string } | undefined) => {
    haptics.selection();
    setStop(next);
    const place = next && places.find((p) => p.id === next.placeId);
    if (!existing && place) {
      setCategory(expenseCategoryFor(place.category));
      if (!title.trim()) setTitle(place.name);
      const last = lastParticipants(ledger, place.id);
      if (last) setIncluded(new Set(last));
    }
  };

  const canSave = !!result?.ok && dayValid;

  const choosePaidCurrency = (code: string) => {
    haptics.selection();
    setOtherCurrency(false);
    setPaidCurrency(code);
    setCharging(false);
    setChargedText('');
    // Exact amounts were typed in the old currency.
    if (mode === 'exact') setInputs({});
  };

  const currencyChips = [...new Set([currency, ...currenciesUsed(ledger), paidCurrency, ...CURRENCIES])];

  const save = () => {
    if (!result?.ok || amountMinor === undefined || !dayValid) return;
    saveExpense(trip.id, {
      id,
      title: title.trim() || EXPENSE_CATEGORY_META[category].label,
      category,
      spentOn: day,
      amountMinor,
      ...(converted?.original ? { original: converted.original } : {}),
      payers: [{ memberId: payerId, amountMinor }],
      splitMode: mode,
      shares: result.shares,
      ...(stop ? { stop } : {}),
    });
    track('expense_saved', {
      mode,
      people: result.shares.length,
      onStop: !!stop,
      edited: !!existing,
      rate: converted?.original?.rateSource,
    });
    haptics.success();
    closeForm(trip.id);
  };

  const onDelete = async () => {
    if (
      await confirm({
        title: 'Delete this expense?',
        message: 'Everyone’s balances will update.',
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      removeExpense(trip.id, id);
      closeForm(trip.id);
    }
  };

  const stopChips = [
    // A deleted place is gone from the plan, but this expense still has its name.
    ...(stop && !stops.some((p) => p.id === stop.placeId) ? [{ id: stop.placeId, name: stop.name }] : []),
    ...stops,
  ].sort((a, b) => Number(b.id === firstStopId) - Number(a.id === firstStopId));

  return (
    <ScreenScroll automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: existing ? 'Edit expense' : 'Add expense' }} />

      <TextField
        label={`Amount (${paidCurrency})`}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="0"
        autoFocus={!existing}
        style={styles.amount}
      />
      {amountText.trim() && paidMinor === undefined ? (
        <Text variant="caption" color="danger">
          That doesn’t look like an amount in {paidCurrency}.
        </Text>
      ) : null}
      <Section title="Paid in">
        <ChipRow inset={0}>
          {currencyChips.map((code) => (
            <Chip
              key={code}
              label={code}
              selected={!otherCurrency && code === paidCurrency}
              onPress={() => choosePaidCurrency(code)}
            />
          ))}
          <Chip label="Other" selected={otherCurrency} onPress={() => setOtherCurrency(true)} />
        </ChipRow>
        {otherCurrency ? (
          <TextField
            placeholder="Three-letter code, like KES"
            accessibilityLabel="Currency code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            onChangeText={(text) => {
              const code = text.toUpperCase();
              if (/^[A-Z]{3}$/.test(code)) choosePaidCurrency(code);
            }}
          />
        ) : null}
        {foreign ? (
          <RatePanel
            from={paidCurrency}
            to={currency}
            shown={
              lookedUp && {
                rate: lookedUp.rate,
                rateDate: lookedUp.rateDate,
                provisional: lookedUp.rateSource === 'cached',
              }
            }
            loading={fx.status === 'loading'}
            convertedMinor={amountMinor}
            charging={charging}
            chargedText={chargedText}
            onChargedText={setChargedText}
            onCharging={setCharging}
          />
        ) : null}
      </Section>
      <TextField
        label="What for"
        value={title}
        onChangeText={setTitle}
        placeholder={EXPENSE_CATEGORY_META[category].label}
        maxLength={80}
      />

      <Section title="Category">
        <ChipRow inset={0}>
          {EXPENSE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={`${EXPENSE_CATEGORY_META[c].emoji} ${EXPENSE_CATEGORY_META[c].label}`}
              selected={c === category}
              onPress={() => {
                haptics.selection();
                setCategory(c);
              }}
            />
          ))}
        </ChipRow>
      </Section>

      {stopChips.length > 0 ? (
        <Section title="Stop on the plan">
          <ChipRow inset={0}>
            <Chip label="None" selected={!stop} onPress={() => chooseStop(undefined)} />
            {stopChips.map((p) => (
              <Chip
                key={p.id}
                label={short(p.name)}
                selected={stop?.placeId === p.id}
                onPress={() => chooseStop({ placeId: p.id, name: p.name })}
              />
            ))}
          </ChipRow>
        </Section>
      ) : null}

      <Section title="Paid by">
        <ChipRow inset={0}>
          {members.map((m) => (
            <Chip
              key={m.id}
              label={displayName(m)}
              selected={m.id === payerId}
              onPress={() => {
                haptics.selection();
                setPayerId(m.id);
              }}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="Split">
        <Segmented
          options={SPLIT_OPTIONS}
          value={mode}
          accessibilityLabel="How to split"
          onChange={(next) => {
            haptics.selection();
            setMode(next);
            // A percentage typed into the amount box would be a different number entirely.
            setInputs({});
          }}
        />
        <View>
          {members.map((m) => {
            const isIn = included.has(m.id);
            const share = shareOf(m.id);
            return (
              <View key={m.id} style={styles.personRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  aria-checked={isIn}
                  accessibilityLabel={displayName(m)}
                  onPress={() => toggle(m.id)}
                  style={styles.person}
                >
                  <Icon
                    name={isIn ? 'checkmark-circle' : 'ellipse-outline'}
                    color={isIn ? 'primary' : 'textMuted'}
                  />
                  <Text numberOfLines={1} style={styles.flex} color={isIn ? 'text' : 'textMuted'}>
                    {displayName(m)}
                  </Text>
                </Pressable>
                {isIn && mode !== 'equal' ? (
                  <TextInput
                    accessibilityLabel={`${MODE_LABEL[mode]} for ${displayName(m)}`}
                    value={inputs[m.id] ?? (mode === 'shares' ? '1' : '')}
                    onChangeText={(text) => setInputs((all) => ({ ...all, [m.id]: text }))}
                    keyboardType="decimal-pad"
                    placeholder={mode === 'percent' ? '%' : '0'}
                    placeholderTextColor={colors.textMuted}
                    style={styles.shareInput}
                  />
                ) : null}
                <Text variant="caption" align="right" style={styles.shareAmount}>
                  {isIn && share !== undefined ? formatMoney(share, currency) : ''}
                </Text>
              </View>
            );
          })}
        </View>
        <SplitHint
          result={result}
          hasAmount={paidMinor !== undefined}
          converted={amountMinor !== undefined}
          currency={paidCurrency}
        />
      </Section>

      <Section title="Date">
        <ChipRow inset={0}>
          <Chip
            label="Today"
            selected={!pickingDay && day === today}
            onPress={() => {
              setPickingDay(false);
              setDay(today);
            }}
          />
          <Chip
            label="Yesterday"
            selected={!pickingDay && day === yesterday}
            onPress={() => {
              setPickingDay(false);
              setDay(yesterday);
            }}
          />
          <Chip label="Other" selected={pickingDay} onPress={() => setPickingDay(true)} />
        </ChipRow>
        {pickingDay ? (
          <>
            <TextField
              value={day}
              onChangeText={setDay}
              placeholder="YYYY-MM-DD"
              accessibilityLabel="Date, as year-month-day"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            {!dayValid ? (
              <Text variant="caption" color="danger">
                Use year-month-day, like {today}.
              </Text>
            ) : null}
          </>
        ) : null}
      </Section>

      <Button title={existing ? 'Save changes' : 'Add expense'} disabled={!canSave} onPress={save} />
      {existing ? <Button title="Delete expense" variant="ghost" onPress={onDelete} /> : null}
    </ScreenScroll>
  );
}

function SplitHint({
  result,
  hasAmount,
  converted,
  currency,
}: {
  result: SplitResult | undefined;
  hasAmount: boolean;
  /** False while the amount can't be put in the trip's currency yet; the rate panel explains why. */
  converted: boolean;
  currency: string;
}) {
  if (!hasAmount) return <Text variant="caption">Enter the amount to see each person’s share.</Text>;
  if (!converted || !result || result.ok) return null;
  const message = () => {
    switch (result.reason) {
      case 'no_people':
        return 'Pick at least one person.';
      case 'too_large':
        return 'Shares can go up to 100.';
      case 'exact_total': {
        const money = formatMoney(Math.abs(result.remaining), currency);
        return result.remaining > 0 ? `${money} left to assign.` : `${money} too much.`;
      }
      case 'percent_total': {
        const points = Math.abs(result.remaining);
        return result.remaining > 0 ? `${points}% left to assign.` : `${points}% too much.`;
      }
    }
  };
  return (
    <Text variant="caption" color="danger">
      {message()}
    </Text>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  amount: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  shareInput: {
    width: 84,
    minHeight: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: 10,
    backgroundColor: t.colors.surface,
    color: t.colors.text,
    fontSize: 15,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  shareAmount: { width: 92, fontVariant: ['tabular-nums'] },
}));
