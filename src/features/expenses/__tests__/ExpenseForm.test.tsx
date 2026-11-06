import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Member } from '@/domain/models';
import { TripMoney } from '@/features/expenses/components/TripMoney';
import { ExpenseFormScreen } from '@/features/expenses/screens/ExpenseFormScreen';
import { useAppStore, useLedgerStore } from '@/store';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

const members: Member[] = [
  { id: 'a', name: 'Asha', isSelf: true },
  { id: 'b', name: 'Bilal' },
  { id: 'c', name: 'Chen' },
];

let tripId: string;
let placeId: string;
const expenses = () => useLedgerStore.getState().ledgers[tripId].expenses;

beforeEach(() => {
  useAppStore.getState().reset();
  [placeId] = useAppStore
    .getState()
    .addPlaces([
      { name: 'Scuba Centre', lat: 1, lng: 1, city: 'Goa', category: 'activity', sourcePlatform: 'manual' },
    ]);
  tripId = useAppStore.getState().createTrip({ name: 'Goa', city: 'Goa', placeIds: [placeId], days: 1 });
  useLedgerStore.getState().saveSetup(tripId, { currency: 'INR', members });
});

describe('ExpenseFormScreen', () => {
  it('can’t be saved until there is an amount', async () => {
    await render(<ExpenseFormScreen tripId={tripId} />);
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    expect(screen.getByText('Enter the amount to see each person’s share.')).toBeOnTheScreen();
  });

  it('logs a cost against a stop, only for the people who went', async () => {
    await render(<ExpenseFormScreen tripId={tripId} placeId={placeId} />);
    expect(screen.getByDisplayValue('Scuba Centre')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '900');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Chen' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));

    expect(expenses()).toHaveLength(1);
    expect(expenses()[0]).toMatchObject({
      title: 'Scuba Centre',
      category: 'activity',
      amountMinor: 90000,
      payers: [{ memberId: 'a', amountMinor: 90000 }],
      stop: { placeId, name: 'Scuba Centre' },
      shares: [
        { memberId: 'a', amountMinor: 45000 },
        { memberId: 'b', amountMinor: 45000 },
      ],
    });
  });

  it('starts from whoever went last time at that stop', async () => {
    useLedgerStore.getState().saveExpense(tripId, {
      id: 'first',
      title: 'Dive',
      category: 'activity',
      spentOn: '2026-11-06',
      amountMinor: 200,
      payers: [{ memberId: 'a', amountMinor: 200 }],
      splitMode: 'equal',
      shares: [
        { memberId: 'b', amountMinor: 100 },
        { memberId: 'c', amountMinor: 100 },
      ],
      stop: { placeId, name: 'Scuba Centre' },
    });
    await render(<ExpenseFormScreen tripId={tripId} placeId={placeId} />);
    expect(screen.getByRole('checkbox', { name: 'You' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bilal' })).toBeChecked();
  });

  it('holds back an exact split until it adds up', async () => {
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '100');
    await fireEvent.press(screen.getByRole('tab', { name: 'Exact' }));
    await fireEvent.changeText(screen.getByLabelText('Exact for You'), '60');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    expect(screen.getByText(/40 left to assign/)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Exact for Bilal'), '40');
    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0]).toMatchObject({ splitMode: 'exact', amountMinor: 10000 });
  });

  it('reopens an expense with what was entered, and saves over it', async () => {
    useLedgerStore.getState().saveExpense(tripId, {
      id: 'e1',
      title: 'Dinner',
      category: 'food',
      spentOn: '2026-11-06',
      amountMinor: 10000,
      payers: [{ memberId: 'b', amountMinor: 10000 }],
      splitMode: 'percent',
      shares: [
        { memberId: 'a', amountMinor: 7000, input: 70 },
        { memberId: 'b', amountMinor: 3000, input: 30 },
      ],
    });
    await render(<ExpenseFormScreen tripId={tripId} expenseId="e1" />);
    expect(screen.getByDisplayValue('Dinner')).toBeOnTheScreen();
    expect(screen.getByLabelText('Percent for You').props.value).toBe('70');

    await fireEvent.changeText(screen.getByLabelText('What for'), 'Late dinner');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(expenses()).toHaveLength(1);
    expect(expenses()[0].title).toBe('Late dinner');
    expect(expenses()[0].payers[0].memberId).toBe('b');
  });

  it('says so when the expense is gone', async () => {
    await render(<ExpenseFormScreen tripId={tripId} expenseId="missing" />);
    expect(screen.getByText('Not found')).toBeOnTheScreen();
  });
});

describe('TripMoney', () => {
  const metrics = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  const trip = () => useAppStore.getState().trips[0];

  it('offers setup before there is a ledger', async () => {
    useLedgerStore.getState().removeLedger(tripId);
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TripMoney trip={trip()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('button', { name: 'Add people' })).toBeOnTheScreen();
  });

  it('shows who owes what', async () => {
    useLedgerStore.getState().saveExpense(tripId, {
      id: 'e1',
      title: 'Dinner',
      category: 'food',
      spentOn: '2026-11-06',
      amountMinor: 3000,
      payers: [{ memberId: 'a', amountMinor: 3000 }],
      splitMode: 'equal',
      shares: [
        { memberId: 'a', amountMinor: 1500 },
        { memberId: 'b', amountMinor: 1500 },
      ],
    });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TripMoney trip={trip()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText(/You get back/)).toBeOnTheScreen();
    expect(screen.getByText('Bilal pays you')).toBeOnTheScreen();
    expect(screen.getByText('Dinner')).toBeOnTheScreen();
  });
});
