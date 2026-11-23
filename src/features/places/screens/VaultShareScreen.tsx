import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/features/auth/session';
import { webBase } from '@/features/trips/shareLink';
import { track } from '@/shared/lib/analytics';
import { confirm, haptics, notify, shareText } from '@/shared/lib/platform';
import { makeStyles, radius, spacing } from '@/shared/theme';
import { Button, Card, EmptyState, IconBadge, Pill, ScreenScroll, Text } from '@/shared/ui';
import { useAppStore } from '@/store';
import { inviteToVault, SharingError, sharingAvailable, stopSharingVault } from '../sharing';
import { vaultShareText, vaultShareUrl } from '../vaultLink';
import { vaultSummary } from '../vaults';

/**
 * Two ways to share a vault, side by side so the difference is clear: send a copy (a link anyone
 * can open, no account) or build it together (friends join and everyone's additions show up).
 */
export function VaultShareScreen({ id }: { id: string }) {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const share = useAppStore((s) => s.shared[id]);
  const vault = useMemo(() => vaultSummary(id, vaults, places), [id, vaults, places]);
  const session = useSession();
  const [busy, setBusy] = useState<'invite' | 'stop'>();

  if (!vault) {
    return <EmptyState icon="trash-outline" title="Vault not found" body="It may have been deleted." />;
  }
  const emoji = vault.custom ? vault.emoji : undefined;

  const sendCopy = async () => {
    const url = vaultShareUrl({ name: vault.name, emoji }, vault.places);
    track('vault_shared', { spots: vault.places.length, link: !!url });
    await shareText(vaultShareText({ name: vault.name, emoji }, vault.places, url), vault.name);
  };

  const invite = async () => {
    if (!session) return router.push({ pathname: '/sign-in', params: { next: `/vaults/${vault.id}/share` } });
    setBusy('invite');
    try {
      const url = await inviteToVault(vault.id);
      track('vault_invite_sent', { spots: vault.places.length });
      haptics.success();
      await shareText(
        `Add your spots to ${emoji ? `${emoji} ` : ''}${vault.name} with me on Travyy:\n${url}`,
        vault.name,
      );
    } catch (error) {
      notify(
        'Couldn’t make the invite',
        error instanceof SharingError ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(undefined);
    }
  };

  const stop = async () => {
    if (
      !(await confirm({
        title: 'Stop sharing?',
        message: 'Everyone else leaves the vault and the invite link stops working. Your spots stay.',
        confirmText: 'Stop sharing',
        destructive: true,
      }))
    ) {
      return;
    }
    setBusy('stop');
    try {
      await stopSharingVault(vault.id);
      haptics.success();
    } catch (error) {
      notify(
        'Couldn’t stop sharing',
        error instanceof SharingError ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(undefined);
    }
  };

  const people = share?.people ?? 1;

  return (
    <ScreenScroll>
      <Stack.Screen options={{ title: `Share ${vault.name}` }} />

      <Card style={styles.option}>
        <View style={styles.head}>
          <IconBadge icon="paper-plane" color="#2F6FE0" size={44} />
          <View style={styles.flex}>
            <Text variant="heading">Send a copy</Text>
            <Text variant="caption">
              {webBase()
                ? `Friends see the ${vault.places.length} spots on a map, even without the app, and can add them to their own Travyy. Later changes don’t reach them.`
                : `Sends the ${vault.places.length} spots as a list friends can read anywhere. Later changes don’t reach them.`}
            </Text>
          </View>
        </View>
        <Button
          title={webBase() ? 'Share link' : 'Share list'}
          iconName="share-outline"
          variant="secondary"
          onPress={sendCopy}
        />
      </Card>

      {vault.custom && sharingAvailable ? (
        <Card style={styles.option}>
          <View style={styles.head}>
            <IconBadge icon="people" color="#22945F" size={44} />
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Text variant="heading">Build it together</Text>
                {share ? (
                  <Pill tone="success" icon="people" label={people > 1 ? `${people} people` : 'Waiting'} />
                ) : null}
              </View>
              <Text variant="caption">
                {share?.role === 'member'
                  ? 'You joined this vault. Invite more friends: everyone can add spots and sees what the others add.'
                  : share
                    ? people > 1
                      ? 'Everyone in it can add spots and sees what the others add. You keep your own visited and ❤ marks.'
                      : 'Shared. Nobody has joined yet: send the invite link to your group chat.'
                    : 'Friends who join can add spots, and everyone sees what the others add. Each person keeps their own visited and ❤ marks.'}
              </Text>
            </View>
          </View>
          <Button
            title={session ? (share ? 'Send invite link' : 'Invite friends') : 'Sign in to invite friends'}
            iconName={session ? 'person-add' : 'log-in-outline'}
            loading={busy === 'invite'}
            disabled={!!busy}
            onPress={invite}
          />
          {share?.role === 'owner' ? (
            <Button
              title="Stop sharing"
              variant="ghost"
              size="md"
              loading={busy === 'stop'}
              disabled={!!busy}
              onPress={stop}
            />
          ) : null}
          {!session ? (
            <Text variant="caption" color="textSubtle" align="center">
              An account keeps the vault in step across everyone’s phones. Free, with an email code.
            </Text>
          ) : null}
        </Card>
      ) : null}
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  option: { gap: spacing.md, borderRadius: radius.lg },
  head: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
}));
