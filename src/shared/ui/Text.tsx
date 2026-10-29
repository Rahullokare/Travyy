import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { typography, useTheme, type ThemeColors } from '@/shared/theme';

export type TextVariant = keyof typeof typography;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: keyof ThemeColors;
  align?: 'left' | 'center' | 'right';
}

/** Themed text. Every string in the app renders through this, so type and colour stay consistent. */
export function Text({ variant = 'body', color, align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const fallback: keyof ThemeColors = variant === 'caption' || variant === 'label' ? 'textMuted' : 'text';
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: colors[color ?? fallback] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
