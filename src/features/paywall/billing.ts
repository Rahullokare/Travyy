import { env } from '@/shared/config/env';
import { useAppStore } from '@/store';

/**
 * The one place purchases happen. Screens call `billing`; nothing else writes entitlements.
 *
 * Today this is the preview provider: it grants the plan on this device without charging, so the
 * whole flow can be tested before the stores are set up. It refuses to run in production builds.
 * To charge for real, add a provider that implements `BillingProvider` with RevenueCat
 * (`react-native-purchases` on phones, `@revenuecat/purchases-js` on web), map its entitlements to
 * `setPro` / `addTripPass`, and return it from `pickProvider`. The product ids below are the ids
 * to create in Play Console and App Store Connect.
 */
export const PRODUCT_IDS = ['pro_yearly', 'pro_monthly', 'trip_pass'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const TRIP_PASS_DAYS = 30;

export interface Product {
  id: ProductId;
  title: string;
  /** Localised by the store in production, e.g. "₹999" or "$29.99". */
  price: string;
  /** "per year", "per month", "once". */
  period: string;
  detail: string;
  badge?: string;
  /** Button label when this product is selected. */
  cta: string;
}

export type PurchaseResult =
  | { status: 'purchased'; product: ProductId }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string };

export interface BillingProvider {
  /** True when no money changes hands. The paywall says so. */
  readonly preview: boolean;
  products(): Promise<Product[]>;
  purchase(id: ProductId): Promise<PurchaseResult>;
  /** Re-applies past purchases on a new phone. Resolves to whether anything was found. */
  restore(): Promise<boolean>;
}

type PriceBook = Record<ProductId, string> & { yearlyPerMonth: string };

/** Launch prices. India pays India prices; everyone else sees dollars until the stores localise. */
const PRICES: Record<'IN' | 'default', PriceBook> = {
  IN: { pro_yearly: '₹999', pro_monthly: '₹199', trip_pass: '₹249', yearlyPerMonth: '₹83' },
  default: { pro_yearly: '$29.99', pro_monthly: '$4.99', trip_pass: '$5.99', yearlyPerMonth: '$2.50' },
};

/** The device's region, from its locale ("en-IN" → "IN"). Timezone covers phones set to en-US in India. */
export function deviceRegion(): string | undefined {
  try {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    if (timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') return 'IN';
    return /[-_]([A-Z]{2})\b/.exec(locale)?.[1];
  } catch {
    return undefined;
  }
}

export function catalogue(region = deviceRegion()): Product[] {
  const p = region === 'IN' ? PRICES.IN : PRICES.default;
  return [
    {
      id: 'trip_pass',
      title: 'Trip Pass',
      price: p.trip_pass,
      period: 'once',
      detail: `One more trip, yours to keep, and unlimited AI imports for ${TRIP_PASS_DAYS} days. No subscription.`,
      cta: `Get a Trip Pass · ${p.trip_pass}`,
    },
    {
      id: 'pro_yearly',
      title: 'Pro yearly',
      price: p.pro_yearly,
      period: 'per year',
      detail: `${p.yearlyPerMonth} a month. 7 days free, cancel anytime.`,
      badge: 'Best value',
      cta: 'Try 7 days free',
    },
    {
      id: 'pro_monthly',
      title: 'Pro monthly',
      price: p.pro_monthly,
      period: 'per month',
      detail: 'Unlimited everything. Cancel anytime.',
      cta: `Subscribe · ${p.pro_monthly} a month`,
    },
  ];
}

/** Applies a purchase to this device. Exported for tests and for a real provider to reuse. */
export function grant(id: ProductId) {
  const store = useAppStore.getState();
  if (id === 'trip_pass') store.addTripPass(TRIP_PASS_DAYS);
  else store.setPro(true);
}

const previewBilling: BillingProvider = {
  preview: true,
  products: async () => catalogue(),
  purchase: async (id) => {
    if (env.appVariant === 'production') {
      return {
        status: 'unavailable',
        message: 'Purchases open soon. Everything on the free plan keeps working.',
      };
    }
    grant(id);
    return { status: 'purchased', product: id };
  },
  restore: async () => false,
};

function pickProvider(): BillingProvider {
  return previewBilling;
}

export const billing: BillingProvider = pickProvider();
