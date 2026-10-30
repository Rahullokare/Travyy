import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { type CSSTransitionProperties } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { makeStyles } from '@/shared/theme';
import { Button, duration, EASE_OUT, Text, useEntrance } from '@/shared/ui';
import { useAppStore } from '@/store';
import { SAMPLE_PLACES } from '../sampleData';

const STEPS = [
  {
    emoji: '📲',
    title: 'Share any reel or TikTok',
    body: 'Instagram, TikTok, YouTube or a Google Maps link — paste it in and Travyy finds every spot mentioned.',
  },
  {
    emoji: '🗺️',
    title: 'It lands on your map',
    body: 'Auto-sorted by city and vibe. No more digging through 400 saved posts the night before your trip.',
  },
  {
    emoji: '✨',
    title: 'Saves become a real plan',
    body: 'Pick a city and how many days — we group spots by neighbourhood and build the walking route.',
  },
] as const;

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
        <Text style={styles.brand}>travyy</Text>
        {/* Keyed by step: each new step nudges in from the right, the way you're reading. */}
        <Animated.View key={step} style={[styles.step, entrance]}>
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>{current.emoji}</Text>
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
            <Button title="Start with sample spots" onPress={() => finish(true)} />
            <Button title="Start empty" variant="ghost" onPress={() => finish(false)} />
          </>
        ) : (
          <>
            <Button title="Next" onPress={() => setStep(step + 1)} />
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
  brand: { fontSize: 22, fontWeight: '900', color: t.colors.primary, letterSpacing: -0.5 },
  hero: {
    width: 208,
    height: 208,
    borderRadius: 104,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  heroEmoji: { fontSize: 88, lineHeight: 104 },
  body: { maxWidth: 340, fontSize: 16, lineHeight: 23 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.dark ? 'rgba(255,248,238,0.18)' : 'rgba(22,19,15,0.14)',
  },
  dotActive: { width: 24, backgroundColor: t.colors.primary },
  footer: { padding: 24, gap: 8, width: '100%', maxWidth: 480, alignSelf: 'center' },
}));
