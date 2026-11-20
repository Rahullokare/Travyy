import { useLocalSearchParams } from 'expo-router';
import { CountryScreen } from '@/features/places/screens/CountryScreen';

export default function VaultCountryRoute() {
  const { country } = useLocalSearchParams<{ country: string }>();
  return <CountryScreen country={country} />;
}
