import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { fontFor, makeStyles } from '@/shared/theme';
import { Button, Icon, ScreenScroll, Text, TextField } from '@/shared/ui';
import { enabledProviders, sendEmailCode, signInWithProvider, verifyEmailCode } from '../session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase sends 6 digits by default; the length is configurable up to 10. */
const CODE = /^\d{6,10}$/;

/** Supabase errors are English sentences already; the common ones get a friendlier one. */
function message(error: unknown, step: 'send' | 'verify' | 'google'): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/rate limit|only request this after/i.test(text))
    return 'Too many codes sent. Wait a minute and try again.';
  // No code exists yet while sending, so "invalid" there is about the address.
  if (step === 'send' && /is invalid\b|invalid format/i.test(text))
    return "That email address isn't valid. Check it and try again.";
  if (step === 'verify' && /expired|invalid/i.test(text))
    return 'That code is wrong or has expired. Check it, or send a new one.';
  if (step === 'google' && /provider is not enabled|unsupported provider/i.test(text))
    return 'Google sign-in isn’t switched on yet. Use your email for now.';
  if (/network|fetch/i.test(text)) return 'No connection. Check your internet and try again.';
  return text;
}

/**
 * Google, or a code by email. `next` is where web returns after Google's page (phones just close
 * this screen); Google only shows when it's switched on in the Supabase project.
 */
export function SignInScreen() {
  const styles = useStyles();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const navigation = useNavigation();
  const [google, setGoogle] = useState(false);
  const signedIn = useRef(false);

  useEffect(() => {
    let live = true;
    void enabledProviders().then((p) => live && setGoogle(p.has('google')));
    return () => {
      live = false;
    };
  }, []);

  // On Android the callback route can open over this screen; once it closes, so does this one.
  useFocusEffect(
    useCallback(() => {
      if (signedIn.current) router.back();
    }, []),
  );
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (step: 'send' | 'verify' | 'google', action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(message(e, step));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run('send', async () => {
      const address = email.trim().toLowerCase();
      await sendEmailCode(address);
      setSentTo(address);
      setCode('');
    });

  const verify = () =>
    run('verify', async () => {
      await verifyEmailCode(sentTo!, code.trim());
      track('signed_in', { method: 'email' });
      haptics.success();
      router.back();
    });

  const withGoogle = () =>
    run('google', async () => {
      const done = await signInWithProvider('google', Platform.OS === 'web' ? next : undefined);
      if (!done) return;
      signedIn.current = true;
      track('signed_in', { method: 'google' });
      haptics.success();
      if (navigation.isFocused()) router.back();
    });

  return (
    <ScreenScroll>
      <View style={styles.intro}>
        <View style={styles.badge}>
          <Icon name={sentTo ? 'mail-open' : 'mail'} size={28} color="onPrimary" />
        </View>
        <Text variant="title">{sentTo ? 'Check your email' : 'Sign in to Travyy'}</Text>
        <Text variant="callout" color="textMuted">
          {sentTo
            ? `We sent a code to ${sentTo}. It can take a minute to arrive.`
            : google
              ? 'No password: continue with Google, or we email you a code. Travyy keeps working without an account.'
              : 'No password: we email you a code. Travyy keeps working without an account.'}
        </Text>
      </View>

      {sentTo ? (
        <>
          <TextField
            label="Code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
            style={styles.code}
            autoFocus
            onSubmitEditing={() => CODE.test(code) && verify()}
          />
          {error ? (
            <Text variant="callout" color="danger">
              {error}
            </Text>
          ) : null}
          <Button
            title="Sign in"
            iconName="log-in-outline"
            onPress={verify}
            loading={busy}
            disabled={!CODE.test(code)}
          />
          <Button
            title="Use a different email"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setSentTo(undefined);
              setError(undefined);
            }}
          />
        </>
      ) : (
        <>
          {google ? (
            <>
              <Button
                title="Continue with Google"
                iconName="logo-google"
                variant="secondary"
                onPress={withGoogle}
                disabled={busy}
              />
              <View style={styles.or}>
                <View style={styles.rule} />
                <Text variant="caption" color="textMuted">
                  or with email
                </Text>
                <View style={styles.rule} />
              </View>
            </>
          ) : null}
          <TextField
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!google}
            onSubmitEditing={() => EMAIL.test(email.trim()) && send()}
          />
          {error ? (
            <Text variant="callout" color="danger">
              {error}
            </Text>
          ) : null}
          <Button
            title="Email me a code"
            iconName="paper-plane"
            onPress={send}
            loading={busy}
            disabled={!EMAIL.test(email.trim())}
          />
        </>
      )}
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  intro: { gap: 8 },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: t.colors.border },
  code: {
    fontSize: 26,
    letterSpacing: 8,
    fontFamily: fontFor('700'),
    minHeight: 60,
    fontVariant: ['tabular-nums'],
  },
}));
