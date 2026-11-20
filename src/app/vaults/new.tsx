import { useLocalSearchParams } from 'expo-router';
import { VaultFormScreen } from '@/features/places/screens/VaultFormScreen';

export default function NewVaultRoute() {
  const { place } = useLocalSearchParams<{ place?: string }>();
  return <VaultFormScreen placeId={place} />;
}
