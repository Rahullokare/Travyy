import { useLocalSearchParams } from 'expo-router';
import { NewTripScreen } from '@/features/trips/screens/NewTripScreen';

export default function NewTripRoute() {
  const { city, vault } = useLocalSearchParams<{ city?: string; vault?: string }>();
  return <NewTripScreen initialCity={city} vaultId={vault} />;
}
