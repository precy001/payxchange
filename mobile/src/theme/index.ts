// Design tokens. Colors now come in two palettes (light + dark) with identical
// keys, so screens can switch at runtime via ThemeContext. Non-color tokens
// (spacing, radius, fonts, shadows, gradients) are theme-independent.

const lightColors = {
  primary: '#4F46E5',
  primaryPressed: '#4338CA',
  primaryDark: '#3F37C9',
  primarySoft: '#EEF0FF',
  accent: '#7C3AED',

  success: '#12B76A',
  successSoft: '#E6F8EF',
  danger: '#F04438',
  dangerSoft: '#FEECEB',
  warning: '#F79009',
  warningSoft: '#FEF3E2',

  ink: '#0B1020',
  inkSoft: '#434A63',
  muted: '#8E93A6',

  bg: '#FFFFFF',
  bgSoft: '#F5F6FA',
  card: '#FFFFFF',
  line: '#ECEEF4',
  white: '#FFFFFF',

  onBrandStrong: 'rgba(255,255,255,0.94)',
  onBrandSoft: 'rgba(255,255,255,0.72)',
  onBrandGlass: 'rgba(255,255,255,0.16)',
  onBrandGlassLine: 'rgba(255,255,255,0.30)',
};

const darkColors: typeof lightColors = {
  primary: '#7C74F2', // a touch lighter for life against dark surfaces
  primaryPressed: '#6C63E8',
  primaryDark: '#5B52D6',
  primarySoft: '#23213D',
  accent: '#A78BFA',

  success: '#3DDB97',
  successSoft: '#11281E',
  danger: '#FF6B61',
  dangerSoft: '#2C1614',
  warning: '#FBBF5B',
  warningSoft: '#2C2110',

  ink: '#F4F6FB',
  inkSoft: '#C2C7D6',
  muted: '#878DA0',

  bg: '#161A27', // card / page surface
  bgSoft: '#0C0F1A', // app background (deepest)
  card: '#161A27',
  line: '#262B3B',
  white: '#FFFFFF', // stays true white (button text, QR background, on-gradient)

  onBrandStrong: 'rgba(255,255,255,0.94)',
  onBrandSoft: 'rgba(255,255,255,0.72)',
  onBrandGlass: 'rgba(255,255,255,0.16)',
  onBrandGlassLine: 'rgba(255,255,255,0.30)',
};

export type Palette = typeof lightColors;
export const palettes = { light: lightColors, dark: darkColors };

// Back-compat default (light). New code should read colors from useTheme().
export const colors = lightColors;

export const gradients = {
  brand: ['#4F46E5', '#7C3AED'] as const,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

export const shadow = {
  sm: { shadowColor: '#0B1020', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  md: { shadowColor: '#0B1020', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
  card: { shadowColor: '#0B1020', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },
};