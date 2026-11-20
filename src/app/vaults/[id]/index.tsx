import { useLocalSearchParams } from 'expo-router';
import { VaultScreen } from '@/features/places/screens/VaultScreen';

export default function VaultRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VaultScreen id={id} />;
}
