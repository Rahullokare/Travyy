import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { TripLedger } from '@/domain/models';
import { useLedgerStore } from '@/store';
import { hasProvisionalRate } from '../ledger';
import { lookUpRates, rateIn } from './rates';

async function refresh(tripId: string) {
  const ledger = useLedgerStore.getState().ledgers[tripId];
  if (!ledger) return;
  const provisional = ledger.expenses.filter(hasProvisionalRate);
  for (const day of new Set(provisional.map((e) => e.spentOn))) {
    const rates = await lookUpRates(ledger.currency, day);
    if (!rates) return; // Still offline: the rest would fail too.
    for (const expense of provisional.filter((e) => e.spentOn === day)) {
      const entry = rateIn(rates, expense.original?.currency ?? '');
      if (entry) useLedgerStore.getState().applyLookedUpRate(tripId, expense.id, entry.rate, entry.rateDate);
    }
  }
}

/** Replace rates saved while offline with the real ones, on opening the trip and on returning to the app. */
export function useRefreshProvisionalRates(ledger: TripLedger | undefined) {
  const tripId = ledger?.tripId;
  const pending = ledger?.expenses.filter(hasProvisionalRate).length ?? 0;

  useEffect(() => {
    if (!tripId || pending === 0) return;
    void refresh(tripId);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(tripId);
    });
    return () => sub.remove();
  }, [tripId, pending]);
}
