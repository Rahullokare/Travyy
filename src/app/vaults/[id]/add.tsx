import { useLocalSearchParams } from 'expo-router';
import { AddSpotsScreen } from '@/features/places/screens/AddToVaultScreens';

export default function AddSpotsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AddSpotsScreen vaultId={id} />;
}
