import { cubicBezier, useReducedMotion, type CSSAnimationProperties } from 'react-native-reanimated';

/**
 * Motion tokens. One set of curves and durations for the whole app so everything moves alike.
 * UI motion stays under 300ms; navigation keeps the platform's own transitions.
 */

/** Strong ease-out: instant response, soft landing. The default for anything entering or reacting. */
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export const duration = {
  /** Press feedback. */
  press: 120,
  /** Chips, toggles, small state changes. */
  state: 180,
  enter: 240,
} as const;

const entrances = {
  /** Floating cards rising into place: a short lift, never from nothing. */
  rise: {
    from: { opacity: 0, transform: [{ translateY: 12 }, { scale: 0.97 }] },
    to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  },
  /** Content swapping in place (onboarding steps): a small nudge in the reading direction. */
  slide: {
    from: { opacity: 0, transform: [{ translateX: 16 }] },
    to: { opacity: 1, transform: [{ translateX: 0 }] },
  },
} as const;

const fade = { from: { opacity: 0 }, to: { opacity: 1 } };

/**
 * Mount animation as a style: spread it on an `Animated.View` and key the view to replay it.
 * A CSS animation rather than a layout `entering` animation, so the view stays in normal flow
 * on web too. Under Reduce Motion it degrades to a plain fade.
 */
export function useEntrance(kind: keyof typeof entrances): CSSAnimationProperties {
  const reduced = useReducedMotion();
  return {
    animationName: reduced ? fade : entrances[kind],
    animationDuration: duration.enter,
    animationTimingFunction: EASE_OUT,
    animationFillMode: 'backwards',
  };
}
