import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { RateSource, SourcePlatform, SplitMode } from '@/domain/models';
import { env } from '@/shared/config/env';
import { newId } from './id';

/**
 * Typed product-analytics events — the activation/retention funnel from docs/RESEARCH.md.
 * Adding an event here forces every call site to send the right properties.
 * Plug a different provider into `send` and no call site changes.
 */
export type AnalyticsEvent =
  | { name: 'onboarding_completed'; props: { withSamples: boolean } }
  | { name: 'share_received'; props: { platform: SourcePlatform } }
  | { name: 'extraction_completed'; props: { platform: SourcePlatform; engine: string; found: number } }
  | { name: 'places_saved'; props: { count: number; platform: SourcePlatform } }
  | { name: 'trip_created'; props: { days: number; stops: number } }
  | { name: 'place_visited'; props: { category: string } }
  | { name: 'place_liked'; props: { category: string } }
  | { name: 'vault_created'; props: { from: 'saves' | 'place' | 'capture' } }
  | { name: 'places_added_to_vault'; props: { count: number; from: 'capture' | 'vault' } }
  | { name: 'vault_shared'; props: { spots: number; link: boolean } }
  | { name: 'shared_vault_opened'; props: { spots: number; valid: boolean } }
  | { name: 'shared_vault_imported'; props: { spots: number; newUser: boolean } }
  | { name: 'vault_invite_sent'; props: { spots: number } }
  | { name: 'vault_joined'; props: { spots: number } }
  | { name: 'paywall_viewed'; props: { trigger: string } }
  | { name: 'purchase_completed'; props: { product: string; trigger: string; preview: boolean } }
  | { name: 'ai_quota_reached'; props: { used: number } }
  | { name: 'booking_opened'; props: { partner: string; kind: string; from: 'place' | 'trip' } }
  | { name: 'trip_shared'; props: { stops: number; link: boolean } }
  | { name: 'shared_trip_opened'; props: { stops: number; valid: boolean } }
  | { name: 'shared_trip_imported'; props: { stops: number; newUser: boolean } }
  | { name: 'signed_in'; props: { method: 'email' | 'google' | 'apple' } }
  | { name: 'ledger_created'; props: { people: number; currency: string } }
  | {
      name: 'expense_saved';
      props: { mode: SplitMode; people: number; onStop: boolean; edited: boolean; rate?: RateSource };
    }
  | { name: 'payment_recorded'; props: { suggested: boolean } }
  | { name: 'money_summary_shared'; props: { expenses: number } };

const ID_KEY = 'travyy-analytics-id';
let distinctId: Promise<string> | undefined;

/** A random id kept on the device. It isn't tied to an account, an email or an advertising id. */
function anonymousId(): Promise<string> {
  distinctId ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(ID_KEY);
      if (saved) return saved;
      const fresh = newId();
      await AsyncStorage.setItem(ID_KEY, fresh);
      return fresh;
    } catch {
      return newId();
    }
  })();
  return distinctId;
}

/**
 * Delivers to PostHog when a project key is configured, over its plain HTTP capture endpoint (no
 * SDK, nothing native). Only the event name and the typed props above are sent: never a place
 * name, a link, a caption or an amount. Failures are dropped; analytics must never break a screen.
 */
function send(event: AnalyticsEvent) {
  if (__DEV__) console.log('[analytics]', event.name, event.props);
  if (!env.posthogKey) return;
  void anonymousId()
    .then((id) =>
      fetch(`${env.posthogHost}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: env.posthogKey,
          event: event.name,
          distinct_id: id,
          timestamp: new Date().toISOString(),
          properties: {
            ...event.props,
            platform: Platform.OS,
            variant: env.appVariant,
            // Anonymous events: PostHog shouldn't build a person profile from them.
            $process_person_profile: false,
          },
        }),
      }),
    )
    .catch(() => {});
}

export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']) {
  send({ name, props } as AnalyticsEvent);
}
