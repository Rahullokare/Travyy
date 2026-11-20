import { useLocalSearchParams } from 'expo-router';
import { PaywallScreen } from '@/features/paywall/screens/PaywallScreen';

export default function PaywallRoute() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <PaywallScreen reason={reason} />;
}
