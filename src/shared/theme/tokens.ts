import { Platform } from 'react-native';

/**
 * Travyy's design tokens. One warm-neutral family (paper by day, charcoal by night) with a single
 * terracotta brand colour used sparingly: primary actions, the active tab, the one thing that
 * matters on a screen. Everything else is carried by type weight, space and soft depth.
 */
const palette = {
  // Brand: terracotta. 700 is the light-mode button (4.6:1 with white), 400 the dark-mode one.
  ember50: '#FFF3EE',
  ember100: '#FFE4D9',
  ember400: '#FF7246',
  ember500: '#F0592A',
  ember600: '#D14318',
  ember700: '#B53812',
  ember900: '#3A1A0F',
  ember950: '#26120A',
  teal600: '#0F766E',
  teal400: '#2DD4BF',
  teal100: '#DDF3EF',
  teal900: '#0E2B28',
  green600: '#15803D',
  green400: '#4ADE80',
  amber600: '#B45309',
  amber400: '#FBBF24',
  red600: '#C2361B',
  red400: '#FF7A5C',
  // Warm neutrals.
  paper: '#F6F5F2',
  paper200: '#EEECE7',
  paper300: '#E6E3DC',
  stone500: '#6E6A63',
  stone400: '#9C978E',
  stone600: '#57534C',
  ink950: '#0F0E0D',
  ink900: '#1A1917',
  ink850: '#211F1D',
  ink800: '#282624',
  ink700: '#33302D',
  ink50: '#F3F1ED',
  white: '#FFFFFF',
};

export interface ThemeColors {
  /** The page. */
  background: string;
  /** Cards, rows, sheets: one step above the page. */
  surface: string;
  /** Floating layers above surfaces (map cards, menus, the selected segment). */
  surfaceRaised: string;
  /** Recessed wells: text fields, segmented tracks, unselected chips. */
  surfaceSunken: string;
  surfacePressed: string;
  /** Inverted, high-emphasis surface (ink by day, paper by night). */
  surfaceInverse: string;
  text: string;
  textMuted: string;
  /** Hints and placeholders only: below body contrast on purpose. */
  textSubtle: string;
  textInverse: string;
  textInverseMuted: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  /** Brand-coloured text and icons on the page or on primarySoft (meets 4.5:1). */
  primaryText: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  /** Behind modals and sheets. */
  scrim: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: palette.paper,
    surface: palette.white,
    surfaceRaised: palette.white,
    surfaceSunken: palette.paper200,
    surfacePressed: palette.paper300,
    surfaceInverse: palette.ink900,
    text: palette.ink900,
    textMuted: palette.stone500,
    textSubtle: palette.stone400,
    textInverse: palette.ink50,
    textInverseMuted: '#B9B4AB',
    border: 'rgba(26,25,23,0.08)',
    borderStrong: 'rgba(26,25,23,0.16)',
    primary: palette.ember600,
    primaryPressed: palette.ember700,
    primarySoft: palette.ember50,
    primaryText: palette.ember700,
    onPrimary: palette.white,
    accent: palette.teal600,
    accentSoft: palette.teal100,
    success: palette.green600,
    successSoft: '#E3F4E8',
    warning: palette.amber600,
    warningSoft: '#FDF1DC',
    danger: palette.red600,
    dangerSoft: '#FCE8E3',
    overlay: 'rgba(246,245,242,0.94)',
    scrim: 'rgba(15,14,13,0.4)',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: palette.ink950,
    surface: palette.ink900,
    surfaceRaised: palette.ink800,
    surfaceSunken: palette.ink850,
    surfacePressed: palette.ink700,
    surfaceInverse: palette.ink50,
    text: palette.ink50,
    textMuted: '#A39E96',
    textSubtle: '#7A756D',
    textInverse: palette.ink900,
    textInverseMuted: palette.stone600,
    border: 'rgba(255,250,240,0.08)',
    borderStrong: 'rgba(255,250,240,0.16)',
    primary: palette.ember400,
    primaryPressed: palette.ember500,
    primarySoft: palette.ember950,
    primaryText: '#FF8A63',
    onPrimary: palette.ink950,
    accent: palette.teal400,
    accentSoft: palette.teal900,
    success: palette.green400,
    successSoft: '#11291A',
    warning: palette.amber400,
    warningSoft: '#2D2108',
    danger: palette.red400,
    dangerSoft: '#2E1611',
    overlay: 'rgba(15,14,13,0.92)',
    scrim: 'rgba(0,0,0,0.6)',
  },
};

/** 4-point scale. `gutter` is the screen's side margin. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;
export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 } as const;

/** Content never stretches wider than this on tablets and desktop web. */
export const CONTENT_MAX_WIDTH = 720;

/**
 * Plus Jakarta Sans, one file per weight. `Text` picks the file from `fontWeight`, so styles keep
 * using plain weights and Android never fakes a bold.
 */
export const FONT_FAMILY = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;

export const typography = {
  /** Paywall, onboarding, big moments. */
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.1 },
  /** Screen titles. */
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  /** Card and sheet titles. */
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1 },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: -0.05 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Field and group labels: sentence case, calm. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  /** Tiny uppercase eyebrow over a hero number. Use sparingly. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  /** Big numbers. Tabular figures so counts don't jitter as they change. */
  stat: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
} as const;

type ShadowLevel = 'sm' | 'md' | 'lg';

/**
 * Layered shadows: a tight contact shadow plus a soft ambient one, like real light. `boxShadow`
 * renders the same soft shadow on iOS, Android (9+) and web, unlike Android's `elevation`.
 * Dark mode leans on lighter surfaces and hairlines for depth, so its shadows are only there to
 * separate floating layers from busy content such as the map.
 */
const SHADOWS: Record<ShadowLevel, { light: string; dark: string }> = {
  sm: {
    light: '0px 1px 2px rgba(26,25,23,0.05), 0px 2px 6px rgba(26,25,23,0.04)',
    dark: '0px 1px 2px rgba(0,0,0,0.4)',
  },
  md: {
    light: '0px 1px 3px rgba(26,25,23,0.06), 0px 8px 20px rgba(26,25,23,0.08)',
    dark: '0px 2px 4px rgba(0,0,0,0.45), 0px 8px 24px rgba(0,0,0,0.35)',
  },
  lg: {
    light: '0px 2px 6px rgba(26,25,23,0.08), 0px 18px 40px rgba(26,25,23,0.14)',
    dark: '0px 4px 10px rgba(0,0,0,0.5), 0px 18px 44px rgba(0,0,0,0.5)',
  },
};

export function shadow(level: ShadowLevel, dark: boolean) {
  return { boxShadow: SHADOWS[level][dark ? 'dark' : 'light'] } as const;
}

/** Floating layers (map overlays, FABs, map cards). */
export function elevation(dark: boolean) {
  return shadow('md', dark);
}

/** Resting cards: barely lifted in light mode; in dark mode the lighter surface does the work. */
export function lift(dark: boolean) {
  return dark ? undefined : shadow('sm', false);
}

/** Native-stack header font, which bypasses our Text component. */
export const headerTitleFont = Platform.select({
  web: { fontFamily: FONT_FAMILY[700], fontWeight: '700' as const },
  default: { fontFamily: FONT_FAMILY[700] },
});
