import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { SAMPLE_PLACES } from '../lib/sampleData';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../lib/theme';

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
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const addPlaces = useStore((s) => s.addPlaces);
  const complete = useStore((s) => s.completeOnboarding);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>travyy</Text>
        <View style={styles.hero}>
          <Text style={{ fontSize: 88 }}>{s.emoji}</Text>
        </View>
        <Text style={[type.hero, { textAlign: 'center' }]}>{s.title}</Text>
        <Text style={[type.body, styles.body]}>{s.body}</Text>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {isLast ? (
          <>
            <Button
              title="Start with sample spots"
              onPress={() => {
                addPlaces(SAMPLE_PLACES);
                complete();
              }}
            />
            <Button title="Start empty" variant="ghost" onPress={complete} />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  brand: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  hero: {
    width: 200,
    height: 200,
    borderRadius: radius.lg * 4,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.lg,
  },
  body: { textAlign: 'center', color: colors.muted, maxWidth: 320 },
  dots: { flexDirection: 'row', gap: 6, marginTop: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  footer: { padding: space.xl, gap: space.sm },
});
