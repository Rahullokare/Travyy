import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '@/shared/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      pressedStyle={variant === 'primary' ? styles.primaryPressed : styles.pressed}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            style={[styles.label, variant === 'primary' && styles.labelPrimary]}
          >
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: 52,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: t.colors.primary },
  primaryPressed: { backgroundColor: t.colors.primaryPressed },
  secondary: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  ghost: { backgroundColor: 'transparent' },
  pressed: { backgroundColor: t.colors.surfacePressed },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  label: { fontSize: 16, color: t.colors.text, letterSpacing: -0.2, flexShrink: 1 },
  labelPrimary: { color: t.colors.onPrimary },
}));
