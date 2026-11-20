import { useLocalSearchParams } from 'expo-router';
import { ExpenseFormScreen } from '@/features/expenses/screens/ExpenseFormScreen';

export default function ExpenseRoute() {
  const { id, expenseId, placeId } = useLocalSearchParams<{
    id: string;
    expenseId?: string;
    placeId?: string;
  }>();
  return <ExpenseFormScreen tripId={id} expenseId={expenseId} placeId={placeId} />;
}
