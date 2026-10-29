import { useLocalSearchParams } from 'expo-router';
import { TripDetailScreen } from '@/features/trips/screens/TripDetailScreen';

export default function TripRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TripDetailScreen id={id} />;
}
