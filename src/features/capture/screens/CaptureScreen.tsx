import { useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { CATEGORIES, CATEGORY_META } from '@/features/places/categories';
import { useEntitlements } from '@/features/paywall/entitlements';
import type { Candidate } from '@/domain/models';
import { env } from '@/shared/config/env';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { makeStyles, useTheme } from '@/shared/theme';
import { Button, Card, Icon, PressableScale, ScreenScroll, Text, TextField } from '@/shared/ui';
import { useAppStore } from '@/store';
import { extractPlaces, type ExtractionInput, type ExtractionResult } from '../api/extract';
import { searchPlaces } from '../api/geocoding';
import { detectPlatform, extractUrl, PLATFORM_LABEL } from '../links';

const ENGINE_LABEL: Record<ExtractionResult['engine'], string> = {
  ai: 'AI extraction',
  rules: 'On-device extraction',
  'maps-link': 'Maps link',
  search: 'Place search',
};

/**
 * Link/caption → review → save. Deep link: travyy://add?url=…&text=…
 * (the native share extension will route here with the same params).
 */
export function CaptureScreen({ initialUrl, initialText }: { initialUrl?: string; initialText?: string }) {
  const styles = useStyles();
  const [link, setLink] = useState(initialUrl ?? '');
  const [caption, setCaption] = useState(initialText ?? '');
  const [showCaption, setShowCaption] = useState(!!initialText);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [validation, setValidation] = useState<string>();

  const extraction = useMutation({
    mutationFn: (input: ExtractionInput) => extractPlaces(input),
    onSuccess: (res) =>
      track('extraction_completed', {
        platform: res.platform,
        engine: res.engine,
        found: res.candidates.length,
      }),
  });

  useEffect(() => {
    // hasStringAsync never triggers the iOS paste prompt; we only read on an explicit tap.
    Clipboard.hasStringAsync()
      .then(setHasClipboard)
      .catch(() => setHasClipboard(false));
  }, []);

  // Deep links arrive pre-filled: start extracting immediately (once).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || (!initialUrl && !initialText)) return;
    autoStarted.current = true;
    extraction.mutate({ url: initialUrl, text: initialText });
  }, [extraction, initialUrl, initialText]);

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    const url = extractUrl(text);
    if (url) {
      setLink(url);
      const rest = text.replace(url, '').trim();
      if (rest.length > 20) {
        setCaption(rest);
        setShowCaption(true);
      }
    } else if (text) {
      setCaption(text);
      setShowCaption(true);
    }
  };

  const submit = () => {
    if (!extractUrl(link) && !caption.trim()) {
      setValidation('Paste a link, or a caption that mentions places.');
      return;
    }
    setValidation(undefined);
    extraction.mutate({ url: link || undefined, text: caption || undefined });
  };

  if (extraction.isPending) return <FindingSpots />;

  if (extraction.isSuccess) {
    return (
      <Review
        result={extraction.data}
        onRestart={() => {
          extraction.reset();
          setShowCaption(true);
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenScroll>
        <Text variant="title">Drop a link, get the spots</Text>
        <Text variant="caption">
          Instagram Reels, TikToks, YouTube and Google Maps links — or just type a place name.
        </Text>

        {hasClipboard && !link ? (
          <PressableScale scale={0.98} style={styles.pasteBanner} onPress={paste} accessibilityRole="button">
            <Icon name="clipboard" size={20} color="primary" />
            <Text variant="bodyStrong" style={styles.flex}>
              Paste from clipboard
            </Text>
            <Icon name="arrow-forward" size={18} color="primary" />
          </PressableScale>
        ) : null}

        <TextField
          label="Link"
          value={link}
          onChangeText={setLink}
          placeholder="https://www.instagram.com/reel/…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {showCaption ? (
          <TextField
            label="Caption or place names"
            value={caption}
            onChangeText={setCaption}
            placeholder={'📍 Cervejaria Ramiro, Lisbon\n1. Time Out Market\n2. Pastéis de Belém'}
            multiline
          />
        ) : (
          <Pressable onPress={() => setShowCaption(true)} accessibilityRole="button" hitSlop={10}>
            {({ pressed }) => (
              <Text variant="bodyStrong" color="accent" style={pressed && styles.linkPressed}>
                + Paste a caption or type a place name instead
              </Text>
            )}
          </Pressable>
        )}

        {validation || extraction.isError ? (
          <Text color="danger">
            {validation ?? "Couldn't reach the internet. Check your connection and try again."}
          </Text>
        ) : null}
        <Button title="Find places" onPress={submit} />
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

/** Loading state. After a few seconds, explain the wait (a sleeping free-tier server takes up to a minute). */
function FindingSpots() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.center}>
      <View style={styles.searchBadge}>
        <Text style={styles.bigEmoji}>🔎</Text>
      </View>
      <Text variant="heading">Finding the spots…</Text>
      <Text variant="caption" align="center">
        {slow
          ? 'Still working. The first lookup after a quiet spell can take up to a minute while our server wakes up.'
          : 'Reading the caption and pinning every place it mentions.'}
      </Text>
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
    </View>
  );
}

function Review({ result, onRestart }: { result: ExtractionResult; onRestart: () => void }) {
  const styles = useStyles();
  const addPlaces = useAppStore((s) => s.addPlaces);
  const { canSave } = useEntitlements();
  const [candidates, setCandidates] = useState<Candidate[]>(result.candidates);
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(result.candidates.flatMap((c, i) => (c.lat !== undefined && c.confidence >= 0.5 ? [i] : []))),
  );
  const fix = useMutation({
    mutationFn: async (i: number) => {
      const c = candidates[i];
      const [hit] = await searchPlaces([c.name, c.city].filter(Boolean).join(' '), { limit: 1 });
      return { i, hit };
    },
    onSuccess: ({ i, hit }) => {
      if (!hit) return;
      setCandidates((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, ...hit, name: c.name, category: c.category } : c)),
      );
      setSelected((prev) => new Set(prev).add(i));
    },
  });

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const cycleCategory = (i: number) =>
    setCandidates((prev) =>
      prev.map((c, idx) =>
        idx === i
          ? { ...c, category: CATEGORIES[(CATEGORIES.indexOf(c.category) + 1) % CATEGORIES.length] }
          : c,
      ),
    );

  const chosen = candidates.filter((c, i) => selected.has(i) && c.lat !== undefined && c.lng !== undefined);

  const save = () => {
    if (!canSave(chosen.length)) {
      track('paywall_viewed', { trigger: 'save_limit' });
      router.push('/paywall');
      return;
    }
    const platform = result.sourceUrl ? detectPlatform(result.sourceUrl) : 'manual';
    addPlaces(
      chosen.map((c) => ({
        name: c.name,
        city: c.city,
        country: c.country,
        category: c.category,
        lat: c.lat!,
        lng: c.lng!,
        address: c.address,
        sourceUrl: result.sourceUrl,
        sourcePlatform: platform,
      })),
    );
    track('places_saved', { count: chosen.length, platform });
    haptics.success();
    router.back();
  };

  return (
    <View style={styles.flex}>
      <ScreenScroll>
        <Text variant="title">
          {candidates.length === 0
            ? 'No places found'
            : `Found ${candidates.length} place${candidates.length === 1 ? '' : 's'}`}
        </Text>
        <Text variant="caption">
          {result.platform !== 'manual' ? `From ${PLATFORM_LABEL[result.platform]} · ` : ''}
          {ENGINE_LABEL[result.engine]}
        </Text>

        {candidates.length === 0 ? (
          <Card style={styles.gap}>
            <Text>
              {result.platform === 'instagram'
                ? env.apiUrl
                  ? 'We couldn’t read this post’s caption. It may be private, or Instagram blocked the request. Copy the caption, or just the place names, and paste it here. Your link is kept.'
                  : 'Instagram doesn’t let apps read captions. Copy the caption, or just the place names, from the post and paste it here. Your link is kept.'
                : 'We couldn’t spot a place name. Paste the caption, or type the place name and city.'}
            </Text>
            <Button title="Add caption or place name" variant="secondary" onPress={onRestart} />
          </Card>
        ) : null}

        {candidates.map((c, i) => {
          const on = selected.has(i);
          const located = c.lat !== undefined;
          const meta = CATEGORY_META[c.category];
          return (
            <PressableScale
              key={`${c.name}-${i}`}
              scale={0.98}
              disabled={!located}
              onPress={() => toggle(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on && located, disabled: !located }}
              style={[styles.candidate, on && located && styles.candidateOn]}
            >
              <Icon
                name={located ? (on ? 'checkmark-circle' : 'ellipse-outline') : 'alert-circle-outline'}
                size={26}
                color={located ? (on ? 'primary' : 'textMuted') : 'warning'}
              />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{c.name}</Text>
                <Text variant="caption" numberOfLines={1}>
                  {located
                    ? (c.address ?? [c.city, c.country].filter(Boolean).join(', '))
                    : "Couldn't pin this one on the map"}
                </Text>
              </View>
              {located ? (
                <Pressable
                  onPress={() => cycleCategory(i)}
                  accessibilityLabel={`Category ${meta.label}, tap to change`}
                  style={[styles.pill, { backgroundColor: `${meta.color}22` }]}
                >
                  <Text variant="caption" style={[styles.pillText, { color: meta.color }]}>
                    {meta.emoji} {meta.label}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => fix.mutate(i)}
                  disabled={fix.isPending}
                  accessibilityLabel={`Search for ${c.name}`}
                  style={styles.pill}
                >
                  <Text variant="caption" color="accent" style={styles.pillText}>
                    {fix.isPending && fix.variables === i ? 'Searching…' : 'Search'}
                  </Text>
                </Pressable>
              )}
            </PressableScale>
          );
        })}
      </ScreenScroll>
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <Button
            title={
              chosen.length
                ? `Save ${chosen.length} spot${chosen.length === 1 ? '' : 's'}`
                : 'Select spots to save'
            }
            disabled={!chosen.length}
            onPress={save}
          />
          <Button title="Start over" variant="ghost" onPress={onRestart} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  gap: { gap: 12 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: t.colors.background,
  },
  searchBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bigEmoji: { fontSize: 48, lineHeight: 58 },
  spinner: { marginTop: 8 },
  linkPressed: { opacity: 0.6 },
  pasteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.primarySoft,
  },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.border,
  },
  candidateOn: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.colors.accentSoft,
  },
  pillText: { fontWeight: '700', fontSize: 12 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
    padding: 16,
  },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 4 },
}));
