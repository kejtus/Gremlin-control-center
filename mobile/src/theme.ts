/** Motyw bazowy + żywy obiekt `colors` (podmieniany przy wysokim kontraście). */

export const BASE_COLORS = {
  bg: '#cfcfcf',
  bgHeader: '#d4d4d4',
  tabBar: '#334050',
  tabIdle: '#4e6073',
  tabActive: '#6b8298',
  card: '#ffffff',
  cardBorder: '#7eb6d4',
  button: '#e4e4e4',
  buttonOn: '#cfd8e0',
  text: '#111111',
  muted: '#5a5a5a',
  ink: '#0b0b0b',
  line: '#d0d0d0',
  accent: '#3d4c5c',
  accentSoft: 'rgba(61, 76, 92, 0.12)',
  cyan: '#3d7ea6',
  ok: '#3cb44b',
  warn: '#c48a12',
  danger: '#d63b3b',
  dangerSoft: 'rgba(214, 59, 59, 0.12)',
  battery: '#3cb44b',
  bgRaised: '#f3f3f3',
} as const;

export type AppColors = { -readonly [K in keyof typeof BASE_COLORS]: string };

/** Żółty na czarnym — max kontrast. */
export const HIGH_CONTRAST_COLORS: AppColors = {
  bg: '#000000',
  bgHeader: '#000000',
  tabBar: '#000000',
  tabIdle: '#222222',
  tabActive: '#ffcc00',
  card: '#000000',
  cardBorder: '#ffcc00',
  button: '#1a1a1a',
  buttonOn: '#333333',
  text: '#ffcc00',
  muted: '#ffe066',
  ink: '#ffcc00',
  line: '#ffcc00',
  accent: '#ffcc00',
  accentSoft: 'rgba(255, 204, 0, 0.22)',
  cyan: '#66ccff',
  ok: '#00ff66',
  warn: '#ff9900',
  danger: '#ff3333',
  dangerSoft: 'rgba(255, 51, 51, 0.3)',
  battery: '#00ff66',
  bgRaised: '#111111',
};

/** Mutowalny motyw — StyleSheet.create z fabryki w komponencie czyta aktualne wartości. */
export const colors: AppColors = { ...BASE_COLORS };

export function applyThemeMode(highContrast: boolean) {
  Object.assign(colors, highContrast ? HIGH_CONTRAST_COLORS : BASE_COLORS);
}

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  card: 28,
};
