import { Platform } from 'react-native';

const palette = {
  coral500: '#FF5A36',
  coral600: '#E2401D',
  coral100: '#FFE9E2',
  coral900: '#3D1A12',
  teal600: '#0F766E',
  teal400: '#2DD4BF',
  teal100: '#DDF3F0',
  teal900: '#0B2E2B',
  green500: '#1FA971',
  amber600: '#D97706',
  sand50: '#FAF7F2',
  sand100: '#F4EFE7',
  sand200: '#ECE6DC',
  stone500: '#6F675C',
  stone400: '#9C9488',
  ink900: '#16130F',
  ink800: '#1F1B16',
  ink700: '#2A251F',
  ink600: '#3A342C',
  white: '#FFFFFF',
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfacePressed: string;
  /** Inverted, high-emphasis surface (dark in light mode). */
  surfaceInverse: string;
  text: string;
  textMuted: string;
  textInverse: string;
  textInverseMuted: string;
  border: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

export const lightTheme: Theme = {
  dark: false,
  colors: {
    background: palette.sand50,
    surface: palette.white,
    surfacePressed: palette.sand100,
    surfaceInverse: palette.ink800,
    text: palette.ink900,
    textMuted: palette.stone500,
    textInverse: palette.white,
    textInverseMuted: '#D6D0C6',
    border: 'rgba(22,19,15,0.09)',
    primary: palette.coral500,
    primaryPressed: palette.coral600,
    primarySoft: palette.coral100,
    onPrimary: palette.white,
    accent: palette.teal600,
    accentSoft: palette.teal100,
    success: palette.green500,
    warning: palette.amber600,
    danger: palette.coral600,
    overlay: 'rgba(250,247,242,0.94)',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    background: palette.ink900,
    surface: palette.ink800,
    surfacePressed: palette.ink700,
    surfaceInverse: palette.sand100,
    text: '#F5F1EA',
    textMuted: palette.stone400,
    textInverse: palette.ink900,
    textInverseMuted: palette.stone500,
    border: 'rgba(255,248,238,0.10)',
    primary: palette.coral500,
    primaryPressed: palette.coral600,
    primarySoft: palette.coral900,
    onPrimary: palette.white,
    accent: palette.teal400,
    accentSoft: palette.teal900,
    success: palette.green500,
    warning: palette.amber600,
    danger: '#FF7A5C',
    overlay: 'rgba(22,19,15,0.92)',
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

/** Content never stretches wider than this on tablets and desktop web. */
export const CONTENT_MAX_WIDTH = 720;

export const typography = {
  hero: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.25 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  /** Big numbers. Tabular figures so counts don't jitter as they change. */
  stat: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
} as const;

/** Floating layers (map overlays, FABs): a tight contact shadow plus a soft ambient one. */
export function elevation(dark: boolean) {
  return Platform.select({
    web: {
      boxShadow: dark
        ? '0 1px 2px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.45)'
        : '0 1px 2px rgba(22,19,15,0.06), 0 8px 24px rgba(22,19,15,0.10)',
    },
    default: {
      shadowColor: '#16130F',
      shadowOpacity: dark ? 0.45 : 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
  });
}

/** Resting cards: barely lifted, so the hairline border does most of the work. */
export function lift(dark: boolean) {
  if (dark) return undefined;
  return Platform.select({
    web: { boxShadow: '0 1px 2px rgba(22,19,15,0.04), 0 2px 8px rgba(22,19,15,0.04)' },
    default: {
      shadowColor: '#16130F',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
  });
}
