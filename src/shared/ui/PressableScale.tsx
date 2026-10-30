import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { duration, EASE_OUT } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Style applied while the finger is down (colour changes, not transforms). */
  pressedStyle?: StyleProp<ViewStyle>;
  /** How far it sinks on press. Large surfaces want less. */
  scale?: number;
}

/**
 * Every tappable surface goes through this: it sinks slightly the moment a finger lands,
 * so the app answers on press-in rather than on release. A CSS transition on the UI thread,
 * so it stays smooth while JS is busy, and it's skipped under Reduce Motion.
 */
export function PressableScale({
  style,
  pressedStyle,
  scale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  return (
    <AnimatedPressable
      pressRetentionOffset={16}
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[
        style,
        pressed && pressedStyle,
        {
          transform: [{ scale: pressed && !reduced ? scale : 1 }],
          transitionProperty: ['transform', 'backgroundColor', 'borderColor', 'opacity'],
          transitionDuration: duration.press,
          transitionTimingFunction: EASE_OUT,
        },
      ]}
    />
  );
}
