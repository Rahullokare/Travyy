import { useLocalSearchParams } from 'expo-router';
import { PlaceDetailScreen } from '@/features/places/screens/PlaceDetailScreen';

export default function PlaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceDetailScreen id={id} />;
}
