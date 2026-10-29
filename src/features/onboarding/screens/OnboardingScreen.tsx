import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { makeStyles } from '@/shared/theme';
import { Button, Text } from '@/shared/ui';
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

export function OnboardingScreen() {
  const styles = useStyles();
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
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{current.emoji}</Text>
        </View>
        <Text variant="hero" align="center">
          {current.title}
        </Text>
        <Text color="textMuted" align="center" style={styles.body}>
          {current.body}
        </Text>
        <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === step && styles.dotActive]} />
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
  brand: { fontSize: 22, fontWeight: '900', color: t.colors.primary, letterSpacing: -0.5 },
  hero: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  heroEmoji: { fontSize: 88, lineHeight: 104 },
  body: { maxWidth: 340 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.border },
  dotActive: { width: 24, backgroundColor: t.colors.primary },
  footer: { padding: 24, gap: 8, width: '100%', maxWidth: 480, alignSelf: 'center' },
}));
