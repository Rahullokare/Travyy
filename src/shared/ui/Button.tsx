import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, useTheme, type ThemeColors } from '@/shared/theme';
import { PressableScale } from './PressableScale';
import { Icon, type IconName } from './primitives';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  /**
   * primary: the one main action on a screen. secondary: a quieter neighbour. tinted: brand-tinted,
   * for a positive action that isn't the main one. ghost: text-only. danger: destructive.
   */
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** An icon from the app's set, coloured to match the label. */
  iconName?: IconName;
  /** A custom leading element, when `iconName` isn't enough. */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const FOREGROUND: Record<Variant, keyof ThemeColors> = {
  primary: 'onPrimary',
  secondary: 'text',
  tinted: 'primaryText',
  ghost: 'primaryText',
  danger: 'danger',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading,
  disabled,
  iconName,
  icon,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const fg = FOREGROUND[variant];
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      scale={size === 'sm' ? 0.95 : 0.97}
      style={[styles.base, styles[size], styles[variant], isDisabled && styles.disabled, style]}
      pressedStyle={styles[`${variant}Pressed`]}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} />
      ) : (
        <View style={styles.row}>
          {iconName ? <Icon name={iconName} size={size === 'sm' ? 16 : 19} color={fg} /> : icon}
          <Text
            variant={size === 'sm' ? 'callout' : 'bodyStrong'}
            numberOfLines={1}
            color={fg}
            style={[styles.label, size === 'lg' && styles.labelLarge]}
          >
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  lg: { minHeight: 54, paddingHorizontal: 24 },
  md: { minHeight: 46, paddingHorizontal: 20 },
  sm: { minHeight: 36, paddingHorizontal: 14 },
  primary: { backgroundColor: t.colors.primary },
  primaryPressed: { backgroundColor: t.colors.primaryPressed },
  secondary: { backgroundColor: t.colors.surfaceSunken },
  secondaryPressed: { backgroundColor: t.colors.surfacePressed },
  tinted: { backgroundColor: t.colors.primarySoft },
  tintedPressed: { opacity: 0.8 },
  ghost: { backgroundColor: 'transparent' },
  ghostPressed: { backgroundColor: t.colors.surfaceSunken },
  danger: { backgroundColor: t.colors.dangerSoft },
  dangerPressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  label: { fontWeight: '700', flexShrink: 1 },
  labelLarge: { fontSize: 16, letterSpacing: -0.2 },
}));
