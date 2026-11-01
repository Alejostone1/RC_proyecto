/**
 * Gestor de tema claro/oscuro. Fuente única de verdad para:
 *   - el atributo data-theme del documento (variables CSS),
 *   - la paleta de las gráficas (COLORS),
 *   - los suscriptores (escena 3D, gráficas que deban redibujarse).
 * El tema elegido se recuerda en el navegador; por defecto, oscuro.
 */
import { applyChartPalette, type ThemeName } from '../utils/Theme';

const KEY = 'rlc-theme';

export class ThemeManager {
  theme: ThemeName;
  private readonly listeners: Array<(t: ThemeName) => void> = [];

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* almacenamiento no disponible: se usa el valor por defecto */
    }
    this.theme = saved === 'light' ? 'light' : 'dark';
    this.apply(false);
  }

  onChange(fn: (t: ThemeName) => void): void {
    this.listeners.push(fn);
  }

  toggle(): void {
    this.set(this.theme === 'dark' ? 'light' : 'dark');
  }

  set(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignorar */
    }
    this.apply(true);
  }

  private apply(animate: boolean): void {
    const root = document.documentElement;
    if (animate) {
      // Transición suave de colores solo durante el cambio (no en cada hover).
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 450);
    }
    root.dataset.theme = this.theme;
    applyChartPalette(this.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', this.theme === 'dark' ? '#070c15' : '#f4f6f9');
    for (const fn of this.listeners) fn(this.theme);
  }
}
