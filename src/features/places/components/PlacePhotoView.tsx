import { useState } from 'react';
import { Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Place } from '@/domain/models';
import { duration, EASE_OUT } from '@/shared/ui';
import { forgetPhoto, usePlacePhoto } from '../photos';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * The place's photo laid over whatever is drawn underneath (the illustrated cover), fading in once
 * it has loaded so cards never flash an empty box. Renders nothing when there's no photo.
 */
export function PlacePhotoView({
  place,
  style,
}: {
  place: Pick<Place, 'name' | 'lat' | 'lng'>;
  style?: StyleProp<ImageStyle>;
}) {
  const photo = usePlacePhoto(place);
  const [loaded, setLoaded] = useState<string>();
  if (!photo?.url) return null;
  return (
    <AnimatedImage
      source={{ uri: photo.url }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      onLoad={() => setLoaded(photo.url)}
      onError={() => forgetPhoto(place)}
      style={[
        StyleSheet.absoluteFill,
        style,
        {
          opacity: loaded === photo.url ? 1 : 0,
          transitionProperty: 'opacity',
          transitionDuration: duration.enter,
          transitionTimingFunction: EASE_OUT,
        },
      ]}
    />
  );
}

/** Whether a place has a photo, for layouts that change around one (a darker scrim, a credit line). */
export { usePlacePhoto } from '../photos';
