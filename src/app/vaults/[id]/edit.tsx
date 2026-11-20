import { useLocalSearchParams } from 'expo-router';
import { VaultFormScreen } from '@/features/places/screens/VaultFormScreen';

export default function EditVaultRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VaultFormScreen id={id} />;
}
