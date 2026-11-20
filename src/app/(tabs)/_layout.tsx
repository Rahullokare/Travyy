import { NativeTabs } from 'expo-router/native-tabs';
import { useDeliverPendingShare } from '@/features/capture/share/useDeliverPendingShare';
import { useOpenImportedTrip } from '@/features/trips/importInbox';
import { FONT_FAMILY, useTheme } from '@/shared/theme';

/**
 * The system tab bar: Material 3 navigation on Android, the platform tab bar on iOS. It brings the
 * platform's own selection indicator, ripple, scroll-to-top and motion for free. Tabs are peers,
 * so switching is instant. Web uses _layout.web.tsx.
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
      <NativeTabs.Trigger name="trips">
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'airplane', selected: 'airplane' }} md="flight" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
