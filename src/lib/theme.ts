export const colors = {
  bg: '#FAF7F2',
  card: '#FFFFFF',
  text: '#16130F',
  muted: '#6F675C',
  border: '#ECE6DC',
  primary: '#FF5A36',
  primaryDark: '#E2401D',
  primarySoft: '#FFE9E2',
  accent: '#0F766E',
  accentSoft: '#DDF3F0',
  success: '#1FA971',
  ink: '#1F1B16',
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  hero: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8, color: colors.text },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4, color: colors.text },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted },
  label: { fontSize: 12, fontWeight: '700' as const, color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
