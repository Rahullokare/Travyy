import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { makeStyles } from '@/shared/theme';
import { Button, ScreenScroll, Text, TextField } from '@/shared/ui';
import { sendEmailCode, verifyEmailCode } from '../session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase sends 6 digits by default; the length is configurable up to 10. */
const CODE = /^\d{6,10}$/;

/** Supabase errors are English sentences already; rate limits get a friendlier one. */
function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/rate limit|only request this after/i.test(text))
    return 'Too many codes sent. Wait a minute and try again.';
  if (/expired|invalid/i.test(text)) return 'That code is wrong or has expired. Check it, or send a new one.';
  if (/network|fetch/i.test(text)) return 'No connection. Check your internet and try again.';
  return text;
}

export function SignInScreen() {
  const styles = useStyles();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      const address = email.trim().toLowerCase();
      await sendEmailCode(address);
      setSentTo(address);
      setCode('');
    });

  const verify = () =>
    run(async () => {
      await verifyEmailCode(sentTo!, code.trim());
      track('signed_in', { method: 'email' });
      haptics.success();
      router.back();
    });

  return (
    <ScreenScroll>
      <View style={styles.intro}>
        <Text variant="title">{sentTo ? 'Check your email' : 'Sign in to Travyy'}</Text>
        <Text color="textMuted">
          {sentTo
            ? `We sent a code to ${sentTo}. It can take a minute to arrive.`
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
            autoFocus
            onSubmitEditing={() => CODE.test(code) && verify()}
          />
          {error ? <Text color="danger">{error}</Text> : null}
          <Button title="Sign in" onPress={verify} loading={busy} disabled={!CODE.test(code)} />
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
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={() => EMAIL.test(email.trim()) && send()}
          />
          {error ? <Text color="danger">{error}</Text> : null}
          <Button
            title="Email me a code"
            onPress={send}
            loading={busy}
            disabled={!EMAIL.test(email.trim())}
          />
        </>
      )}
    </ScreenScroll>
  );
}

const useStyles = makeStyles(() => ({
  intro: { gap: 6 },
}));
