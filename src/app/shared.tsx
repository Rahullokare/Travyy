import { Redirect, useLocalSearchParams } from 'expo-router';
import { SharedTripScreen } from '@/features/trips/screens/SharedTripScreen';
import { useAppStore } from '@/store';

/** A trip someone shared as a link: /shared?d=<encoded trip>. Open to everyone, before onboarding too. */
export default function SharedTripRoute() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const onboarded = useAppStore((s) => s.onboarded);
  // Being open to everyone makes this a route the router can fall back to when a new visitor
  // opens a screen they can't see yet. Without a trip there's nothing to show: send them on.
  if (!d) return <Redirect href={onboarded ? '/' : '/onboarding'} />;
  return <SharedTripScreen data={d} />;
}
