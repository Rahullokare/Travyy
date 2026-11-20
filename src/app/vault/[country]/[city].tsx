import { useLocalSearchParams } from 'expo-router';
import { CityScreen } from '@/features/places/screens/CityScreen';

export default function VaultCityRoute() {
  const { country, city } = useLocalSearchParams<{ country: string; city: string }>();
  return <CityScreen country={country} city={city} />;
}
