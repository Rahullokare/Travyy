import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { Place, TripLedger } from '@/domain/models';
import { formatMoney } from '@/domain/money';
import { haptics } from '@/shared/lib/platform';
import { makeStyles } from '@/shared/theme';
import { Icon, Text } from '@/shared/ui';
import { stopCosts } from '../ledger';

/** Sits under a stop in the itinerary: what it cost so far, and a way to log a cost against it. */
export function StopCostRow({
  tripId,
  ledger,
  place,
  onOpenMoney,
}: {
  tripId: string;
  ledger: TripLedger | undefined;
  place: Place;
  onOpenMoney: () => void;
}) {
  const styles = useStyles();
  const { expenses, totalMinor, selfShareMinor } = stopCosts(ledger, place.id);

  const add = () => {
    haptics.selection();
    if (ledger) router.push({ pathname: '/trip/[id]/expense', params: { id: tripId, placeId: place.id } });
    else router.push({ pathname: '/trip/[id]/people', params: { id: tripId, placeId: place.id } });
  };

  const open = () => {
    if (expenses.length === 1)
      router.push({ pathname: '/trip/[id]/expense', params: { id: tripId, expenseId: expenses[0].id } });
    else onOpenMoney();
  };

  const summary = ledger
    ? [
        formatMoney(totalMinor, ledger.currency),
        selfShareMinor ? `your share ${formatMoney(selfShareMinor, ledger.currency)}` : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View style={styles.row}>
      {expenses.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Costs at ${place.name}: ${summary}`}
          onPress={open}
          hitSlop={8}
          style={styles.summary}
        >
          <Text variant="caption" numberOfLines={1} style={styles.tabular}>
            {summary}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.summary} />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add cost for ${place.name}`}
        onPress={add}
        hitSlop={8}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <Icon name="add" size={16} color="primary" />
        <Text variant="caption" color="primary" style={styles.addLabel}>
          Add cost
        </Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Lines up under the stop's name, past the 44 px badge in PlaceRow.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 72,
    paddingRight: 16,
    marginTop: -6,
  },
  summary: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  addLabel: { fontWeight: '600' },
  pressed: { backgroundColor: t.colors.surfacePressed },
}));
