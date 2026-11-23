import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type Ref,
} from 'react';
import { PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng } from '@/domain/models';
import { haptics } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { Map, type MapHandle, type MapMarker } from '@/shared/map';
import { makeStyles, radius, shadow, spacing, useTheme } from '@/shared/theme';

/** How much of the sheet shows when it's pulled down: the handle and the header. */
const PEEK = 196;
/** Where the sheet rests when the screen opens: the map gets the top ~45%. */
const HALF = 0.45;
/** Room left above the fully open sheet for the floating back button. */
const TOP_GAP = 64;
/** A flick faster than this (px/s) picks the next stop in its direction, whatever the distance. */
const FLICK = 600;
const SIDE_SHEET_WIDTH = 420;

export type SheetStop = 'peek' | 'half' | 'full';

interface SheetControls {
  snapTo: (stop: SheetStop) => void;
  /** Lists call this when they start scrolling: content wants the room, so the sheet opens fully. */
  onListScroll: () => void;
}
const SheetContext = createContext<SheetControls>({ snapTo: () => {}, onListScroll: () => {} });
export const useMapSheet = () => useContext(SheetContext);

/**
 * A map with a sheet over it, glide-style (and Apple Maps-style): the map is the screen, the list
 * of spots slides over it and rests at three stops. Drag the handle or header to move it, flick
 * to jump, scroll the list to open it fully. Pins and the list are the same places, so a vault
 * is always something you can see *and* read.
 *
 * Built on PanResponder and Reanimated, so it needs no native module beyond what the app has
 * and works on the web as well.
 */
export function MapSheet({
  mapRef,
  markers,
  initialPoints,
  onMarkerPress,
  onMapPress,
  onMapLongPress,
  userLocation,
  topBar,
  floating,
  header,
  children,
  peekKey,
}: {
  mapRef?: Ref<MapHandle>;
  markers: MapMarker[];
  initialPoints?: LatLng[];
  onMarkerPress?: (id: string) => void;
  onMapPress?: () => void;
  onMapLongPress?: (point: LatLng) => void;
  userLocation?: LatLng;
  /** Back button and actions, floating over the top of the map. */
  topBar: ReactNode;
  /** Sits on the map just above the sheet: the locate button, a selected spot's card. */
  floating?: ReactNode;
  /** The draggable top of the sheet: title, progress, filters. */
  header: ReactNode;
  /** The list. It should fill the space (flex: 1) and scroll itself. */
  children: ReactNode;
  /** Changing this to a value (a selected pin's id) pulls the sheet down so the map is in view. */
  peekKey?: string;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { isWide } = useLayout();
  const reduced = useReducedMotion();

  const stops = useMemo(() => {
    const full = insets.top + TOP_GAP;
    const peek = Math.max(full, height - PEEK - insets.bottom);
    const half = Math.min(peek, Math.max(full, Math.round(height * HALF)));
    return { full, half, peek };
  }, [height, insets.top, insets.bottom]);

  const y = useSharedValue(stops.half);
  const at = useRef<SheetStop>('half');
  const startY = useRef(stops.half);

  const snapTo = (stop: SheetStop, velocity = 0) => {
    if (at.current !== stop) haptics.selection();
    at.current = stop;
    y.set(
      reduced
        ? withTiming(stops[stop], { duration: 120 })
        : withSpring(stops[stop], { damping: 30, stiffness: 260, mass: 0.9, velocity }),
    );
  };
  // Gesture callbacks are made once; they reach the latest snapTo (and its stops) through this.
  const snapRef = useRef(snapTo);
  useLayoutEffect(() => {
    snapRef.current = snapTo;
  });

  const pan = useMemo(
    () =>
      // PanResponder calls these from touch events only, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Let taps through to the header's buttons; take over once the finger really moves.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          startY.current = y.get();
        },
        onPanResponderMove: (_, g) => {
          const next = startY.current + g.dy;
          // Past either end the sheet resists, like a rubber band, instead of stopping dead.
          const over = next < stops.full ? next - stops.full : next > stops.peek ? next - stops.peek : 0;
          y.set(next - over + over * 0.25);
        },
        onPanResponderRelease: (_, g) => {
          const v = g.vy * 1000;
          const order: SheetStop[] = ['full', 'half', 'peek'];
          let target: SheetStop;
          if (Math.abs(v) > FLICK) {
            // A flick moves one stop from where the drag started, in its direction.
            const from = order.indexOf(at.current);
            target = order[Math.max(0, Math.min(order.length - 1, from + (v > 0 ? 1 : -1)))];
          } else {
            target = order.reduce((best, s) =>
              Math.abs(stops[s] - y.get()) < Math.abs(stops[best] - y.get()) ? s : best,
            );
          }
          snapRef.current(target, v);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [stops, y],
  );

  useEffect(() => {
    if (peekKey && at.current !== 'peek') snapRef.current('peek');
  }, [peekKey]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const controls = useMemo<SheetControls>(
    () => ({
      snapTo: (stop) => snapRef.current(stop),
      onListScroll: () => {
        if (at.current !== 'full') snapRef.current('full');
      },
    }),
    [],
  );

  const sheetHeight = height - stops.full;

  return (
    <SheetContext.Provider value={controls}>
      <View style={styles.fill}>
        <Map
          ref={mapRef}
          markers={markers}
          initialPoints={initialPoints}
          userLocation={userLocation}
          onMarkerPress={onMarkerPress}
          onPress={onMapPress}
          onLongPress={onMapLongPress}
          style={styles.map}
          edgePadding={
            isWide
              ? { top: 80, right: 60, bottom: 60, left: SIDE_SHEET_WIDTH + 60 }
              : { top: insets.top + 72, right: 76, bottom: height - stops.half + 24, left: 56 }
          }
        />

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          {topBar}
        </View>

        {/* Moves with the sheet, so the locate button and a spot's card always sit just above it. */}
        <Animated.View
          style={[styles.floating, isWide && styles.floatingWide, floatStyle]}
          pointerEvents="box-none"
        >
          <View style={styles.floatingInner} pointerEvents="box-none">
            {floating}
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            isWide && styles.sheetWide,
            { height: sheetHeight },
            shadow('lg', dark),
            sheetStyle,
          ]}
        >
          <View {...pan.panHandlers} style={styles.grabArea}>
            <Pressable
              style={styles.handleHit}
              hitSlop={8}
              accessibilityRole="adjustable"
              accessibilityLabel="List of spots"
              accessibilityHint="Swipe up to see more, down to see the map"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) =>
                snapTo(
                  e.nativeEvent.actionName === 'increment'
                    ? at.current === 'peek'
                      ? 'half'
                      : 'full'
                    : at.current === 'full'
                      ? 'half'
                      : 'peek',
                )
              }
              // A tap on the handle steps between the list and the map.
              onPress={() => snapTo(at.current === 'full' ? 'half' : 'full')}
            >
              <View style={styles.handle} />
            </Pressable>
            {header}
          </View>
          <View style={styles.fill}>{children}</View>
        </Animated.View>
      </View>
    </SheetContext.Provider>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  map: { ...absoluteFill },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  floating: { position: 'absolute', top: 0, left: 0, right: 0 },
  floatingWide: { left: SIDE_SHEET_WIDTH + 32 },
  // Anchored to the sheet's top edge: content grows upwards from there.
  floatingInner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'flex-end',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: t.colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: t.dark ? 1 : 0,
    borderBottomWidth: 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  sheetWide: {
    left: spacing.lg,
    right: undefined,
    width: SIDE_SHEET_WIDTH,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  // Dragging with a mouse on the web shouldn't select the header's text.
  grabArea: { paddingBottom: spacing.sm, userSelect: 'none' },
  handleHit: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: t.colors.borderStrong },
}));

const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
