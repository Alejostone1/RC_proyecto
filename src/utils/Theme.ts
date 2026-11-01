/**
 * Paleta de las gráficas Canvas 2D. `COLORS` es un objeto vivo: el ThemeManager
 * lo actualiza al cambiar de tema, de modo que cada gráfica, al redibujarse,
 * usa automáticamente los colores del tema activo.
 */
export type ThemeName = 'dark' | 'light';

export interface ChartPalette {
  q: string;
  i: string;
  VL: string;
  VC: string;
  E: string;
  exact: string;
  error: string;
  grid: string;
  gridStrong: string;
  text: string;
  textDim: string;
  bg: string;
  tooltip: string;
  cursor: string;
  /** Componentes RGB "r, g, b" para trazos con transparencia variable. */
  trailRGB: string;
  band: string;
  /** Desenfoque de brillo de las trazas (0 en tema claro: sin efecto neón). */
  glow: number;
}

export const PALETTES: Record<ThemeName, ChartPalette> = {
  dark: {
    q: '#4fc3ff',
    i: '#ffb347',
    VL: '#c49bff',
    VC: '#5fe3a8',
    E: '#94a3b8',
    exact: '#f1f5f9',
    error: '#ff6b6b',
    grid: 'rgba(148, 197, 255, 0.09)',
    gridStrong: 'rgba(148, 197, 255, 0.22)',
    text: '#c9d6e6',
    textDim: '#7d8ea6',
    bg: '#070b12',
    tooltip: 'rgba(8, 14, 24, 0.88)',
    cursor: 'rgba(255, 255, 255, 0.35)',
    trailRGB: '79, 195, 255',
    band: 'rgba(255, 179, 71, 0.08)',
    glow: 6,
  },
  light: {
    q: '#1f5fae',
    i: '#b8620f',
    VL: '#6a4c9c',
    VC: '#2e7d55',
    E: '#64748b',
    exact: '#1b2533',
    error: '#b42318',
    grid: 'rgba(27, 37, 51, 0.07)',
    gridStrong: 'rgba(27, 37, 51, 0.2)',
    text: '#1b2533',
    textDim: '#5b6b80',
    bg: '#ffffff',
    tooltip: 'rgba(255, 255, 255, 0.96)',
    cursor: 'rgba(27, 37, 51, 0.4)',
    trailRGB: '31, 95, 174',
    band: 'rgba(184, 98, 15, 0.09)',
    glow: 0,
  },
};

export const COLORS: ChartPalette = { ...PALETTES.dark };

export function applyChartPalette(theme: ThemeName): void {
  Object.assign(COLORS, PALETTES[theme]);
}
