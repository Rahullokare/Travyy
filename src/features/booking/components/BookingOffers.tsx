import { View } from 'react-native';
import { env } from '@/shared/config/env';
import { track } from '@/shared/lib/analytics';
import { openUrl } from '@/shared/lib/platform';
import { lift, makeStyles, radius, useTheme } from '@/shared/theme';
import { Icon, IconBadge, PressableScale, Section, Text } from '@/shared/ui';
import type { Offer } from '../offers';

export const PARTNER_IDS = { gygPartnerId: env.gygPartnerId, bookingAid: env.bookingAid };

/** Partner booking links, grouped in one card and labelled as such. Renders nothing without offers. */
export function BookingOffers({ offers, from }: { offers: Offer[]; from: 'place' | 'trip' }) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  if (offers.length === 0) return null;
  return (
    <Section title="Book ahead" caption="Partner links. Travyy may earn a commission, at no cost to you.">
      <View style={[styles.card, lift(dark)]}>
        {offers.map((offer, i) => (
          <PressableScale
            key={offer.kind}
            scale={0.98}
            style={[styles.row, i > 0 && styles.divider]}
            pressedStyle={styles.pressed}
            accessibilityRole="link"
            accessibilityLabel={`${offer.title} on ${offer.partnerLabel}`}
            onPress={() => {
              track('booking_opened', { partner: offer.partner, kind: offer.kind, from });
              openUrl(offer.url);
            }}
          >
            <IconBadge icon={offer.icon} color={colors.accent} size={44} />
            <View style={styles.text}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {offer.title}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {offer.subtitle} · {offer.partnerLabel}
              </Text>
            </View>
            <Icon name="open-outline" size={18} color="textSubtle" />
          </PressableScale>
        ))}
      </View>
    </Section>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  pressed: { backgroundColor: t.colors.surfacePressed },
  text: { flex: 1, gap: 2 },
}));
