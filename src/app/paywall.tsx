import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { FREE_SAVE_LIMIT, useStore } from '../lib/store';
import { colors, radius, space, type } from '../lib/theme';

const PLANS = [
  { id: 'yearly', title: 'Yearly', price: '$29.99/yr', sub: '$2.50/mo · 7-day free trial', badge: 'Save 50%' },
  { id: 'monthly', title: 'Monthly', price: '$4.99/mo', sub: 'Cancel anytime' },
  { id: 'trip', title: 'Trip Pass', price: '$7.99', sub: '30 days of Pro for one trip' },
] as const;

const PERKS = [
  ['infinite', 'Unlimited saves', `Free plan holds ${FREE_SAVE_LIMIT} spots`],
  ['sparkles', 'AI extraction from any reel', 'Pulls every spot out of the caption, even messy ones'],
  ['calendar', 'Unlimited auto-planned trips', 'Day-by-day routes by neighbourhood'],
  ['notifications', 'Nearby alerts (coming soon)', '“You’re 5 min from that ramen spot you saved”'],
  ['people', 'Shared trip boards (coming soon)', 'Plan with friends, vote on spots'],
] as const;

export default function Paywall() {
  const [plan, setPlan] = useState<(typeof PLANS)[number]['id']>('yearly');
  const setPro = useStore((s) => s.setPro);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Pressable style={styles.close} onPress={() => router.back()} accessibilityLabel="Close">
        <Ionicons name="close" size={26} color={colors.text} />
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <Text style={{ fontSize: 56, textAlign: 'center' }}>✈️</Text>
        <Text style={[type.hero, { textAlign: 'center' }]}>Actually go to the places you save</Text>
        <View style={{ gap: space.md }}>
          {PERKS.map(([icon, title, sub]) => (
            <View key={title} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Ionicons name={icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>{title}</Text>
                <Text style={type.small}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ gap: space.sm }}>
          {PLANS.map((p) => (
            <Pressable key={p.id} onPress={() => setPlan(p.id)} style={[styles.plan, plan === p.id && styles.planOn]}>
              <Ionicons name={plan === p.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={plan === p.id ? colors.primary : colors.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{p.title}</Text>
                <Text style={type.small}>{p.sub}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {'badge' in p ? <Text style={styles.badge}>{p.badge}</Text> : null}
                <Text style={{ fontWeight: '800', color: colors.text }}>{p.price}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={{ padding: space.xl, gap: space.xs }}>
        <Button
          title={plan === 'yearly' ? 'Start free trial' : 'Continue'}
          onPress={() => {
            // TODO(billing): replace with RevenueCat `Purchases.purchasePackage` — see README "Monetisation".
            setPro(true);
            Alert.alert('Welcome to Pro ✨', 'Demo mode: Pro unlocked locally. Wire up RevenueCat before launch.');
            router.back();
          }}
        />
        <Text style={[type.small, { textAlign: 'center' }]}>Restore purchases · Terms · Privacy</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', top: 56, right: 20, zIndex: 2, padding: 4 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  perkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  planOn: { borderColor: colors.primary, backgroundColor: '#FFF6F3' },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: 2,
  },
});
