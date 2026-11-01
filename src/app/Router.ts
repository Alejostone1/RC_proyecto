/**
 * Enrutador mínimo por hash: LABORATORIO ↔ PRESENTACIÓN ↔ RESULTADOS.
 * Funciona en cualquier hosting estático (Vercel, GitHub Pages) y con los
 * botones atrás/adelante del navegador y del celular.
 */
export type ViewId = 'lab' | 'presentation' | 'results';

const ROUTES: Record<string, ViewId> = {
  laboratorio: 'lab',
  presentacion: 'presentation',
  resultados: 'results',
};
const PATHS: Record<ViewId, string> = { lab: 'laboratorio', presentation: 'presentacion', results: 'resultados' };

export class Router {
  current: ViewId | null = null;

  constructor(private readonly onChange: (view: ViewId, prev: ViewId | null) => void) {
    window.addEventListener('hashchange', () => this.resolve());
  }

  start(): void {
    this.resolve();
  }

  go(view: ViewId): void {
    const hash = `#/${PATHS[view]}`;
    if (location.hash === hash) this.resolve();
    else location.hash = hash;
  }

  private resolve(): void {
    const key = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const view = ROUTES[key] ?? 'lab';
    if (view === this.current) return;
    const prev = this.current;
    this.current = view;
    document.body.dataset.view = view;
    for (const id of ['lab', 'presentation', 'results'] as ViewId[]) {
      const el = document.getElementById(`view-${id}`);
      if (el) el.hidden = id !== view;
    }
    document.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => {
      const on = a.dataset.route === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    this.onChange(view, prev);
  }
}
