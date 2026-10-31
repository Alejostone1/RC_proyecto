/**
 * RLC LABORATORY — punto de entrada.
 *
 * Flujo de datos (unidireccional):
 *   Controles → configuración → SimulationEngine (RK4, paso fijo)
 *            → SimulationState → escena 3D / gráficas / paneles
 */
import './styles.css';
import type { VisualFrame } from './components/types';
import type { CameraView } from './scene/CameraManager';
import { SceneManager } from './scene/SceneManager';
import { SimulationEngine } from './simulation/SimulationEngine';
import { Controls } from './ui/Controls';
import { DemoRunner, dampingDemo, resonanceDemo } from './ui/Demos';
import { HUD } from './ui/HUD';
import { Explain, Telemetry, renderCompareStats, renderMath, renderResonanceStats } from './ui/Panels';
import { PresentationMode } from './ui/PresentationMode';
import { DEFAULT_PRESET, PRESETS, type LabConfig, type PresetId } from './ui/Presets';
import { COLORS } from './utils/Theme';
import { Oscilloscope, TIME_DIVS } from './visualization/Oscilloscope';
import { PhasePortrait } from './visualization/PhasePortrait';
import { ResonanceCurve } from './visualization/ResonanceCurve';
import { SolutionComparisonChart } from './visualization/SolutionComparison';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

class App {
  private readonly engine: SimulationEngine;
  private readonly scene: SceneManager;
  private readonly controls: Controls;
  private readonly hud: HUD;
  private readonly telemetry: Telemetry;
  private readonly explain: Explain;
  private readonly scope: Oscilloscope;
  private readonly phase: PhasePortrait;
  private readonly compare: SolutionComparisonChart;
  private readonly resonance: ResonanceCurve;
  private readonly presentation: PresentationMode;
  private readonly demos: DemoRunner;

  private switchClosed = false;
  private speed = 1;
  private view: CameraView = 'general';
  private config: LabConfig;

  private last = performance.now();
  private time = 0;
  private fps = 60;
  private slowTick = 0;
  private explainTick = 0;
  private scopeZoomEl!: HTMLSpanElement;

  constructor() {
    this.config = PRESETS[DEFAULT_PRESET].build();
    this.engine = new SimulationEngine(this.config);
    this.scene = new SceneManager($('viewport'));
    this.hud = new HUD(this.engine, this.scene);
    this.telemetry = new Telemetry($('telemetry'), this.engine);
    this.explain = new Explain($('explain'), this.engine);
    this.scope = new Oscilloscope($<HTMLCanvasElement>('scope-canvas'), this.engine);
    this.phase = new PhasePortrait($<HTMLCanvasElement>('phase-canvas'), this.engine);
    this.compare = new SolutionComparisonChart($<HTMLCanvasElement>('compare-canvas'), this.engine, (r, tEnd, h) =>
      renderCompareStats($('compare-stats'), r, tEnd, h),
    );
    this.resonance = new ResonanceCurve($<HTMLCanvasElement>('resonance-canvas'), this.engine);
    this.presentation = new PresentationMode(this.engine, $<HTMLButtonElement>('btn-presentation'), () => this.scene.resize());
    this.demos = new DemoRunner((cfg) => {
      this.applyConfig(cfg, null);
      this.closeSwitch();
    });

    this.controls = new Controls($('left'), $('view-buttons'), {
      onConfig: (cfg) => this.applyConfig(cfg, null),
      onPreset: (id) => this.applyConfig(PRESETS[id].build(), id),
      onStart: () => this.start(),
      onPause: () => this.engine.pause(),
      onReset: () => this.reset(),
      onSwitch: () => (this.switchClosed ? this.openSwitch() : this.closeSwitch()),
      onSpeed: (s) => (this.speed = s),
      onView: (v) => this.setView(v),
      onBloom: (on) => (this.scene.post.enabled = on),
      onLabels: (on) => this.scene.setLabelsVisible(on),
    });

    this.scene.onPick = (id) => {
      this.hud.select(id);
      if (id === 'switch') this.switchClosed ? this.openSwitch() : this.closeSwitch();
    };

    this.buildScopeControls();
    this.bindTabs();
    this.bindKeys();
    $('btn-demo-damping').addEventListener('click', () => this.demos.start('Demostración de amortiguamiento', dampingDemo()));
    $('btn-demo-resonance').addEventListener('click', () => this.demos.start('Demostración de resonancia', resonanceDemo()));

    this.applyConfig(this.config, DEFAULT_PRESET);
    requestAnimationFrame(this.loop);
  }

  // ---------- configuración y control temporal ----------
  private applyConfig(cfg: LabConfig, presetId: PresetId | null): void {
    try {
      this.engine.configure(cfg);
    } catch (err) {
      this.hud.showError((err as Error).message);
      return;
    }
    this.config = cfg;
    if (this.switchClosed) this.engine.start();
    this.scene.onConfigure(this.frame(0, 0));
    this.hud.onConfigure();
    renderMath($('math'), this.engine);
    this.explain.rebuild();
    this.compare.invalidate();
    renderResonanceStats($('resonance-stats'), this.engine);
    this.scope.autoTimeDiv(this.engine.scales.horizon);
    this.scope.resetView();
    this.syncScopeControls();
    this.presentation.rebuild();
    this.controls.sync(cfg, presetId);
  }

  private closeSwitch(): void {
    this.switchClosed = true;
    this.engine.start();
  }

  private openSwitch(): void {
    // Abrir el interruptor desconecta el circuito: se vuelve a las condiciones
    // iniciales (no se modela el arco de apertura de un circuito inductivo).
    this.switchClosed = false;
    this.engine.reset();
  }

  private start(): void {
    if (!this.switchClosed) this.closeSwitch();
    else this.engine.start();
  }

  private reset(): void {
    this.demos.stop();
    this.openSwitch();
    this.hud.hideError();
  }

  private setView(v: CameraView): void {
    this.view = v;
    this.scene.cameras.goTo(v);
  }

  // ---------- osciloscopio ----------
  private buildScopeControls(): void {
    const root = $('scope-controls');
    for (const ch of this.scope.channels) {
      const b = document.createElement('button');
      b.className = 'ghost small chan';
      b.textContent = ch.id;
      b.title = `Canal ${ch.id}: ${ch.label}`;
      b.style.color = ch.color;
      b.addEventListener('click', () => {
        ch.enabled = !ch.enabled;
        this.syncScopeControls();
      });
      b.dataset.chan = ch.id;
      root.appendChild(b);
    }
    root.insertAdjacentHTML('beforeend', '<span class="sep"></span>');
    const hold = document.createElement('button');
    hold.className = 'ghost small';
    hold.id = 'scope-hold';
    hold.addEventListener('click', () => {
      this.scope.setHeld(!this.scope.held);
      this.syncScopeControls();
    });
    const clear = document.createElement('button');
    clear.className = 'ghost small';
    clear.textContent = 'Limpiar';
    clear.title = 'Reinicia la traza del osciloscopio';
    clear.addEventListener('click', () => this.scope.clearScreen());
    const sel = document.createElement('select');
    sel.id = 'scope-tdiv';
    sel.title = 'Escala temporal';
    for (const d of TIME_DIVS) sel.insertAdjacentHTML('beforeend', `<option value="${d}">${d >= 1 ? d + ' s' : d * 1000 + ' ms'}/div</option>`);
    sel.addEventListener('change', () => (this.scope.timeDiv = +sel.value));
    const zOut = document.createElement('button');
    zOut.className = 'ghost small';
    zOut.textContent = '−';
    zOut.title = 'Zoom vertical −';
    zOut.addEventListener('click', () => this.setZoom(this.scope.zoom / 2));
    this.scopeZoomEl = document.createElement('span');
    this.scopeZoomEl.className = 'mono dim';
    const zIn = document.createElement('button');
    zIn.className = 'ghost small';
    zIn.textContent = '+';
    zIn.title = 'Zoom vertical +';
    zIn.addEventListener('click', () => this.setZoom(this.scope.zoom * 2));
    root.append(hold, clear, sel, zOut, this.scopeZoomEl, zIn);
  }

  private setZoom(z: number): void {
    this.scope.zoom = Math.min(16, Math.max(0.25, z));
    this.syncScopeControls();
  }

  private syncScopeControls(): void {
    for (const ch of this.scope.channels) {
      const b = document.querySelector<HTMLButtonElement>(`[data-chan="${ch.id}"]`);
      if (b) {
        b.classList.toggle('on', ch.enabled);
        b.style.opacity = ch.enabled ? '1' : '0.45';
      }
    }
    const hold = $('scope-hold');
    hold.textContent = this.scope.held ? '▶ Continuar' : '❚❚ Congelar';
    hold.classList.toggle('on', this.scope.held);
    ($('scope-tdiv') as HTMLSelectElement).value = String(this.scope.timeDiv);
    this.scopeZoomEl.textContent = `×${this.scope.zoom}`;
  }

  // ---------- pestañas y teclado ----------
  private bindTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.tabs button');
    tabs.forEach((b) =>
      b.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.toggle('active', t === b));
        document.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
        if (b.dataset.tab === 'compare') this.compare.invalidate();
      }),
    );
  }

  private bindKeys(): void {
    const views: CameraView[] = ['general', 'components', 'top', 'capacitor', 'inductor'];
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.engine.state.status === 'running') this.engine.pause();
        else this.start();
      } else if (e.key === 'r' || e.key === 'R') this.reset();
      else if (e.key === 'p' || e.key === 'P') this.presentation.toggle();
      else if (e.key >= '1' && e.key <= '5') this.setView(views[+e.key - 1]);
      else if (e.key === 'Escape') {
        this.hud.select(null);
        this.scene.select(null);
      }
    });
  }

  // ---------- bucle ----------
  private frame(dt: number, simDt: number): VisualFrame {
    return {
      state: this.engine.state,
      scales: this.engine.scales,
      params: this.engine.params,
      excitation: this.engine.excitation,
      switchClosed: this.switchClosed,
      dt,
      simDt,
      time: this.time,
    };
  }

  private readonly loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    // 1) SIMULACIÓN (paso fijo, independiente del FPS)
    const t0 = this.engine.state.t;
    const steps = this.engine.update(dt, this.speed);
    const simDt = this.engine.state.t - t0;
    this.telemetry.stepsPerFrame = steps;
    this.demos.update(this.engine.state.t);

    // 2) VISUALIZACIÓN (solo lectura del estado)
    this.scene.update(this.frame(dt, simDt));
    this.scope.draw();
    this.phase.draw();
    this.compare.draw();

    this.slowTick += dt;
    if (this.slowTick >= 0.1) {
      this.slowTick = 0;
      this.telemetry.fps = this.fps;
      this.telemetry.update();
      this.hud.update(this.fps);
      this.presentation.update();
      this.resonance.draw();
      this.controls.syncRun(this.switchClosed, this.engine.state.status, this.speed, this.view);
    }
    this.explainTick += dt;
    if (this.explainTick >= 0.35) {
      this.explainTick = 0;
      this.explain.update();
    }
  };
}

function boot(): void {
  try {
    new App();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="padding:40px;color:${COLORS.text};font-family:system-ui;max-width:640px">
      <h1 style="color:#ff6b6b">No se pudo iniciar RLC Laboratory</h1>
      <p>${(err as Error).message}</p>
      <p>Este laboratorio necesita un navegador con WebGL habilitado (Chrome, Edge o Firefox recientes).</p></div>`;
  }
}

boot();
