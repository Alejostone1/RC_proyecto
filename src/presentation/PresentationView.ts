/**
 * Controlador de la PRESENTACIÓN interactiva.
 *  - Navegación: ← → / Espacio / Re Pág / Av Pág, botones, puntos y deslizar
 *    con el dedo (celular).
 *  - Cada escena revela su contenido paso a paso (atributo data-step).
 *  - El escenario 3D es la MISMA escena del laboratorio (un solo contexto WebGL).
 */
import './presentation.css';
import { SCENES, type SceneCtx, type SceneDef, type Stage } from './scenes';
import type { Widget } from './widgets';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class PresentationView {
  private index = 0;
  private step = 0;
  private ctx: SceneCtx | null = null;
  private frames: Array<(dt: number) => void> = [];
  private widgets: Widget[] = [];
  active = false;
  private readonly view = $('view-presentation');
  private readonly panel = $('pres-panel');
  private readonly dots = $('pres-dots');
  private readonly count = $('pres-count');
  private readonly notes = $('pres-notes');

  constructor(private readonly stage: Stage) {
    $('pres-prev').addEventListener('click', () => this.prev());
    $('pres-next').addEventListener('click', () => this.next());
    $('pres-notes-btn').addEventListener('click', () => this.toggleNotes());
    $('pres-full').addEventListener('click', () => this.toggleFullscreen());
    SCENES.forEach((s, k) => {
      const b = document.createElement('button');
      b.className = 'pres-dot';
      b.title = `${k + 1}. ${s.title}`;
      b.setAttribute('aria-label', `Ir a ${s.title}`);
      b.addEventListener('click', () => this.goTo(k, 0));
      this.dots.appendChild(b);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.bindSwipe();
  }

  get scene(): SceneDef {
    return SCENES[this.index];
  }

  enter(): void {
    this.active = true;
    this.goTo(this.index, this.step, true);
  }

  leave(): void {
    this.active = false;
    this.teardown();
    this.stage.orbit(0);
    this.stage.focus(null);
    this.stage.speed(1);
  }

  next(): void {
    if (this.step < this.scene.steps - 1) this.setStep(this.step + 1);
    else if (this.index < SCENES.length - 1) this.goTo(this.index + 1, 0);
  }

  prev(): void {
    if (this.step > 0) this.setStep(this.step - 1);
    else if (this.index > 0) this.goTo(this.index - 1, SCENES[this.index - 1].steps - 1);
  }

  private teardown(): void {
    for (const w of this.widgets) w.dispose();
    this.widgets = [];
    this.frames = [];
    this.ctx = null;
  }

  goTo(index: number, step: number, force = false): void {
    if (!force && index === this.index && this.ctx) return this.setStep(step);
    this.teardown();
    this.index = Math.max(0, Math.min(SCENES.length - 1, index));
    const s = this.scene;
    this.view.classList.toggle('hero', !!s.hero);
    this.panel.classList.remove('enter');
    void this.panel.offsetWidth; // reinicia la animación de entrada
    this.panel.classList.add('enter');
    this.panel.innerHTML = `
      <div class="pz-head">
        <span class="pz-kicker">${s.kicker}</span>
        <span class="pz-speaker" title="Expositor sugerido">${s.speaker}</span>
      </div>
      <h2 class="pz-title">${s.title}</h2>
      <div class="pz-body">${s.html()}</div>`;
    this.panel.scrollTop = 0;
    this.notes.innerHTML = `<b>${s.speaker}</b> · ${s.notes}`;
    this.stage.orbit(0);
    this.stage.speed(1);
    const ctx: SceneCtx = {
      stage: this.stage,
      el: this.panel,
      widgets: this.widgets,
      onFrame: (fn) => this.frames.push(fn),
    };
    this.ctx = ctx;
    s.enter(ctx);
    this.step = -1;
    this.setStep(Math.max(0, Math.min(step, s.steps - 1)));
  }

  private setStep(k: number): void {
    const s = this.scene;
    this.step = k;
    this.panel.querySelectorAll<HTMLElement>('[data-step]').forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle('in', n <= k);
      el.classList.toggle('cur', n === k);
    });
    if (this.ctx) s.step?.(k, this.ctx);
    // Lleva a la vista el último elemento revelado (útil en el celular)
    const cur = this.panel.querySelector<HTMLElement>('[data-step].cur');
    if (cur && k > 0) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    Array.from(this.dots.children).forEach((d, i) => {
      d.classList.toggle('on', i === this.index);
      d.classList.toggle('done', i < this.index);
    });
    this.count.textContent = `${this.index + 1}/${SCENES.length}${s.steps > 1 ? ` · ${k + 1}/${s.steps}` : ''}`;
    ($('pres-prev') as HTMLButtonElement).disabled = this.index === 0 && k === 0;
    ($('pres-next') as HTMLButtonElement).disabled = this.index === SCENES.length - 1 && k === s.steps - 1;
  }

  update(dt: number): void {
    if (!this.active) return;
    for (const f of this.frames) f(dt);
    for (const w of this.widgets) w.update(dt);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      this.next();
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      this.prev();
    } else if (e.key === 'n' || e.key === 'N') this.toggleNotes();
    else if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
    else if (e.key === 'Home') this.goTo(0, 0);
  }

  /** Deslizar horizontalmente sobre el panel cambia de paso (celular). */
  private bindSwipe(): void {
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    this.panel.addEventListener(
      'touchstart',
      (e) => {
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        t0 = performance.now();
      },
      { passive: true },
    );
    this.panel.addEventListener(
      'touchend',
      (e) => {
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && performance.now() - t0 < 700) {
          if (dx < 0) this.next();
          else this.prev();
        }
      },
      { passive: true },
    );
  }

  private toggleNotes(): void {
    this.notes.hidden = !this.notes.hidden;
    $('pres-notes-btn').classList.toggle('on', !this.notes.hidden);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
}
