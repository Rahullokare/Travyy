import { View } from 'react-native';
import { lift, makeStyles, radius, useTheme } from '@/shared/theme';
import { Icon, PressableScale, Text } from '@/shared/ui';

const TILE_COLORS = ['#E0532A', '#2F6FE0', '#22945F', '#7B5BE0', '#C98A0C', '#D2457E', '#11948A'];

/** A stable colour per name, so a country or city keeps its colour everywhere it appears. */
export function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

/** A folder in the vault: a country's flag or a vault's emoji, else two letters, on a tinted tile. */
export function Monogram({ name, flag, size = 48 }: { name: string; flag?: string; size?: number }) {
  const { dark } = useTheme();
  const color = colorFor(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        backgroundColor: `${color}${dark ? '2E' : '1C'}`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {flag ? (
        <Text style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.66) }}>{flag}</Text>
      ) : (
        <Text style={{ color, fontSize: Math.round(size * 0.36), fontWeight: '800', letterSpacing: -0.3 }}>
          {name.trim().slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** One folder in the vault (a country or a city): what it is, what's inside, and how much you've visited. */
export function VaultCard({
  title,
  meta,
  detail,
  visited,
  total,
  flag,
  onPress,
}: {
  title: string;
  /** Counts, e.g. "24 spots · 3 cities". */
  meta: string;
  /** What's inside, e.g. city names. One line. */
  detail?: string;
  visited: number;
  total: number;
  /** A country's flag or a vault's emoji, shown instead of its initials. */
  flag?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  const share = total > 0 ? visited / total : 0;
  return (
    <PressableScale
      scale={0.98}
      style={[styles.card, lift(dark)]}
      pressedStyle={styles.pressed}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}, ${visited} visited`}
    >
      <Monogram name={title} flag={flag} />
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" numberOfLines={1} style={styles.tabular}>
          {meta}
        </Text>
        {detail ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
        <View style={styles.progress}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
          </View>
          <Text variant="caption" color="textSubtle" style={styles.tabular}>
            {visited}/{total} visited
          </Text>
        </View>
      </View>
      <Icon name="chevron-forward" size={18} color="textSubtle" />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  pressed: { backgroundColor: t.colors.surfacePressed },
  body: { flex: 1, gap: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2, backgroundColor: t.colors.success },
}));
