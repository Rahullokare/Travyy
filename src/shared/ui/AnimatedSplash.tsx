import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/shared/theme';

/** Same size and place as the native splash image (app.config.ts, imageWidth), so the hand-off is invisible. */
const MARK = 120;
const RING = 64;

/**
 * The first second of the app: the native splash's pin drops onto the map, two rings ripple
 * out from where it lands ("a place, found"), the name rises in, then everything lifts away to
 * reveal the app. About 1.1s, and it never blocks: the app is already rendered underneath and
 * touches pass straight through. Reduce Motion gets a short fade instead.
 */
export function AnimatedSplash({ onLayout, onDone }: { onLayout?: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const drop = useSharedValue(0);
  const squash = useSharedValue(1);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const word = useSharedValue(0);
  const out = useSharedValue(0);

  useEffect(() => {
    const finish = () => {
      out.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1) }, (ok) => {
        if (ok) runOnJS(onDone)();
      });
    };
    if (reduced) {
      word.value = 1;
      const t = setTimeout(finish, 250);
      return () => clearTimeout(t);
    }
    // A small hop up, then a landing with a squash, like a pin pushed into a map.
    drop.value = withSequence(
      withTiming(-18, { duration: 180, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 9, stiffness: 260, mass: 0.7 }),
    );
    squash.value = withDelay(
      260,
      withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 300 })),
    );
    ring1.value = withDelay(280, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    ring2.value = withDelay(430, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    word.value = withDelay(320, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(finish, 1050);
    return () => clearTimeout(t);
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layer = useAnimatedStyle(() => ({ opacity: 1 - out.value }));
  const mark = useAnimatedStyle(() => ({
    transform: [
      { translateY: drop.value - out.value * 24 },
      { scale: 1 + out.value * 0.12 },
      { scaleY: squash.value },
    ],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 10 - out.value * 12 }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }, layer]}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.stage}>
        {/* The rings ripple from the pin's tip, flattened so they lie on the "ground". */}
        <Ring progress={ring1} color={colors.primary} />
        <Ring progress={ring2} color={colors.primary} />
        <Animated.View style={[styles.markWrap, mark]}>
          <Image source={require('../../../assets/splash-icon.png')} style={styles.mark} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.word, { color: colors.primary }, wordStyle]}>travyy</Animated.Text>
    </Animated.View>
  );
}

function Ring({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const grow = 0.3 + progress.value * 2.6;
    return {
      opacity: progress.value === 0 ? 0 : 0.5 * (1 - progress.value),
      transform: [{ scaleX: grow }, { scaleY: grow * 0.42 }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  // The mark is centred exactly like the native splash; the word hangs below without moving it.
  stage: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  markWrap: { width: MARK, height: MARK, transformOrigin: 'bottom' },
  mark: { width: MARK, height: MARK },
  ring: {
    position: 'absolute',
    // The pin's tip sits at 84% of the image's height.
    top: MARK * 0.84 - RING / 2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
  },
  word: {
    position: 'absolute',
    top: '50%',
    marginTop: MARK / 2 + 8,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    letterSpacing: -1.2,
  },
});
