import { Pressable, View } from 'react-native';
import { formatMoney, formatRate } from '@/domain/money';
import { makeStyles, radius } from '@/shared/theme';
import { Pill, Text, TextField } from '@/shared/ui';
import { formatDay } from '../dates';

export type ShownRate = { rate: number; rateDate: string; provisional: boolean };

/** Under the amount when a cost wasn't paid in the trip's currency: how it converts, and a way to correct it. */
export function RatePanel({
  from,
  to,
  shown,
  loading,
  convertedMinor,
  charging,
  chargedText,
  onChargedText,
  onCharging,
}: {
  from: string;
  to: string;
  shown: ShownRate | undefined;
  loading: boolean;
  convertedMinor: number | undefined;
  /** Whether the charged amount is being used instead of a looked-up rate. */
  charging: boolean;
  chargedText: string;
  onChargedText: (text: string) => void;
  onCharging: (charging: boolean) => void;
}) {
  const styles = useStyles();

  if (charging || (!shown && !loading)) {
    return (
      <View style={styles.panel}>
        <TextField
          label={`Total in ${to}`}
          value={chargedText}
          onChangeText={onChargedText}
          keyboardType="decimal-pad"
          placeholder="From your bank or card"
        />
        {shown ? (
          <Link label="Use the exchange rate instead" onPress={() => onCharging(false)} />
        ) : (
          <Text variant="caption">
            No exchange rate for {from} right now. Enter what it came to in {to}.
          </Text>
        )}
      </View>
    );
  }

  if (!shown)
    return (
      <View style={styles.card}>
        <Text variant="caption">Getting the exchange rate…</Text>
      </View>
    );

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {convertedMinor !== undefined ? (
          <Text variant="headline" style={styles.tabular}>
            ≈ {formatMoney(convertedMinor, to)}
          </Text>
        ) : null}
        {shown.provisional ? <Pill label="Saved rate" icon="cloud-offline" tone="warning" /> : null}
      </View>
      <Text variant="caption" style={styles.tabular}>
        {formatRate(shown.rate, from, to)} on {formatDay(shown.rateDate)}
      </Text>
      {shown.provisional ? (
        <Text variant="caption" color="warning">
          Saved rate. It updates when you’re back online.
        </Text>
      ) : null}
      <Link label="Enter what you were charged" onPress={() => onCharging(true)} />
    </View>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
      <Text variant="caption" color="primaryText" style={{ fontWeight: '700', marginTop: 4 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  panel: { gap: 6 },
  card: { gap: 4, padding: 14, borderRadius: radius.md, backgroundColor: t.colors.surfaceSunken },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
}));
