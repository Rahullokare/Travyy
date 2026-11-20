import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { FONT_FAMILY } from './tokens';

type Weight = keyof typeof FONT_FAMILY;

function weightOf(value: TextStyle['fontWeight']): Weight {
  if (value === 'bold') return 700;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 400) return 400;
  if (n >= 800) return 800;
  return (Math.round(n / 100) * 100) as Weight;
}

/** The font file for a weight, e.g. 600 → PlusJakartaSans_600SemiBold. */
export function fontFor(weight: TextStyle['fontWeight']): string {
  return FONT_FAMILY[weightOf(weight)];
}

/**
 * Resolves a text style's `fontWeight` to the matching font file and drops the weight, so native
 * platforms don't synthesise a bold on top of an already-bold file. A style that names its own
 * `fontFamily` is left alone.
 */
export function fontStyle(style: StyleProp<TextStyle>): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const { fontWeight, ...rest } = flat;
  return { ...rest, fontFamily: fontFor(fontWeight) };
}
