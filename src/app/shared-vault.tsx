import { Redirect, useLocalSearchParams } from 'expo-router';
import { SharedVaultScreen } from '@/features/places/screens/SharedVaultScreen';
import { useAppStore } from '@/store';

/** A vault someone shared as a link: /shared-vault?d=<encoded vault>. Open to everyone, before onboarding too. */
export default function SharedVaultRoute() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const onboarded = useAppStore((s) => s.onboarded);
  if (!d) return <Redirect href={onboarded ? '/' : '/onboarding'} />;
  return <SharedVaultScreen data={d} />;
}
