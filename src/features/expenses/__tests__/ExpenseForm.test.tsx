import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as baseRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
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

/** The real provider, with a fresh cache per test so one test's rates can't reach the next. */
const render = (ui: ReactElement) =>
  baseRender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

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

describe('costs paid in another currency', () => {
  const rates = (rows: Record<string, number>, date = '2026-11-06') =>
    new Response(
      JSON.stringify(Object.entries(rows).map(([quote, rate]) => ({ date, base: 'INR', quote, rate }))),
      { status: 200 },
    );
  const offline = () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network failed'))) as typeof fetch;
  };
  const online = (rows: Record<string, number>) => {
    globalThis.fetch = jest.fn(() => Promise.resolve(rates(rows))) as typeof fetch;
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('converts at the looked-up rate and keeps what was paid', async () => {
    online({ THB: 0.4 });
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.press(screen.getByText('THB'));
    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '900');
    expect(await screen.findByText(/1 THB = 2\.5 INR/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0]).toMatchObject({
      amountMinor: 225000,
      original: { amountMinor: 90000, currency: 'THB', rate: 2.5, rateSource: 'auto' },
    });
  });

  it('uses a saved rate offline, and marks it to be replaced', async () => {
    await AsyncStorage.setItem(
      'travyy-rates-v1-INR',
      JSON.stringify({ base: 'INR', rates: { THB: { rate: 0.4, date: '2026-11-01' } } }),
    );
    offline();
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.press(screen.getByText('THB'));
    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '100');
    expect(await screen.findByText(/It updates when you’re back online/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0]).toMatchObject({
      amountMinor: 25000,
      original: { rateSource: 'cached', rateDate: '2026-11-01' },
    });
  });

  it('asks what it came to when there is no rate at all', async () => {
    offline();
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.press(screen.getByText('THB'));
    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '100');
    const charged = await screen.findByLabelText('Total in INR');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();

    await fireEvent.changeText(charged, '260');
    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0]).toMatchObject({
      amountMinor: 26000,
      original: { amountMinor: 10000, rate: 2.6, rateSource: 'manual' },
    });
  });

  it('lets what the bank charged replace the rate', async () => {
    online({ THB: 0.4 });
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.press(screen.getByText('THB'));
    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '900');
    await fireEvent.press(await screen.findByRole('button', { name: 'Enter what you were charged' }));
    await fireEvent.changeText(screen.getByLabelText('Total in INR'), '2530');
    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0]).toMatchObject({ amountMinor: 253000, original: { rateSource: 'manual' } });
  });

  it('takes exact amounts in the currency paid', async () => {
    online({ THB: 0.4 });
    await render(<ExpenseFormScreen tripId={tripId} />);
    await fireEvent.press(screen.getByText('THB'));
    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '900');
    await screen.findByText(/1 THB = 2\.5 INR/);
    await fireEvent.press(screen.getByRole('tab', { name: 'Exact' }));
    await fireEvent.changeText(screen.getByLabelText('Exact for You'), '300');
    await fireEvent.changeText(screen.getByLabelText('Exact for Bilal'), '600');
    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(expenses()[0].shares).toEqual([
      { memberId: 'a', amountMinor: 75000, input: 30000 },
      { memberId: 'b', amountMinor: 150000, input: 60000 },
    ]);
  });

  it('keeps an expense’s rate when it is edited later, even if rates have moved', async () => {
    useLedgerStore.getState().saveExpense(tripId, {
      id: 'e1',
      title: 'Tour',
      category: 'activity',
      spentOn: '2026-11-01',
      amountMinor: 25000,
      original: {
        amountMinor: 10000,
        currency: 'THB',
        rate: 2.5,
        rateDate: '2026-11-01',
        rateSource: 'auto',
      },
      payers: [{ memberId: 'a', amountMinor: 25000 }],
      splitMode: 'equal',
      shares: [{ memberId: 'a', amountMinor: 25000 }],
    });
    online({ THB: 0.1 });
    await render(<ExpenseFormScreen tripId={tripId} expenseId="e1" />);
    expect(screen.getByDisplayValue('100')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Amount (THB)'), '200');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(expenses()[0]).toMatchObject({ amountMinor: 50000, original: { rate: 2.5 } });
  });

  it('starts a new cost in the currency used last', async () => {
    useLedgerStore.getState().saveExpense(tripId, {
      id: 'e1',
      title: 'Tour',
      category: 'activity',
      spentOn: '2026-11-01',
      amountMinor: 25000,
      original: {
        amountMinor: 10000,
        currency: 'THB',
        rate: 2.5,
        rateDate: '2026-11-01',
        rateSource: 'auto',
      },
      payers: [{ memberId: 'a', amountMinor: 25000 }],
      splitMode: 'equal',
      shares: [{ memberId: 'a', amountMinor: 25000 }],
    });
    online({ THB: 0.4 });
    await render(<ExpenseFormScreen tripId={tripId} />);
    expect(screen.getByLabelText('Amount (THB)')).toBeOnTheScreen();
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
