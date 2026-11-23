import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CATEGORIES, type Category, type LatLng } from '@/domain/models';
import { CATEGORY_META } from '@/features/places/categories';
import { customVaultSummaries } from '@/features/places/vaults';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { Map } from '@/shared/map';
import { lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, Chip, ChipRow, EmptyState, Icon, ScreenScroll, Text, TextField } from '@/shared/ui';
import { useAppStore } from '@/store';
import { reverseGeocode } from '../api/geocoding';

function parsePoint(lat?: string, lng?: string): LatLng | undefined {
  const point = { lat: Number(lat), lng: Number(lng) };
  const ok =
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180;
  return ok ? point : undefined;
}

/** "Praça Dom Pedro IV, Santa Justa, …" → "Praça Dom Pedro IV": a street or square beats a blank name. */
function firstNamedPart(address?: string): string | undefined {
  return address
    ?.split(',')
    .map((part) => part.trim())
    .find((part) => part && !/^\d[\d\s-]*$/.test(part));
}

/**
 * Saving a spot straight from the map (`/add-place?lat=…&lng=…`): a pin dropped by press-and-hold
 * or by "Drop a pin". The address is looked up while the person types; if the point is on
 * something named (a café, a viewpoint) that name and its kind are filled in for them.
 */
export function AddPlaceScreen() {
  const styles = useStyles();
  const { dark } = useTheme();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const point = useMemo(() => parsePoint(params.lat, params.lng), [params.lat, params.lng]);
  const addPlaces = useAppStore((s) => s.addPlaces);
  const addToVault = useAppStore((s) => s.addToVault);
  const vaults = useAppStore((s) => s.vaults);
  const places = useAppStore((s) => s.places);
  const yours = useMemo(() => customVaultSummaries(vaults, places), [vaults, places]);

  // Undefined until the person types or picks: until then the map's guess shows.
  const [typedName, setTypedName] = useState<string>();
  const [pickedCategory, setPickedCategory] = useState<Category>();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const where = useQuery({
    queryKey: ['reverse-geocode', point?.lat.toFixed(5), point?.lng.toFixed(5)],
    // null, not undefined, when nothing is there (the sea): React Query rejects undefined.
    queryFn: async ({ signal }) => (await reverseGeocode(point!, signal)) ?? null,
    enabled: !!point,
    staleTime: Infinity,
  });

  // What the map knows fills the form until the person changes it.
  const name = typedName ?? where.data?.name ?? firstNamedPart(where.data?.address) ?? '';
  const category = pickedCategory ?? where.data?.category ?? 'other';

  const markers = useMemo(
    () =>
      point
        ? [
            {
              id: 'pin',
              coordinate: point,
              color: CATEGORY_META[category].color,
              icon: CATEGORY_META[category].icon,
              selected: true,
            },
          ]
        : [],
    [point, category],
  );

  if (!point) {
    return (
      <EmptyState
        icon="pin"
        title="No spot picked"
        body="Press and hold anywhere on the map to drop a pin, then save it from there."
      />
    );
  }

  const area = [where.data?.city, where.data?.country].filter(Boolean).join(', ');
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const [id] = addPlaces([
      {
        name: name.trim(),
        category,
        lat: point.lat,
        lng: point.lng,
        city: where.data?.city,
        country: where.data?.country,
        countryCode: where.data?.countryCode,
        address: where.data?.address,
        note: note.trim() || undefined,
        sourcePlatform: 'manual',
      },
    ]);
    for (const vaultId of picked) addToVault(vaultId, [id]);
    track('places_saved', { count: 1, platform: 'manual' });
    if (picked.length) track('places_added_to_vault', { count: picked.length, from: 'map' });
    haptics.success();
    // Swap this form for the saved spot, so Back returns to the map it came from.
    router.replace(`/place/${id}`);
  };

  return (
    <ScreenScroll
      contentStyle={styles.content}
      automaticallyAdjustKeyboardInsets
      footer={
        <View style={styles.footer}>
          <Button title="Save spot" iconName="bookmark" onPress={save} disabled={!canSave} />
        </View>
      }
    >
      <View style={[styles.mapWrap, lift(dark)]}>
        <Map markers={markers} initialPoints={[point]} interactive={false} />
      </View>
      <View style={styles.whereRow}>
        <Icon name="location" size={16} color="textMuted" />
        {where.isPending ? (
          <>
            <ActivityIndicator size="small" />
            <Text variant="caption">Finding where this is…</Text>
          </>
        ) : (
          <Text variant="caption" numberOfLines={2} style={styles.flex}>
            {where.data?.address ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
          </Text>
        )}
      </View>

      <TextField
        label="Name"
        value={name}
        onChangeText={setTypedName}
        placeholder={where.isPending ? 'Looking it up…' : 'What is this place?'}
        autoFocus={false}
        returnKeyType="done"
        hint={area ? `In ${area}` : undefined}
      />

      <View style={styles.group}>
        <Text variant="label">What kind of place</Text>
        <ChipRow bleed>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_META[c].label}
              icon={CATEGORY_META[c].icon}
              color={CATEGORY_META[c].color}
              selected={category === c}
              onPress={() => {
                haptics.selection();
                setPickedCategory(c);
              }}
            />
          ))}
        </ChipRow>
      </View>

      {yours.length ? (
        <View style={styles.group}>
          <Text variant="label">Add to vaults</Text>
          <ChipRow bleed>
            {yours.map((v) => (
              <Chip
                key={v.id}
                label={`${v.emoji} ${v.name}`}
                selected={picked.includes(v.id)}
                onPress={() => {
                  haptics.selection();
                  setPicked((now) => (now.includes(v.id) ? now.filter((x) => x !== v.id) : [...now, v.id]));
                }}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <TextField
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder="Who told you about it, what to order…"
        multiline
      />
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.xl },
  mapWrap: {
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -spacing.sm },
  group: { gap: spacing.sm },
  footer: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
}));
