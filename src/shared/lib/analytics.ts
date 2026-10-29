import type { SourcePlatform } from '@/domain/models';

/**
 * Typed product-analytics events — the activation/retention funnel from docs/RESEARCH.md.
 * Adding an event here forces every call site to send the right properties.
 * Plug a provider (PostHog, Amplitude…) into `send` when one is chosen.
 */
export type AnalyticsEvent =
  | { name: 'onboarding_completed'; props: { withSamples: boolean } }
  | { name: 'share_received'; props: { platform: SourcePlatform } }
  | { name: 'extraction_completed'; props: { platform: SourcePlatform; engine: string; found: number } }
  | { name: 'places_saved'; props: { count: number; platform: SourcePlatform } }
  | { name: 'trip_created'; props: { days: number; stops: number } }
  | { name: 'place_visited'; props: { category: string } }
  | { name: 'paywall_viewed'; props: { trigger: string } };

function send(event: AnalyticsEvent) {
  if (__DEV__) console.log('[analytics]', event.name, event.props);
}

export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']) {
  send({ name, props } as AnalyticsEvent);
}
