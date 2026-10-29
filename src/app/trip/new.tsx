import { useLocalSearchParams } from 'expo-router';
import { NewTripScreen } from '@/features/trips/screens/NewTripScreen';

export default function NewTripRoute() {
  const { city } = useLocalSearchParams<{ city?: string }>();
  return <NewTripScreen initialCity={city} />;
}
