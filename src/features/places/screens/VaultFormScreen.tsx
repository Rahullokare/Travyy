import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { confirm, haptics, notify } from '@/shared/lib/platform';
import { makeStyles, radius, spacing } from '@/shared/theme';
import { Button, Chip, EmptyState, ScreenScroll, Section, Text, TextField } from '@/shared/ui';
import { useAppStore } from '@/store';
import { leaveVault, SharingError } from '../sharing';
import { DEFAULT_VAULT_EMOJI, VAULT_EMOJI, VAULT_IDEAS } from '../vaults';

/**
 * Make a vault, or rename one. Opened from a place ("Add to vault → New vault"), the new vault
 * starts with that place in it and closes back to where you were.
 */
export function VaultFormScreen({ id, placeId }: { id?: string; placeId?: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const existing = useAppStore((s) => (id ? s.vaults.find((v) => v.id === id) : undefined));
  const createVault = useAppStore((s) => s.createVault);
  const updateVault = useAppStore((s) => s.updateVault);
  const removeVault = useAppStore((s) => s.removeVault);
  const share = useAppStore((s) => (id ? s.shared[id] : undefined));
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState<string>(existing?.emoji ?? DEFAULT_VAULT_EMOJI);
  const editing = !!existing;
  const valid = name.trim().length > 0;

  const close = (open?: string) => {
    if (router.canDismiss()) router.dismiss();
    if (open) router.push({ pathname: '/vaults/[id]', params: { id: open } });
  };

  const save = () => {
    if (!valid) return;
    haptics.success();
    if (existing) {
      updateVault(existing.id, { name, emoji });
      return router.back();
    }
    const vaultId = createVault({ name, emoji, placeIds: placeId ? [placeId] : [] });
    track('vault_created', { from: placeId ? 'place' : 'saves' });
    // From a place, go back to the vault picker, which now shows the new vault ticked.
    if (placeId) return router.back();
    close(vaultId);
  };

  const onDelete = async () => {
    if (!existing) return;
    if (
      await confirm({
        title: `Delete “${existing.name}”?`,
        message: share
          ? 'It’s deleted for everyone you shared it with. The spots stay in your saves.'
          : 'The spots in it stay in your saves.',
        confirmText: 'Delete vault',
        destructive: true,
      })
    ) {
      // The vault screen underneath is gone too: back to the Saves tab.
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/saves');
      removeVault(existing.id);
    }
  };

  const onLeave = async () => {
    if (!existing) return;
    if (
      !(await confirm({
        title: `Leave “${existing.name}”?`,
        message:
          'It goes from your vaults. Spots it brought stay in your saves. You can join again with the link.',
        confirmText: 'Leave',
        destructive: true,
      }))
    ) {
      return;
    }
    setLeaving(true);
    try {
      await leaveVault(existing.id);
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/saves');
    } catch (error) {
      setLeaving(false);
      notify(
        'Couldn’t leave',
        error instanceof SharingError ? error.message : 'Check your connection and try again.',
      );
    }
  };

  // Someone else's vault: its name is theirs to change. What you can do is leave.
  if (share?.role === 'member' && existing) {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: existing.name }} />
        <EmptyState
          icon="people"
          title="A friend’s vault"
          body={`You joined ${existing.name}. Everyone in it can add and take out spots; only the person who made it can rename or delete it.`}
          action={
            <Button
              title="Leave vault"
              variant="secondary"
              iconName="exit-outline"
              loading={leaving}
              onPress={onLeave}
            />
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: editing ? 'Edit vault' : 'New vault' }} />
      <ScreenScroll automaticallyAdjustKeyboardInsets>
        <View style={styles.preview}>
          <Text style={styles.previewEmoji} accessibilityElementsHidden>
            {emoji}
          </Text>
        </View>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Cafés to try, Goa weekend…"
          maxLength={60}
          autoFocus={!editing}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {!editing && !name ? (
          <View style={styles.wrap}>
            {VAULT_IDEAS.map((idea) => (
              <Chip
                key={idea.name}
                label={`${idea.emoji} ${idea.name}`}
                accessibilityLabel={idea.name}
                onPress={() => {
                  haptics.selection();
                  setName(idea.name);
                  setEmoji(idea.emoji);
                }}
              />
            ))}
          </View>
        ) : null}
        <Section title="Icon">
          <View style={styles.wrap}>
            {VAULT_EMOJI.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  haptics.selection();
                  setEmoji(e);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: emoji === e }}
                aria-checked={emoji === e}
                accessibilityLabel={`Icon ${e}`}
                style={({ pressed }) => [
                  styles.emoji,
                  emoji === e && styles.emojiSelected,
                  pressed && styles.emojiPressed,
                ]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
        {editing ? (
          <Button title="Delete vault" variant="ghost" iconName="trash-outline" onPress={onDelete} />
        ) : null}
      </ScreenScroll>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.footerInner}>
          <Button
            title={editing ? 'Save changes' : 'Create vault'}
            iconName={editing ? 'checkmark' : 'add'}
            disabled={!valid}
            onPress={save}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  preview: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: { fontSize: 44, lineHeight: 56 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceSunken,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiSelected: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
  emojiPressed: { opacity: 0.7 },
  emojiText: { fontSize: 24, lineHeight: 30 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
}));
