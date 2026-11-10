/** Motyw bazowy + żywy obiekt `colors` (podmieniany przy wysokim kontraście). */

/** Motyw bazowy — kontrast tekstu ≥ WCAG AA (~4,5:1) na jasnym tle. */
export const BASE_COLORS = {
  bg: '#d6d8dc',
  bgHeader: '#d6d8dc',
  tabBar: '#1a2430',
  tabIdle: '#2a3644',
  tabActive: '#3d5166',
  card: '#f7f8fa',
  cardBorder: '#3a5f78',
  button: '#e6e9ee',
  buttonOn: '#cfd7e0',
  text: '#121417',
  muted: '#4a5058',
  ink: '#0e1116',
  line: '#b0b6be',
  accent: '#1a2430',
  accentSoft: 'rgba(26, 36, 48, 0.1)',
  cyan: '#1f5f82',
  ok: '#1f7a2e',
  warn: '#8a5a00',
  danger: '#b00020',
  dangerSoft: 'rgba(176, 0, 32, 0.12)',
  battery: '#1f7a2e',
  bgRaised: '#eef0f3',
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
  md: 14,
  lg: 18,
  xl: 22,
  card: 18,
};
