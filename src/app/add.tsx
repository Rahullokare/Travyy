import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Card } from '../components/ui';
import { CATEGORIES, CATEGORY_META } from '../lib/categories';
import { extractFromInput, searchPlaces, type ExtractionResult } from '../lib/extract';
import { detectPlatform, extractUrl, PLATFORM_LABEL } from '../lib/links';
import { FREE_SAVE_LIMIT, useStore } from '../lib/store';
import { colors, radius, space, type } from '../lib/theme';
import type { Candidate } from '../lib/types';

type Phase = 'input' | 'loading' | 'review';

export default function AddScreen() {
  // Deep links: travyy://add?url=...&text=... (used by iOS Shortcuts / Android share targets)
  const params = useLocalSearchParams<{ url?: string; text?: string }>();
  const [link, setLink] = useState(params.url ?? '');
  const [caption, setCaption] = useState(params.text ?? '');
  const [showCaption, setShowCaption] = useState(!!params.text);
  const [phase, setPhase] = useState<Phase>('input');
  const [result, setResult] = useState<ExtractionResult>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [error, setError] = useState<string>();

  const places = useStore((s) => s.places);
  const isPro = useStore((s) => s.isPro);
  const addPlaces = useStore((s) => s.addPlaces);

  useEffect(() => {
    // hasStringAsync doesn't trigger the iOS paste prompt; we only read on tap.
    Clipboard.hasStringAsync().then(setHasClipboard).catch(() => {});
  }, []);

  useEffect(() => {
    if (params.url || params.text) run(params.url, params.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    const url = extractUrl(text);
    if (url) {
      setLink(url);
      const rest = text.replace(url, '').trim();
      if (rest.length > 20) {
        setCaption(rest);
        setShowCaption(true);
      }
    } else if (text.trim()) {
      setCaption(text.trim());
      setShowCaption(true);
    }
  };

  async function run(urlArg?: string, textArg?: string) {
    const url = extractUrl(urlArg ?? link);
    const text = (textArg ?? caption).trim() || undefined;
    if (!url && !text) {
      setError('Paste a link, or a caption that mentions places.');
      return;
    }
    setError(undefined);
    setPhase('loading');
    try {
      const res = await extractFromInput({ url, text });
      const located = res.candidates.filter((c) => c.lat !== undefined);
      if (located.length === 0 && !url && text) {
        // A plain name like "Ichiran Shibuya": treat it as a place search.
        const found = await searchPlaces(text);
        res.candidates = found.slice(0, 5);
      }
      setResult(res);
      setCandidates(res.candidates);
      setSelected(new Set(res.candidates.map((c, i) => (c.lat !== undefined && c.confidence >= 0.5 ? i : -1)).filter((i) => i >= 0)));
      setPhase('review');
    } catch {
      setError("Couldn't reach the internet. Check your connection and try again.");
      setPhase('input');
    }
  }

  const fixCandidate = async (i: number) => {
    const c = candidates[i];
    const [hit] = await searchPlaces([c.name, c.city].filter(Boolean).join(' '));
    if (!hit) return;
    const next = [...candidates];
    next[i] = { ...c, ...hit, name: c.name, category: c.category };
    setCandidates(next);
    setSelected(new Set(selected).add(i));
  };

  const cycleCategory = (i: number) => {
    const next = [...candidates];
    const idx = CATEGORIES.indexOf(next[i].category);
    next[i] = { ...next[i], category: CATEGORIES[(idx + 1) % CATEGORIES.length] };
    setCandidates(next);
  };

  const save = () => {
    const chosen = candidates.filter((c, i) => selected.has(i) && c.lat !== undefined && c.lng !== undefined);
    if (!isPro && places.length + chosen.length > FREE_SAVE_LIMIT) {
      router.push('/paywall');
      return;
    }
    const url = extractUrl(link);
    addPlaces(
      chosen.map((c) => ({
        name: c.name,
        city: c.city,
        country: c.country,
        category: c.category,
        lat: c.lat!,
        lng: c.lng!,
        address: c.address,
        sourceUrl: url,
        sourcePlatform: url ? detectPlatform(url) : 'manual',
      })),
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 56 }}>🔎</Text>
        <Text style={type.h2}>Finding the spots…</Text>
        <Text style={type.small}>Reading the caption and pinning every place it mentions.</Text>
      </View>
    );
  }

  if (phase === 'review' && result) {
    const count = [...selected].filter((i) => candidates[i]?.lat !== undefined).length;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          <Text style={type.title}>
            {candidates.length === 0 ? 'No places found' : `Found ${candidates.length} place${candidates.length === 1 ? '' : 's'}`}
          </Text>
          <Text style={type.small}>
            {result.platform !== 'manual' ? `From ${PLATFORM_LABEL[result.platform]} · ` : ''}
            {result.engine === 'ai' ? 'AI extraction' : result.engine === 'maps-link' ? 'Maps link' : 'On-device extraction'}
          </Text>
          {candidates.length === 0 ? (
            <Card style={{ gap: space.sm }}>
              <Text style={type.body}>
                {result.platform === 'instagram'
                  ? "Instagram hides captions from apps without login. Open the reel, tap ••• → Copy caption (or copy the place names), and paste it below."
                  : 'We couldn’t spot a place name. Paste the caption, or type the place name and city.'}
              </Text>
              <Button title="Add caption or place name" variant="secondary" onPress={() => { setShowCaption(true); setPhase('input'); }} />
            </Card>
          ) : null}
          {candidates.map((c, i) => {
            const on = selected.has(i);
            const located = c.lat !== undefined;
            const meta = CATEGORY_META[c.category];
            return (
              <Pressable
                key={`${c.name}-${i}`}
                onPress={() => {
                  if (!located) return;
                  const next = new Set(selected);
                  if (on) next.delete(i);
                  else next.add(i);
                  setSelected(next);
                }}
                style={[styles.candidate, on && located && styles.candidateOn]}
              >
                <Ionicons
                  name={located ? (on ? 'checkmark-circle' : 'ellipse-outline') : 'alert-circle-outline'}
                  size={26}
                  color={located ? (on ? colors.primary : colors.muted) : '#D97706'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.candName}>{c.name}</Text>
                  <Text style={type.small} numberOfLines={1}>
                    {located ? c.address ?? [c.city, c.country].filter(Boolean).join(', ') : "Couldn't pin this one on the map"}
                  </Text>
                </View>
                {located ? (
                  <Pressable onPress={() => cycleCategory(i)} style={[styles.catPill, { backgroundColor: `${meta.color}22` }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: meta.color }}>
                      {meta.emoji} {meta.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => fixCandidate(i)} style={styles.catPill}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>Search</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={count ? `Save ${count} spot${count === 1 ? '' : 's'}` : 'Select spots to save'} disabled={!count} onPress={save} />
          <Button title="Start over" variant="ghost" onPress={() => setPhase('input')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Text style={type.title}>Drop a link, get the spots</Text>
        <Text style={type.small}>Works with Instagram Reels, TikToks, YouTube, Google Maps links — or just type a place.</Text>

        {hasClipboard && !link ? (
          <Pressable style={styles.pasteBanner} onPress={paste}>
            <Ionicons name="clipboard" size={20} color={colors.primary} />
            <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>Paste from clipboard</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </Pressable>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Link</Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://www.instagram.com/reel/…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            returnKeyType="go"
            onSubmitEditing={() => run()}
          />
        </View>

        {showCaption ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.label}>Caption or place names</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder={'📍 Cervejaria Ramiro, Lisbon\n1. Time Out Market\n2. Pastéis de Belém'}
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, { minHeight: 140, textAlignVertical: 'top', paddingTop: space.md }]}
            />
          </View>
        ) : (
          <Pressable onPress={() => setShowCaption(true)}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>+ Paste a caption or type a place name instead</Text>
          </Pressable>
        )}

        {error ? <Text style={{ color: colors.primaryDark }}>{error}</Text> : null}
        <Button title="Find places" onPress={() => run()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 50,
    fontSize: 16,
    color: colors.text,
  },
  pasteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  candidateOn: { borderColor: colors.primary },
  candName: { fontSize: 16, fontWeight: '700', color: colors.text },
  catPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  footer: { padding: space.lg, gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
