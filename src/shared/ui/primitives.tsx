import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import {
  CONTENT_MAX_WIDTH,
  elevation,
  makeStyles,
  spacing,
  useTheme,
  type ThemeColors,
} from '@/shared/theme';
import { Text } from './Text';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 22,
  color = 'text',
}: {
  name: IconName;
  size?: number;
  color?: keyof ThemeColors;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={colors[color]} />;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = 'text',
  variant = 'plain',
  size = 22,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: keyof ThemeColors;
  variant?: 'plain' | 'floating';
  size?: number;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'floating' && [styles.floating, elevation(dark)],
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Background when selected; defaults to the inverse surface. */
  color?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const activeBg = color ?? colors.surfaceInverse;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && { backgroundColor: activeBg, borderColor: activeBg }]}
    >
      <Text
        variant="caption"
        style={[styles.chipLabel, { color: selected ? (color ? '#fff' : colors.textInverse) : colors.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Horizontally scrolling row of chips. `flexGrow: 0` matters on web, where a horizontal
 * ScrollView otherwise stretches to fill its column parent.
 */
export function ChipRow({ children, inset = spacing.lg }: { children: ReactNode; inset?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: inset, gap: spacing.sm, alignItems: 'center' }}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text variant="caption" align="center" style={styles.emptyBody}>
        {body}
      </Text>
      {action}
    </View>
  );
}

export function TextField({ label, style, ...props }: TextInputProps & { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label ?? props.placeholder}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, style]}
      />
    </View>
  );
}

/**
 * Scrollable screen body. Centers content and caps its width on tablets/desktop web
 * so text lines never stretch across a 1440px window.
 */
export function ScreenScroll({
  children,
  contentStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" {...rest}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

/** Non-scrolling equivalent of ScreenScroll for screens that own their list. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label">{title}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  iconButton: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  floating: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surface,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  chipLabel: { fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    flexGrow: 1,
  },
  emptyEmoji: { fontSize: 48, lineHeight: 58 },
  emptyBody: { maxWidth: 300 },
  field: { gap: spacing.sm },
  input: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
    fontSize: 16,
    color: t.colors.text,
  },
  inputMultiline: { minHeight: 140, paddingTop: spacing.md, textAlignVertical: 'top' },
  screen: { flex: 1, backgroundColor: t.colors.background },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
}));
