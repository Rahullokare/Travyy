import { Ionicons } from '@expo/vector-icons';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useState, type ComponentProps, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptics } from '@/shared/lib/platform';
import {
  CONTENT_MAX_WIDTH,
  elevation,
  fontFor,
  lift,
  makeStyles,
  radius,
  shadow,
  spacing,
  useTheme,
  type ThemeColors,
} from '@/shared/theme';
import { duration, EASE_OUT } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 22,
  color = 'text',
}: {
  name: IconName;
  size?: number;
  /** A theme colour name, or any colour string (category colours). */
  color?: keyof ThemeColors | (string & {});
}) {
  const { colors } = useTheme();
  const resolved = color in colors ? colors[color as keyof ThemeColors] : color;
  return <Ionicons name={name} size={size} color={resolved} />;
}

/**
 * A coloured icon on a soft tile of the same hue: the app's stand-in for category emoji, so every
 * list, chip and card speaks one visual language in light and dark.
 */
export function IconBadge({
  icon,
  color,
  size = 40,
  shape = 'rounded',
}: {
  icon: IconName;
  /** A hex colour; the tile is the same hue at low opacity. */
  color: string;
  size?: number;
  shape?: 'rounded' | 'circle';
}) {
  const { dark } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? size / 2 : Math.round(size * 0.32),
        backgroundColor: `${color}${dark ? '2E' : '1C'}`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

const AVATAR_COLORS = ['#E0532A', '#2F6FE0', '#22945F', '#7B5BE0', '#C98A0C', '#D2457E', '#11948A'];

/** A person's initial on a colour picked from their id, so each person keeps one colour everywhere. */
export function Avatar({ name, seed, size = 36 }: { name: string; seed: string; size?: number }) {
  const { dark } = useTheme();
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}${dark ? '33' : '22'}`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color,
          fontSize: Math.round(size * 0.42),
          fontWeight: '700',
          lineHeight: Math.round(size * 0.55),
        }}
      >
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = 'text',
  variant = 'plain',
  size = 22,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: keyof ThemeColors;
  /** plain: bare icon. tinted: icon on a soft circle (headers). floating: raised circle over maps. */
  variant?: 'plain' | 'tinted' | 'floating';
  size?: number;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={variant === 'floating' ? 4 : 8}
      scale={variant === 'plain' ? 0.9 : 0.94}
      style={[
        styles.iconButton,
        variant === 'tinted' && styles.iconTinted,
        variant === 'floating' && [styles.floating, elevation(dark)],
        disabled && styles.disabled,
      ]}
      pressedStyle={variant === 'floating' ? styles.floatingPressed : styles.iconPressed}
    >
      <Icon name={icon} size={size} color={color} />
    </PressableScale>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
  accessibilityLabel,
  floating,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Category colour: tints the icon, and fills the chip when selected. */
  color?: string;
  accessibilityLabel?: string;
  /** Raised with a shadow, for chips laid over a map. */
  floating?: boolean;
}) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  const activeBg = color ?? colors.surfaceInverse;
  const fg = selected ? (color ? '#FFFFFF' : colors.textInverse) : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      scale={0.95}
      style={[
        styles.chip,
        icon && styles.chipWithIcon,
        floating && [styles.chipFloating, shadow('sm', dark)],
        selected && { backgroundColor: activeBg },
      ]}
      pressedStyle={!selected && styles.chipPressed}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? fg : (color ?? colors.textMuted)} /> : null}
      <Text variant="callout" numberOfLines={1} style={[styles.chipLabel, { color: fg }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Horizontally scrolling row of chips. `flexGrow: 0` matters on web, where a horizontal
 * ScrollView otherwise stretches to fill its column parent. `bleed` runs the row to the screen
 * edges from inside a padded ScreenScroll, so chips scroll under the margin instead of being cut.
 */
export function ChipRow({
  children,
  inset = spacing.gutter,
  bleed,
}: {
  children: ReactNode;
  inset?: number;
  bleed?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      // Each nested ScrollView needs this; without it the first tap on a chip only closes the keyboard.
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={[{ flexGrow: 0, flexShrink: 0 }, bleed && { marginHorizontal: -spacing.gutter }]}
      contentContainerStyle={{
        paddingHorizontal: bleed ? spacing.gutter : inset,
        gap: spacing.sm,
        alignItems: 'center',
      }}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Pick one of a few options that swap what's shown. The selected pill slides between options
 * (state indication, 240ms ease-out on the UI thread) instead of jumping.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.segmented}>
      <View style={styles.segmentTrack}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentPill,
            lift(dark),
            {
              width: `${100 / options.length}%`,
              transform: [{ translateX: `${index * 100}%` }],
              transitionProperty: 'transform',
              transitionDuration: 240,
              transitionTimingFunction: EASE_OUT,
            },
          ]}
        />
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              aria-selected={selected}
              scale={0.97}
              onPress={() => {
                if (selected) return;
                haptics.selection();
                onChange(option.value);
              }}
              style={styles.segment}
            >
              <Text variant="callout" style={styles.segmentLabel} color={selected ? 'text' : 'textMuted'}>
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
  variant = 'elevated',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** elevated: resting card. outlined: hairline only. sunken: a recessed well for grouped info. */
  variant?: 'elevated' | 'outlined' | 'sunken';
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  return (
    <View style={[styles.card, styles[variant], variant === 'elevated' && lift(dark), style]}>
      {children}
    </View>
  );
}

/** A titled group of content. The optional action sits on the title's baseline, right-aligned. */
export function Section({
  title,
  children,
  action,
  caption,
}: {
  title: string;
  children: ReactNode;
  action?: { label: string; onPress: () => void };
  caption?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {action ? (
          <PressableScale onPress={action.onPress} accessibilityRole="button" hitSlop={10} scale={0.95}>
            <Text variant="callout" color="primaryText" style={styles.sectionAction}>
              {action.label}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" style={styles.sectionCaption}>
          {caption}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const styles = useStyles();
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/** A small status pill: "Visited", "Saved rate". */
export function Pill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  icon?: IconName;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tones = {
    neutral: [colors.surfaceSunken, colors.textMuted],
    brand: [colors.primarySoft, colors.primaryText],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  } as const;
  const [bg, fg] = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" style={[styles.pillLabel, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        <Icon name={icon} size={30} color="primaryText" />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      <Text variant="callout" color="textMuted" align="center" style={styles.emptyBody}>
        {body}
      </Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function TextField({
  label,
  style,
  onFocus,
  onBlur,
  icon,
  hint,
  error,
  ...props
}: TextInputProps & {
  label?: string;
  /** Leading icon inside the field. */
  icon?: IconName;
  hint?: string;
  error?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Text variant="label">{label}</Text> : null}
      <Animated.View
        style={[
          styles.inputShell,
          props.multiline && styles.inputShellMultiline,
          focused && styles.inputShellFocused,
          !!error && styles.inputShellError,
          {
            transitionProperty: ['borderColor', 'backgroundColor'],
            transitionDuration: duration.state,
            transitionTimingFunction: EASE_OUT,
          },
        ]}
      >
        {icon ? (
          <View style={styles.inputIcon}>
            <Icon name={icon} size={18} color={focused ? 'text' : 'textMuted'} />
          </View>
        ) : null}
        <TextInput
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          accessibilityLabel={label ?? props.placeholder}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, props.multiline && styles.inputMultiline, style]}
        />
      </Animated.View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}

/** Large title for tab screens, which have no navigation header of their own. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenHeader, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.flex}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Scrollable screen body. Centers content and caps its width on tablets/desktop web
 * so text lines never stretch across a 1440px window.
 *
 * On Android, Expo apps are edge-to-edge, so the window no longer shrinks for the keyboard and
 * fields near the bottom end up under it. Padding the screen by the keyboard's height shrinks the
 * ScrollView, which then scrolls the focused field into view. iOS screens opt in per screen with
 * `automaticallyAdjustKeyboardInsets`.
 */
export function ScreenScroll({
  children,
  contentStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  // The screen sits below the header, but the keyboard is measured from the top of the window.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" {...rest}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Non-scrolling equivalent of ScreenScroll for screens that own their list. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.screen, style]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  disabled: { opacity: 0.4 },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTinted: { width: 36, height: 36, minWidth: 36, minHeight: 36, backgroundColor: t.colors.surfaceSunken },
  iconPressed: { backgroundColor: t.colors.surfacePressed },
  floating: { width: 48, height: 48, backgroundColor: t.colors.surfaceRaised },
  floatingPressed: { backgroundColor: t.colors.surfacePressed },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: t.colors.surfaceSunken,
  },
  chipWithIcon: { paddingLeft: 12 },
  chipPressed: { backgroundColor: t.colors.surfacePressed },
  chipFloating: { backgroundColor: t.colors.surfaceRaised },
  chipLabel: { fontWeight: '600' },
  segmented: {
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: t.colors.surfaceSunken,
  },
  segmentTrack: { flexDirection: 'row' },
  segmentPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.sm,
    backgroundColor: t.dark ? t.colors.surfacePressed : t.colors.surfaceRaised,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { fontWeight: '600' },
  card: { borderRadius: radius.lg, padding: spacing.lg },
  elevated: {
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  outlined: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  sunken: { backgroundColor: t.colors.surfaceSunken },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.1, flexShrink: 1 },
  sectionAction: { fontWeight: '600' },
  sectionCaption: { marginTop: -6 },
  divider: { height: 1, backgroundColor: t.colors.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
    flexGrow: 1,
  },
  emptyBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: t.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: { maxWidth: 300 },
  emptyAction: { marginTop: spacing.md, alignSelf: 'stretch', maxWidth: 320, width: '100%' },
  field: { gap: spacing.sm },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    minHeight: 52,
  },
  inputShellMultiline: { alignItems: 'flex-start' },
  inputShellFocused: { borderColor: t.colors.primary, backgroundColor: t.colors.surface },
  inputShellError: { borderColor: t.colors.danger },
  inputIcon: { paddingLeft: 14 },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fontFor('500'),
    color: t.colors.text,
    // The shell's border shows focus; the browser's own ring would draw a second box inside it.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputMultiline: { minHeight: 132, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  screen: { flex: 1, backgroundColor: t.colors.background },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
}));
