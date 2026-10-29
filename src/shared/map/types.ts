import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LatLng } from '@/domain/models';

export interface MapMarker {
  id: string;
  coordinate: LatLng;
  /** Pin background colour. */
  color: string;
  /** Short glyph rendered in the pin: an emoji, a stop number or a check mark. */
  label: string;
  selected?: boolean;
  accessibilityLabel?: string;
}

export interface MapRoute {
  coordinates: LatLng[];
  color: string;
}

/** Imperative camera controls, identical on native and web. */
export interface MapHandle {
  fitTo(points: LatLng[]): void;
  centerOn(point: LatLng): void;
}

export interface MapProps {
  ref?: Ref<MapHandle>;
  markers: MapMarker[];
  route?: MapRoute;
  /** Points the camera frames on first render. */
  initialPoints?: LatLng[];
  /** Device location: native draws the OS blue dot, web draws its own. */
  userLocation?: LatLng;
  interactive?: boolean;
  onMarkerPress?: (id: string) => void;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Extra padding (px) around framed points, e.g. to keep pins clear of overlays. */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
}
