import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, radius, spacing } from '@/shared/theme';
import { Icon, IconBadge, PressableScale, Text, type IconName } from '@/shared/ui';

/**
 * What "+ New" opens: glide's short sheet of ways in. A place searched by name, a link (or a
 * share from another app), a pin dropped anywhere on the map, or a new vault. It's a native sheet, so it sizes to these rows.
 */
export function NewSheet() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // The sheet goes away first, so what opens next isn't stacked on top of it.
  const then = (go: () => void) => {
    router.back();
    go();
  };
  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <Text variant="headline" style={styles.title}>
        Save something new
      </Text>
      <Option
        icon="search"
        color="#11948A"
        title="Search for a place"
        body="Type a name: the café a friend told you about"
        onPress={() => then(() => router.push('/search-place'))}
      />
      <Option
        icon="link"
        color="#2F6FE0"
        title="Paste a link"
        body="A reel, a TikTok, a Google Maps place, or a caption"
        onPress={() => then(() => router.push('/add'))}
      />
      <Option
        icon="pin"
        color="#D14318"
        title="Drop a pin on the map"
        body="Any spot, even one with no name or link"
        onPress={() => then(() => router.navigate({ pathname: '/', params: { pick: String(Date.now()) } }))}
      />
      <Option
        icon="grid"
        color="#7B5BE0"
        title="New vault"
        body="A collection from your saves: cafés to try, a weekend away"
        onPress={() => then(() => router.push('/vaults/new'))}
      />
      <View style={styles.tip}>
        <Icon name="share-social-outline" size={16} color="textMuted" />
        <Text variant="caption" style={styles.flex}>
          Fastest: tap Share on any reel or map place and choose Travyy.
        </Text>
      </View>
    </View>
  );
}

function Option({
  icon,
  color,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  color: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale scale={0.98} style={styles.option} accessibilityRole="button" onPress={onPress}>
      <IconBadge icon={icon} color={color} size={46} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption">{body}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color="textSubtle" />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  sheet: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.md },
  title: { paddingHorizontal: 4, marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: spacing.xs },
}));
