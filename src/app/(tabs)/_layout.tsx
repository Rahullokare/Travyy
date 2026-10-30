import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useDeliverPendingShare } from '@/features/capture/share/useDeliverPendingShare';
import { useTheme } from '@/shared/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  const { colors } = useTheme();
  useDeliverPendingShare();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
        // Tabs are peers: switching is instant, never a slide.
        animation: 'none',
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', color: colors.text, fontSize: 20, letterSpacing: -0.4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false, tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="saves" options={{ title: 'Saves', tabBarIcon: tabIcon('bookmark') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: tabIcon('airplane') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: tabIcon('person-circle') }} />
    </Tabs>
  );
}
