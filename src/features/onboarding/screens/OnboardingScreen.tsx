import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { type CSSTransitionProperties } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { makeStyles } from '@/shared/theme';
import { Button, duration, EASE_OUT, Icon, Text, useEntrance, type IconName } from '@/shared/ui';
import { useAppStore } from '@/store';
import { SAMPLE_PLACES } from '../sampleData';

const STEPS = [
  {
    icon: 'share-social',
    title: 'Every reel becomes a pin',
    body: 'Share a Reel, TikTok, YouTube or Maps link to Travyy. It finds every spot mentioned and puts it on your map.',
  },
  {
    icon: 'sparkles',
    title: 'Pins become a plan',
    body: 'Pick a city and how many days. Travyy groups the spots by neighbourhood, routes each day on foot, and gives you a link to send the group.',
  },
  {
    icon: 'wallet',
    title: 'Split the trip, stay friends',
    body: 'Log who paid for what, in any currency. Travyy works out who owes whom. No limits, and nobody else needs an account.',
  },
] as const satisfies readonly { icon: IconName; title: string; body: string }[];

// The active dot stretches; it's tiny and childless, so animating width costs nothing.
const DOT_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ['width', 'backgroundColor'],
  transitionDuration: duration.enter,
  transitionTimingFunction: EASE_OUT,
};

export function OnboardingScreen() {
  const styles = useStyles();
  const entrance = useEntrance('slide');
  const [step, setStep] = useState(0);
  const addPlaces = useAppStore((s) => s.addPlaces);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = (withSamples: boolean) => {
    if (withSamples) addPlaces(SAMPLE_PLACES);
    track('onboarding_completed', { withSamples });
    completeOnboarding();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>travyy</Text>
          <Text variant="caption" color="textSubtle">
            The group trip app
          </Text>
        </View>
        {/* Keyed by step: each new step nudges in from the right, the way you're reading. */}
        <Animated.View key={step} style={[styles.step, entrance]}>
          <View style={styles.hero}>
            <View style={styles.heroRing}>
              <View style={styles.heroCore}>
                <Icon name={current.icon} size={52} color="onPrimary" />
              </View>
            </View>
          </View>
          <Text variant="hero" align="center">
            {current.title}
          </Text>
          <Text color="textMuted" align="center" style={styles.body}>
            {current.body}
          </Text>
        </Animated.View>
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <Animated.View
              key={s.title}
              style={[styles.dot, i === step && styles.dotActive, DOT_TRANSITION]}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {isLast ? (
          <>
            <Button title="Start with sample spots" iconName="sparkles" onPress={() => finish(true)} />
            <Button title="Start empty" variant="ghost" onPress={() => finish(false)} />
          </>
        ) : (
          <>
            <Button title="Next" iconName="arrow-forward" onPress={() => setStep(step + 1)} />
            <Button title="Skip" variant="ghost" onPress={() => setStep(STEPS.length - 1)} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  step: { alignItems: 'center', gap: 16 },
  brandBlock: { alignItems: 'center', gap: 2 },
  brand: { fontSize: 24, fontWeight: '800', color: t.colors.primary, letterSpacing: -0.9 },
  hero: {
    width: 216,
    height: 216,
    borderRadius: 108,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  heroRing: {
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 1.5,
    borderColor: t.dark ? 'rgba(255,114,70,0.25)' : 'rgba(209,67,24,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCore: {
    width: 104,
    height: 104,
    borderRadius: 36,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  body: { maxWidth: 340, fontSize: 16, lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.colors.borderStrong,
  },
  dotActive: { width: 24, backgroundColor: t.colors.primary },
  footer: { padding: 24, gap: 8, width: '100%', maxWidth: 480, alignSelf: 'center' },
}));
