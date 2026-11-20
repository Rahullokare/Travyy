import { useLocalSearchParams } from 'expo-router';
import { PeopleScreen } from '@/features/expenses/screens/PeopleScreen';

export default function PeopleRoute() {
  const { id, placeId } = useLocalSearchParams<{ id: string; placeId?: string }>();
  return <PeopleScreen tripId={id} placeId={placeId} />;
}
