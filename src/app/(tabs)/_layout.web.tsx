import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useDeliverPendingShare } from '@/features/capture/share/useDeliverPendingShare';
import { useOpenImportedTrip } from '@/features/trips/importInbox';
import { FONT_FAMILY, useTheme } from '@/shared/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(outline: IconName, filled: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} color={color as string} size={23} />;
  };
}

/**
 * Web has no system tab bar, so it keeps a JS one styled to match the native bar. Each screen
 * draws its own large title, as on phones.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  useDeliverPendingShare();
  useOpenImportedTrip();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: FONT_FAMILY[600], fontSize: 12, marginBottom: 6 },
        // Tabs are peers: switching is instant, never a slide.
        animation: 'none',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: tabIcon('map-outline', 'map') }} />
      <Tabs.Screen
        name="saves"
        options={{ title: 'Saves', tabBarIcon: tabIcon('bookmark-outline', 'bookmark') }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: 'Trips', tabBarIcon: tabIcon('airplane-outline', 'airplane') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'You', tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
    </Tabs>
  );
}
