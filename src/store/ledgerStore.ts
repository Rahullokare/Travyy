import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  ExpenseSchema,
  MemberSchema,
  SettlementSchema,
  TripLedgerHeaderSchema,
  type Expense,
  type Member,
  type Settlement,
  type TripLedger,
} from '@/domain/models';
import { memberInUse } from '@/features/expenses/ledger';
import { newId } from '@/shared/lib/id';
import { keepValid } from './keepValid';

/**
 * Each trip's shared costs, keyed by trip id. Kept apart from the app store so a new expense
 * doesn't rewrite every saved place, and so `Trip` (which old installs have persisted) is untouched.
 */

export interface LedgerState {
  ledgers: Record<string, TripLedger>;
}

export interface LedgerActions {
  /** Create the trip's ledger, or update its people and currency. */
  saveSetup: (tripId: string, setup: { currency: string; members: Member[] }) => void;
  /** Add or replace by id, so a repeated save can't create a duplicate. */
  saveExpense: (tripId: string, expense: Omit<Expense, 'createdAt' | 'updatedAt'>) => void;
  removeExpense: (tripId: string, expenseId: string) => void;
  addSettlement: (tripId: string, payment: Omit<Settlement, 'id' | 'createdAt'>) => string;
  removeSettlement: (tripId: string, settlementId: string) => void;
  removeLedger: (tripId: string) => void;
  reset: () => void;
}

export type LedgerStore = LedgerState & LedgerActions;

const hasEntries = (l: TripLedger) => l.expenses.length > 0 || l.settlements.length > 0;

export const useLedgerStore = create<LedgerStore>()(
  persist(
    (set, get) => {
      const update = (tripId: string, change: (ledger: TripLedger) => TripLedger) => {
        const ledger = get().ledgers[tripId];
        if (ledger) set({ ledgers: { ...get().ledgers, [tripId]: change(ledger) } });
      };

      return {
        ledgers: {},

        saveSetup: (tripId, { currency, members }) => {
          const existing = get().ledgers[tripId];
          if (!existing) {
            const ledger: TripLedger = {
              tripId,
              currency,
              members,
              expenses: [],
              settlements: [],
              createdAt: Date.now(),
            };
            set({ ledgers: { ...get().ledgers, [tripId]: ledger } });
            return;
          }
          // Amounts have no rate to convert with, and anyone with entries has to stay on the trip.
          const kept = existing.members.filter(
            (m) => memberInUse(existing, m.id) && !members.some((next) => next.id === m.id),
          );
          update(tripId, (l) => ({
            ...l,
            currency: hasEntries(l) ? l.currency : currency,
            members: [...members, ...kept],
          }));
        },

        saveExpense: (tripId, expense) =>
          update(tripId, (l) => {
            const now = Date.now();
            const previous = l.expenses.find((e) => e.id === expense.id);
            const saved: Expense = { ...expense, createdAt: previous?.createdAt ?? now, updatedAt: now };
            return {
              ...l,
              expenses: previous
                ? l.expenses.map((e) => (e.id === expense.id ? saved : e))
                : [saved, ...l.expenses],
            };
          }),

        removeExpense: (tripId, expenseId) =>
          update(tripId, (l) => ({ ...l, expenses: l.expenses.filter((e) => e.id !== expenseId) })),

        addSettlement: (tripId, payment) => {
          const id = newId();
          update(tripId, (l) => ({
            ...l,
            settlements: [{ ...payment, id, createdAt: Date.now() }, ...l.settlements],
          }));
          return id;
        },

        removeSettlement: (tripId, settlementId) =>
          update(tripId, (l) => ({
            ...l,
            settlements: l.settlements.filter((s) => s.id !== settlementId),
          })),

        removeLedger: (tripId) => {
          const { [tripId]: _removed, ...rest } = get().ledgers;
          set({ ledgers: rest });
        },

        reset: () => set({ ledgers: {} }),
      };
    },
    {
      name: 'travyy-ledger-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ ledgers }) => ({ ledgers }),
      merge: (persisted, current) => ({ ...current, ...sanitizeLedgers(persisted) }),
    },
  ),
);

/** Validate persisted ledgers record by record, like the app store. Exported for tests. */
export function sanitizeLedgers(raw: unknown): Partial<LedgerState> {
  const ledgers = (raw as { ledgers?: unknown } | null | undefined)?.ledgers;
  if (!ledgers || typeof ledgers !== 'object') return {};
  const valid: Record<string, TripLedger> = {};
  for (const [tripId, value] of Object.entries(ledgers)) {
    const header = TripLedgerHeaderSchema.safeParse(value);
    if (!header.success || header.data.tripId !== tripId) continue;
    const record = value as Record<string, unknown>;
    const members = keepValid<Member>(record.members, MemberSchema);
    if (members.length === 0) continue;
    valid[tripId] = {
      ...header.data,
      members,
      expenses: keepValid<Expense>(record.expenses, ExpenseSchema),
      settlements: keepValid<Settlement>(record.settlements, SettlementSchema),
    };
  }
  return { ledgers: valid };
}
