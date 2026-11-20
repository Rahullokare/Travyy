import { useLocalSearchParams } from 'expo-router';
import { VaultShareScreen } from '@/features/places/screens/VaultShareScreen';

export default function ShareVaultRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VaultShareScreen id={id} />;
}
