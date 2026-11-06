import { useLocalSearchParams } from 'expo-router';
import { PaymentScreen } from '@/features/expenses/screens/PaymentScreen';

export default function PaymentRoute() {
  const { id, from, to, amount } = useLocalSearchParams<{
    id: string;
    from?: string;
    to?: string;
    amount?: string;
  }>();
  return <PaymentScreen tripId={id} from={from} to={to} amount={amount ? Number(amount) : undefined} />;
}
