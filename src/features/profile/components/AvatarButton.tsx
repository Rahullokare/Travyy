import { router } from 'expo-router';
import { useSession } from '@/features/auth/session';
import { makeStyles } from '@/shared/theme';
import { Avatar, Icon, PressableScale } from '@/shared/ui';

/**
 * The way into "You": top right of each tab, where people look for their account. It took the
 * place of a fourth tab so the bar holds only the things you browse (map, saves, vaults, trips).
 */
export function AvatarButton() {
  const styles = useStyles();
  const session = useSession();
  const email = session?.user.email;
  return (
    <PressableScale
      scale={0.92}
      hitSlop={6}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="You: profile and settings"
      onPress={() => router.push('/profile')}
    >
      {email ? (
        <Avatar name={email} seed={session.user.id} size={40} />
      ) : (
        <Icon name="person" size={20} color="textMuted" />
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceSunken,
    overflow: 'hidden',
  },
}));
