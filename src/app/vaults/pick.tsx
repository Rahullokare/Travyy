import { useLocalSearchParams } from 'expo-router';
import { VaultPickerScreen } from '@/features/places/screens/AddToVaultScreens';

export default function PickVaultRoute() {
  const { place } = useLocalSearchParams<{ place: string }>();
  return <VaultPickerScreen placeId={place} />;
}
