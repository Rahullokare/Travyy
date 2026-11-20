import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { Member } from '@/domain/models';
import { CURRENCIES, defaultCurrency } from '@/domain/money';
import { track } from '@/shared/lib/analytics';
import { newId } from '@/shared/lib/id';
import { haptics, notify } from '@/shared/lib/platform';
import { makeStyles } from '@/shared/theme';
import {
  Avatar,
  Button,
  Chip,
  ChipRow,
  Icon,
  IconButton,
  Pill,
  ScreenScroll,
  Section,
  Text,
  TextField,
} from '@/shared/ui';
import { useLedgerStore } from '@/store';
import { memberInUse } from '../ledger';
import { closeForm } from '../navigation';

/** Who's on the trip and what currency it settles in. Doubles as first-time setup. */
export function PeopleScreen({ tripId, placeId }: { tripId: string; placeId?: string }) {
  const styles = useStyles();
  const ledger = useLedgerStore((s) => s.ledgers[tripId]);
  const saveSetup = useLedgerStore((s) => s.saveSetup);
  const knownName = useLedgerStore(
    (s) =>
      Object.values(s.ledgers)
        .flatMap((l) => l.members)
        .find((m) => m.isSelf)?.name,
  );

  const [currency, setCurrency] = useState(ledger?.currency ?? defaultCurrency());
  const [people, setPeople] = useState<Member[]>(
    ledger?.members ?? [{ id: newId(), name: knownName ?? '', isSelf: true }],
  );
  const [draft, setDraft] = useState('');

  const currencyLocked = !!ledger && (ledger.expenses.length > 0 || ledger.settlements.length > 0);
  const currencies = CURRENCIES.includes(currency as (typeof CURRENCIES)[number])
    ? CURRENCIES
    : [currency, ...CURRENCIES];

  const rename = (id: string, name: string) =>
    setPeople((list) => list.map((m) => (m.id === id ? { ...m, name } : m)));

  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    setPeople((list) => [...list, { id: newId(), name }]);
    setDraft('');
  };

  const remove = (member: Member) => {
    if (ledger && memberInUse(ledger, member.id)) {
      notify(`${member.name} has costs on this trip`, 'Edit or delete those first, then remove them.');
      return;
    }
    setPeople((list) => list.filter((m) => m.id !== member.id));
  };

  // A name still in the box counts: it's easy to type the last person and go straight to Save.
  const final = [...people, ...(draft.trim() ? [{ id: newId(), name: draft.trim() }] : [])].map((m) => ({
    ...m,
    name: m.name.trim(),
  }));
  const missingName = final.some((m) => !m.name);
  const names = final.map((m) => m.name.toLowerCase());
  const duplicate = names.some((n, i) => n && names.indexOf(n) !== i);

  const save = () => {
    saveSetup(tripId, { currency, members: final });
    haptics.success();
    if (ledger) {
      closeForm(tripId);
      return;
    }
    track('ledger_created', { people: final.length, currency });
    if (placeId) router.replace({ pathname: '/trip/[id]/expense', params: { id: tripId, placeId } });
    else closeForm(tripId);
  };

  return (
    <ScreenScroll automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: ledger ? 'People' : "Who's on this trip?" }} />
      {!ledger ? (
        <Text color="textMuted">
          Add everyone by name. They don&apos;t need the app, and this all works offline.
        </Text>
      ) : null}

      <Section title="People">
        {people.map((member) => (
          <View key={member.id} style={styles.personRow}>
            <Avatar name={member.name || (member.isSelf ? 'You' : '?')} seed={member.id} size={40} />
            <View style={styles.flex}>
              <TextField
                value={member.name}
                onChangeText={(name) => rename(member.id, name)}
                placeholder={member.isSelf ? 'Your name' : 'Name'}
                accessibilityLabel={member.isSelf ? 'Your name' : `Name of ${member.name}`}
                autoCapitalize="words"
                maxLength={40}
              />
            </View>
            {member.isSelf ? (
              <View style={styles.you}>
                <Pill label="You" tone="brand" />
              </View>
            ) : (
              <IconButton
                icon="close"
                variant="tinted"
                size={18}
                color="textMuted"
                accessibilityLabel={`Remove ${member.name}`}
                onPress={() => remove(member)}
              />
            )}
          </View>
        ))}
        <View style={styles.personRow}>
          <View style={styles.addAvatar}>
            <Icon name="person-add" size={18} color="textMuted" />
          </View>
          <View style={styles.flex}>
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder="Add someone"
              autoCapitalize="words"
              maxLength={40}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={addDraft}
            />
          </View>
          <IconButton
            icon="add"
            variant="tinted"
            size={20}
            disabled={!draft.trim()}
            color={draft.trim() ? 'primaryText' : 'textMuted'}
            accessibilityLabel="Add this person"
            onPress={addDraft}
          />
        </View>
      </Section>

      <Section title="Settle in">
        {currencyLocked ? (
          <View style={styles.locked}>
            <Pill label={currency} icon="lock-closed" tone="neutral" />
            <Text variant="caption" style={styles.flex}>
              Balances stay in this currency once costs are logged.
            </Text>
          </View>
        ) : (
          <ChipRow bleed>
            {currencies.map((code) => (
              <Chip
                key={code}
                label={code}
                selected={code === currency}
                onPress={() => {
                  haptics.selection();
                  setCurrency(code);
                }}
              />
            ))}
          </ChipRow>
        )}
      </Section>

      {duplicate ? <Text color="danger">Two people have the same name. Tell them apart.</Text> : null}
      <Button
        title={ledger ? 'Save' : placeId ? 'Next: add the cost' : 'Done'}
        iconName={!ledger && placeId ? 'arrow-forward' : 'checkmark'}
        disabled={missingName || duplicate}
        onPress={save}
      />
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  you: { width: 44, alignItems: 'center' },
  addAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 10 },
}));
