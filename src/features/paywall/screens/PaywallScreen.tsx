import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics, notify } from '@/shared/lib/platform';
import { makeStyles } from '@/shared/theme';
import { Button, Icon, IconButton, PressableScale, ScreenScroll, Text, type IconName } from '@/shared/ui';
import { useAppStore } from '@/store';
import { FREE_LIMITS } from '../entitlements';

const PLANS = [
  {
    id: 'yearly',
    title: 'Yearly',
    price: '$29.99/yr',
    sub: '$2.50/mo · 7-day free trial',
    badge: 'Save 50%',
  },
  { id: 'monthly', title: 'Monthly', price: '$4.99/mo', sub: 'Cancel anytime' },
  { id: 'trip', title: 'Trip Pass', price: '$7.99', sub: '30 days of Pro for one trip' },
] as const;
type PlanId = (typeof PLANS)[number]['id'];

const PERKS: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'infinite', title: 'Unlimited saves', sub: `Free plan holds ${FREE_LIMITS.saves} spots` },
  {
    icon: 'sparkles',
    title: 'AI extraction from any reel',
    sub: 'Pulls every spot out of the caption, even messy ones',
  },
  { icon: 'calendar', title: 'Unlimited auto-planned trips', sub: 'Day-by-day routes by neighbourhood' },
  {
    icon: 'notifications',
    title: 'Nearby alerts (coming soon)',
    sub: '“You’re 5 min from that ramen spot you saved”',
  },
  { icon: 'people', title: 'Shared trip boards (coming soon)', sub: 'Plan with friends, vote on spots' },
];

export function PaywallScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<PlanId>('yearly');
  const setPro = useAppStore((s) => s.setPro);

  const purchase = () => {
    // TODO(billing): replace with RevenueCat purchasePackage + entitlement check (see docs/ARCHITECTURE.md).
    setPro(true);
    haptics.success();
    notify('Welcome to Pro ✨', 'Demo mode: Pro is unlocked on this device only.');
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.close, { top: insets.top + 8 }]}>
        <IconButton icon="close" size={26} accessibilityLabel="Close" onPress={() => router.back()} />
      </View>
      <ScreenScroll contentStyle={styles.content}>
        <Text style={styles.emoji} align="center">
          ✈️
        </Text>
        <Text variant="hero" align="center">
          Actually go to the places you save
        </Text>
        <View style={styles.gap}>
          {PERKS.map((p) => (
            <View key={p.title} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Icon name={p.icon} size={20} color="primary" />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{p.title}</Text>
                <Text variant="caption">{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.plans} accessibilityRole="radiogroup">
          {PLANS.map((p) => {
            const on = plan === p.id;
            return (
              <PressableScale
                key={p.id}
                scale={0.98}
                onPress={() => {
                  if (!on) haptics.selection();
                  setPlan(p.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.plan, on && styles.planOn]}
              >
                <Icon
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  color={on ? 'primary' : 'textMuted'}
                />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{p.title}</Text>
                  <Text variant="caption">{p.sub}</Text>
                </View>
                <View style={styles.priceCol}>
                  {'badge' in p ? <Text style={styles.badge}>{p.badge}</Text> : null}
                  <Text variant="bodyStrong" style={styles.tabular}>
                    {p.price}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </ScreenScroll>
      <View style={styles.footer}>
        <Button title={plan === 'yearly' ? 'Start free trial' : 'Continue'} onPress={purchase} />
        <Text variant="caption" align="center">
          Restore purchases · Terms · Privacy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  flex: { flex: 1 },
  gap: { gap: 12 },
  close: { position: 'absolute', right: 16, zIndex: 2 },
  tabular: { fontVariant: ['tabular-nums'] },
  content: { paddingTop: 32 },
  emoji: { fontSize: 56, lineHeight: 68 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plans: { gap: 8 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  planOn: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: t.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  footer: { padding: 24, gap: 4, width: '100%', maxWidth: 520, alignSelf: 'center' },
}));
