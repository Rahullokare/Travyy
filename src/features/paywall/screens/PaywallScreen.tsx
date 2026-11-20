import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { haptics, notify } from '@/shared/lib/platform';
import { makeStyles, radius, spacing } from '@/shared/theme';
import { Button, Icon, IconButton, PressableScale, ScreenScroll, Text, type IconName } from '@/shared/ui';
import { billing, catalogue, type ProductId } from '../billing';
import { FREE_LIMITS, useEntitlements } from '../entitlements';

type Reason = 'trip' | 'ai' | 'profile';

/** The headline answers why the paywall opened, so it never reads like an ambush. */
const HEADLINE: Record<Reason, { title: string; body: string }> = {
  trip: {
    title: 'Ready for the next trip?',
    body: `Your free plan includes ${FREE_LIMITS.trips} planned trip. Add one more with a Trip Pass, or plan them all with Pro.`,
  },
  ai: {
    title: 'Never miss a spot in a reel',
    body: `You’ve used this month’s ${FREE_LIMITS.aiImportsPerMonth} free AI imports. Keep the AI reading captions, covers and videos.`,
  },
  profile: {
    title: 'Plan every trip, with everyone',
    body: 'Unlimited trips and AI imports, for less than a coffee at the airport.',
  },
};

const PERKS: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'calendar', title: 'Unlimited planned trips', sub: 'Every city, day by day, routed on foot' },
  { icon: 'sparkles', title: 'Unlimited AI imports', sub: 'Reads the caption, the cover and the video' },
];

const ALWAYS_FREE = ['Unlimited saved spots', 'Splitting costs in any currency', 'Sharing trips as a link'];

export function PaywallScreen({ reason: rawReason }: { reason?: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reason: Reason = rawReason === 'trip' || rawReason === 'ai' ? rawReason : 'profile';
  const { plan, isPro } = useEntitlements();
  const { data: products = catalogue() } = useQuery({
    queryKey: ['billing', 'products'],
    queryFn: () => billing.products(),
  });
  // Someone stopped at the trip limit wants one trip; everyone else sees the best-value plan first.
  const [selected, setSelected] = useState<ProductId>(reason === 'trip' ? 'trip_pass' : 'pro_yearly');
  const [busy, setBusy] = useState(false);
  const current = products.find((p) => p.id === selected) ?? products[0];

  useEffect(() => {
    track('paywall_viewed', { trigger: reason });
  }, [reason]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const purchase = async () => {
    setBusy(true);
    const result = await billing.purchase(current.id).finally(() => setBusy(false));
    if (result.status === 'unavailable') return notify('Not available yet', result.message);
    if (result.status !== 'purchased') return;
    track('purchase_completed', { product: result.product, trigger: reason, preview: billing.preview });
    haptics.success();
    close();
  };

  const restore = async () => {
    const found = await billing.restore();
    notify(
      found ? 'Purchases restored' : 'Nothing to restore',
      found ? undefined : 'No earlier purchase was found for this account.',
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Its own row, so the close button can never sit on top of the headline. */}
      <View style={styles.topBar}>
        <IconButton icon="close" variant="tinted" size={20} accessibilityLabel="Close" onPress={close} />
      </View>
      <ScreenScroll contentStyle={styles.content}>
        <View style={styles.heroText}>
          <Text variant="overline" color="primaryText">
            {isPro ? 'You’re on Pro' : plan === 'pass' ? 'Trip Pass active' : 'Travyy Pro'}
          </Text>
          <Text variant="hero">{HEADLINE[reason].title}</Text>
          <Text color="textMuted">{HEADLINE[reason].body}</Text>
        </View>

        <View style={styles.plans} accessibilityRole="radiogroup">
          {products.map((p) => {
            const on = current.id === p.id;
            return (
              <PressableScale
                key={p.id}
                scale={0.98}
                onPress={() => {
                  if (!on) haptics.selection();
                  setSelected(p.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.title}, ${p.price} ${p.period}. ${p.detail}`}
                style={[styles.plan, on && styles.planOn]}
              >
                <Icon
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  color={on ? 'primary' : 'textSubtle'}
                />
                <View style={styles.flex}>
                  <View style={styles.planTitle}>
                    <Text variant="bodyStrong">{p.title}</Text>
                    {p.badge ? <Text style={styles.badge}>{p.badge}</Text> : null}
                  </View>
                  <Text variant="caption">{p.detail}</Text>
                </View>
                <View style={styles.priceCol}>
                  <Text variant="heading" style={styles.tabular}>
                    {p.price}
                  </Text>
                  <Text variant="caption" color="textSubtle">
                    {p.period}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.title} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Icon name={p.icon} size={18} color="primaryText" />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{p.title}</Text>
                <Text variant="caption">{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.free}>
          <Text variant="label" color="textMuted">
            Free for everyone, always
          </Text>
          {ALWAYS_FREE.map((line) => (
            <View key={line} style={styles.freeRow}>
              <Icon name="checkmark" size={16} color="success" />
              <Text variant="callout">{line}</Text>
            </View>
          ))}
        </View>
      </ScreenScroll>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title={current.cta} loading={busy} onPress={purchase} />
        {billing.preview ? (
          <Text variant="caption" color="textSubtle" align="center">
            Preview build: nothing is charged, and the plan unlocks on this device only.
          </Text>
        ) : null}
        <Button title="Restore purchases" variant="ghost" size="sm" onPress={restore} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  flex: { flex: 1, gap: 2 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  content: { paddingTop: spacing.xs, gap: spacing.xl },
  heroText: { gap: 10 },
  plans: { gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  planOn: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
  planTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceCol: { alignItems: 'flex-end' },
  badge: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: t.colors.onPrimary,
    backgroundColor: t.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  perks: { gap: 14 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  perkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  free: {
    gap: 8,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  freeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: 6,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
}));
