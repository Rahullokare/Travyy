import { NativeTabs } from 'expo-router/native-tabs';
import { useDeliverPendingShare } from '@/features/capture/share/useDeliverPendingShare';
import { useOpenImportedTrip } from '@/features/trips/importInbox';
import { FONT_FAMILY, useTheme } from '@/shared/theme';

/**
 * The system tab bar: Material 3 navigation on Android, the platform tab bar on iOS. It brings the
 * platform's own selection indicator, ripple, scroll-to-top and motion for free. Tabs are peers,
 * so switching is instant. Web uses _layout.web.tsx.
 *
 * Four places to browse, as glide does it: the map, every save, the vaults that group them, and
 * trips. The profile is the avatar at the top right of each tab.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  useDeliverPendingShare();
  useOpenImportedTrip();
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.primarySoft}
      rippleColor={colors.surfacePressed}
      iconColor={{ default: colors.textMuted, selected: colors.primaryText }}
      labelStyle={{
        default: { fontFamily: FONT_FAMILY[600], fontSize: 12, color: colors.textMuted },
        selected: { fontFamily: FONT_FAMILY[700], fontSize: 12, color: colors.text },
      }}
      labelVisibilityMode="labeled"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saves">
        <NativeTabs.Trigger.Label>Saves</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bookmark', selected: 'bookmark.fill' }} md="bookmark" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vaults">
        <NativeTabs.Trigger.Label>Vaults</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="grid_view"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trips">
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'airplane', selected: 'airplane' }} md="flight" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
