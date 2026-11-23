import { router } from 'expo-router';
import { View } from 'react-native';
import { makeStyles, radius, shadow, spacing, useTheme } from '@/shared/theme';
import { Icon, PressableScale, Text } from '@/shared/ui';

/**
 * The one "+ New" button, floating over the bottom of Saves and Vaults. It opens a short sheet
 * (save from a link, drop a pin, new vault) so every way in starts from the same place.
 */
export function NewFab() {
  const styles = useStyles();
  const { dark } = useTheme();
  return (
    <View style={styles.slot} pointerEvents="box-none">
      <PressableScale
        style={[styles.fab, shadow('lg', dark)]}
        pressedStyle={styles.pressed}
        accessibilityRole="button"
        accessibilityLabel="New: save a spot or make a vault"
        onPress={() => router.push('/new')}
      >
        <Icon name="add" size={22} color="onPrimary" />
        <Text variant="bodyStrong" color="onPrimary" style={styles.label}>
          New
        </Text>
      </PressableScale>
    </View>
  );
}

/** Bottom padding a list needs so its last row can scroll clear of the button. */
export const NEW_FAB_CLEARANCE = 96;

const useStyles = makeStyles((t) => ({
  slot: { position: 'absolute', left: 0, right: 0, bottom: spacing.lg, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 52,
    paddingLeft: 18,
    paddingRight: 24,
    borderRadius: radius.pill,
    backgroundColor: t.colors.primary,
  },
  pressed: { backgroundColor: t.colors.primaryPressed },
  label: { fontSize: 16, fontWeight: '700' },
}));
