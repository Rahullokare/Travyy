import { Redirect, useLocalSearchParams } from 'expo-router';
import { JoinVaultScreen } from '@/features/places/screens/JoinVaultScreen';
import { useAppStore } from '@/store';

/** An invite to a shared vault: /join-vault?t=<invite token>. Open before onboarding too. */
export default function JoinVaultRoute() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const onboarded = useAppStore((s) => s.onboarded);
  if (!t) return <Redirect href={onboarded ? '/' : '/onboarding'} />;
  return <JoinVaultScreen token={t} />;
}
