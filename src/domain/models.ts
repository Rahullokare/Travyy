import { z } from 'zod';
import { MAX_AMOUNT_MINOR } from './money';

/**
 * Domain models. Schemas double as runtime validators for anything that crosses a
 * trust boundary: persisted storage (which can be stale or corrupted) and API responses.
 */

export const CATEGORIES = [
  'food',
  'cafe',
  'nightlife',
  'sight',
  'nature',
  'stay',
  'shopping',
  'activity',
  'other',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const SOURCE_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'google_maps', 'web', 'manual'] as const;
export const SourcePlatformSchema = z.enum(SOURCE_PLATFORMS);
export type SourcePlatform = z.infer<typeof SourcePlatformSchema>;

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);

// `.catch` rather than failing: a bad code must never cost someone the saved place it came with.
const CountryCode = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .optional()
  .catch(undefined);

export const PlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().optional(),
  country: z.string().optional(),
  /** ISO 3166-1 alpha-2. What the vault groups by, so one country is one folder whatever it was called. */
  countryCode: CountryCode,
  category: CategorySchema,
  lat: Latitude,
  lng: Longitude,
  address: z.string().optional(),
  note: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourcePlatform: SourcePlatformSchema,
  savedAt: z.number(),
  visitedAt: z.number().optional(),
  /** Marked ❤. Separate from visited: you can love a place you haven't been to yet. */
  likedAt: z.number().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

/** What callers provide when saving; the store assigns identity and timestamps. */
export type NewPlace = Omit<Place, 'id' | 'savedAt' | 'visitedAt' | 'likedAt'>;

/**
 * A vault the person made: "Cafés to try", "Goa weekend". It holds references, not copies, so a
 * place can sit in several vaults and deleting a vault never deletes a place.
 */
export const VaultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  /** One emoji shown on the vault's tile. */
  emoji: z.string().max(16).optional(),
  /** Newest first. May name places since deleted on another phone: readers skip those. */
  placeIds: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Vault = z.infer<typeof VaultSchema>;

export const TripDaySchema = z.object({
  day: z.number().int().positive(),
  placeIds: z.array(z.string()),
});
export type TripDay = z.infer<typeof TripDaySchema>;

export const TripSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string(),
  days: z.array(TripDaySchema).min(1),
  createdAt: z.number(),
  /** Added from a link someone shared. Doesn't count against the free plan's trips. */
  shared: z.boolean().optional(),
});
export type Trip = z.infer<typeof TripSchema>;

/** A place the extractor found but the user hasn't confirmed yet. */
export const CandidateSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  country: z.string().optional(),
  countryCode: CountryCode,
  category: CategorySchema,
  lat: Latitude.optional(),
  lng: Longitude.optional(),
  address: z.string().optional(),
  /** 0..1 — how sure the extractor is that this is a real, visitable place. */
  confidence: z.number().min(0).max(1),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const EXPENSE_CATEGORIES = ['food', 'transport', 'stay', 'activity', 'shopping', 'other'] as const;
export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const SPLIT_MODES = ['equal', 'exact', 'percent', 'shares'] as const;
export const SplitModeSchema = z.enum(SPLIT_MODES);
export type SplitMode = z.infer<typeof SplitModeSchema>;

/** Integer count of the currency's smallest unit. See `domain/money.ts`. */
const MinorUnits = z.number().int().nonnegative().max(MAX_AMOUNT_MINOR);
const CalendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const RATE_SOURCES = ['auto', 'cached', 'manual'] as const;
export const RateSourceSchema = z.enum(RATE_SOURCES);
/** auto: looked up for this date. cached: the last known rate, replaced once online. manual: what the bank charged. */
export type RateSource = z.infer<typeof RateSourceSchema>;

/** What was actually paid, when that wasn't the trip's currency. The rate stays with the expense for good. */
export const OriginalAmountSchema = z.object({
  amountMinor: MinorUnits.positive(),
  currency: CurrencyCode,
  /** How many whole trip-currency units one whole unit of `currency` buys. */
  rate: z.number().positive(),
  rateDate: CalendarDay,
  rateSource: RateSourceSchema,
});
export type OriginalAmount = z.infer<typeof OriginalAmountSchema>;

/** Someone on a trip. A name, not an account, so friends count without installing the app. */
export const MemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The person holding this phone. */
  isSelf: z.boolean().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

const MemberAmountSchema = z.object({ memberId: z.string().min(1), amountMinor: MinorUnits });
export const ExpenseShareSchema = MemberAmountSchema.extend({
  /** What was entered for this person, kept for editing: exact amounts are in the currency paid. Unused by equal splits. */
  input: z.number().nonnegative().optional(),
});
export type ExpenseShare = z.infer<typeof ExpenseShareSchema>;

/** Sums must match exactly: a record that doesn't balance would corrupt everyone's totals. */
const sumMatches = (rows: { amountMinor: number }[], total: number) =>
  rows.reduce((s, r) => s + r.amountMinor, 0) === total;

export const ExpenseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: ExpenseCategorySchema,
    spentOn: CalendarDay,
    /** In the trip's currency, as are payers and shares. */
    amountMinor: MinorUnits.positive(),
    original: OriginalAmountSchema.optional(),
    payers: z.array(MemberAmountSchema).min(1),
    splitMode: SplitModeSchema,
    shares: z.array(ExpenseShareSchema).min(1),
    /**
     * The itinerary stop this paid for. The name is a copy so the record still reads right after
     * the place is deleted, and there's no day number because re-shuffling a trip changes those.
     */
    stop: z.object({ placeId: z.string().min(1), name: z.string().min(1) }).optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .refine((e) => sumMatches(e.payers, e.amountMinor) && sumMatches(e.shares, e.amountMinor), {
    message: 'Payers and shares must add up to the amount',
  });
export type Expense = z.infer<typeof ExpenseSchema>;

/** Money that changed hands between two people to pay back what's owed. */
export const SettlementSchema = z.object({
  id: z.string().min(1),
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amountMinor: MinorUnits.positive(),
  paidOn: CalendarDay,
  createdAt: z.number(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const TripLedgerHeaderSchema = z.object({
  tripId: z.string().min(1),
  /** ISO 4217. Balances, shares and payments are all in this currency. */
  currency: CurrencyCode,
  createdAt: z.number(),
});

type TripLedgerHeader = z.infer<typeof TripLedgerHeaderSchema>;

export interface TripLedger extends TripLedgerHeader {
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
}

export interface LatLng {
  lat: number;
  lng: number;
}
