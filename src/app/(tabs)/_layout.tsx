import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { colors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false, tabBarIcon: icon('map') }} />
      <Tabs.Screen name="saves" options={{ title: 'Saves', tabBarIcon: icon('bookmark') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: icon('airplane') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
