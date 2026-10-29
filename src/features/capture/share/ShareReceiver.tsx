import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { track } from '@/shared/lib/analytics';
import { useTheme } from '@/shared/theme';
import { useAppStore } from '@/store';
import { detectPlatform } from '../links';
import { readIncomingShare } from './readIncomingShare';
import { useShareInbox } from './shareInbox';

/**
 * Landing screen for `<scheme>://expo-sharing`, the deep link the iOS share extension
 * and Android SEND intent open after "Share to Travyy". It reads the shared link,
 * then replaces itself with the capture flow, which starts extracting immediately.
 */
export function ShareReceiver() {
  const { colors } = useTheme();
  const onboarded = useAppStore((s) => s.onboarded);

  useEffect(() => {
    const content = readIncomingShare();
    if (!content) {
      router.replace('/');
      return;
    }
    track('share_received', { platform: content.url ? detectPlatform(content.url) : 'manual' });
    if (onboarded) {
      router.replace({ pathname: '/add', params: { ...content } });
    } else {
      // First launch straight from the share sheet: onboard first, then capture.
      useShareInbox.getState().hold(content);
      router.replace('/');
    }
    // Runs once per share: each share opens this route afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
