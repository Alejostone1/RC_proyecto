/**
 * Escenas de la PRESENTACIÓN. Cada escena define su contenido, cuántos pasos
 * de revelado tiene (data-step), qué hace el escenario 3D y sus widgets.
 * Los valores mostrados salen del motor o de la solución exacta.
 */
import type { ComponentId } from '../components/types';
import { analyzeResonance } from '../physics/Resonance';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { PRESETS, type LabConfig } from '../ui/Presets';
import { fmtNum, fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { Oscilloscope } from '../visualization/Oscilloscope';
import { SolutionComparisonChart } from '../visualization/SolutionComparison';
import { T, tex } from './math';
import { CapacitorWidget, DampingWidget, EnergyWidget, LiveMeters, RK4Widget, ResonanceWidget, type Widget } from './widgets';

export interface Stage {
  engine: SimulationEngine;
  apply(cfg: LabConfig): void;
  shot(pos: [number, number, number], target: [number, number, number], duration?: number): void;
  focus(id: ComponentId | null): void;
  orbit(rate: number): void;
  overlays(o: { arrows?: boolean; energy?: boolean; potential?: boolean; labels?: boolean }): void;
  speed(s: number): void;
  toLab(): void;
}

export interface SceneCtx {
  stage: Stage;
  el: HTMLElement;
  widgets: Widget[];
  /** Ejecuta fn en cada frame mientras la escena esté activa. */
  onFrame(fn: (dt: number) => void): void;
}

export interface SceneDef {
  id: string;
  kicker: string;
  title: string;
  speaker: 'Alejandro' | 'Daniel' | 'Sebastián';
  notes: string;
  hero?: boolean;
  steps: number;
  html(): string;
  enter(ctx: SceneCtx): void;
  step?(k: number, ctx: SceneCtx): void;
}

const L = 0.5;
const C = 0.02;
const cfg = (R: number, exc: LabConfig['excitation'], q0 = 0, i0 = 0): LabConfig => ({ params: { R, L, C }, excitation: exc, initial: { q0, i0 } });
const W0 = 1 / Math.sqrt(L * C);
const v = (s: string) => `<var>${s}</var>`;

/** Lectura en vivo de valores del motor (texto actualizado a ~10 Hz). */
function live(ctx: SceneCtx, sel: string, get: () => string): void {
  const el = ctx.el.querySelector<HTMLElement>(sel);
  if (!el) return;
  let acc = 1;
  ctx.onFrame((dt) => {
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    el.textContent = get();
  });
}

function canvas(ctx: SceneCtx, sel: string): HTMLCanvasElement {
  return ctx.el.querySelector<HTMLCanvasElement>(sel)!;
}

export const SCENES: SceneDef[] = [
  // 1 ─────────────────────────────────────────────────────────────── PORTADA
  {
    id: 'portada',
    kicker: 'Matemáticas IV · Ecuaciones diferenciales',
    title: 'RLC LABORATORY',
    speaker: 'Alejandro',
    hero: true,
    steps: 2,
    notes: 'Presentar al equipo y la idea en una frase: "vamos a ver cómo una ecuación diferencial predice el comportamiento de un circuito real, y lo vamos a ver en 3D".',
    html: () => `
      <p class="pz-lead">Simulación 3D de un circuito RLC mediante ecuaciones diferenciales</p>
      <div class="pz-eq-hero" data-step="1">${tex(`${T.L('L\\,q\'\'')} + ${T.R('R\\,q\'')} + ${T.C('\\dfrac{q}{C}')} = ${T.E('E(t)')}`)}</div>
      <ul class="pz-team">
        <li>Alejandro Piedrahita</li><li>Daniel Colorado</li><li>Sebastián Patiño</li>
      </ul>
      <p class="pz-uni">Ingeniería de Sistemas y Telecomunicaciones · 8.º semestre<br><b>Universidad Católica de Pereira</b></p>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.resonance.build());
      ctx.stage.overlays({ arrows: false, energy: false, potential: true, labels: false });
      ctx.stage.shot([6.5, 4.2, 7.5], [0, 0.3, 0], 2.4);
      ctx.stage.orbit(0.08);
    },
  },

  // 2 ─────────────────────────────────────────────────────────────── PROBLEMA
  {
    id: 'problema',
    kicker: 'El problema',
    title: '¿Qué queremos modelar?',
    speaker: 'Alejandro',
    steps: 4,
    notes: 'Plantear la pregunta: al cerrar el interruptor, ¿cómo cambian la carga y la corriente con el tiempo? Recorrer la cadena física → matemática → ecuación → simulación.',
    html: () => `
      <p>Al cerrar el interruptor de un circuito con una <b>resistencia</b>, una <b>bobina</b> y un <b>capacitor</b>, ¿cómo evolucionan la carga ${v('q')}(${v('t')}) y la corriente ${v('i')}(${v('t')})?</p>
      <ol class="pz-flow">
        <li data-step="0"><b>Circuito físico</b><span>R, L, C y una fuente E(t)</span></li>
        <li data-step="1"><b>Modelo matemático</b><span>leyes de la física: Kirchhoff</span></li>
        <li data-step="2"><b>Ecuación diferencial</b><span>${tex(`L\\,q'' + R\\,q' + \\tfrac{q}{C} = E(t)`, false)}</span></li>
        <li data-step="3"><b>Simulación</b><span>RK4 + solución analítica + 3D</span></li>
      </ol>
      <div class="pz-live" data-step="3"><span>en vivo</span><b class="lv-q mono"></b><b class="lv-i mono"></b></div>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: true });
      ctx.stage.shot([5.2, 6.4, 8.6], [0, 0.2, 0], 1.6);
      ctx.stage.orbit(0);
      live(ctx, '.lv-q', () => `q = ${fmtSI(ctx.stage.engine.state.q, 'C')}`);
      live(ctx, '.lv-i', () => `i = ${fmtSI(ctx.stage.engine.state.i, 'A')}`);
    },
    step(k, ctx) {
      if (k === 1) ctx.stage.overlays({ arrows: true });
      if (k === 3) ctx.stage.apply(PRESETS.underdamped.build());
    },
  },

  // 3 ─────────────────────────────────────────────────────────────── RESISTOR
  {
    id: 'resistor',
    kicker: 'Los componentes · 1 de 3',
    title: 'La resistencia R',
    speaker: 'Sebastián',
    steps: 4,
    notes: 'Mostrar el resistor en primer plano. Insistir: R es la única pieza que convierte energía eléctrica en calor; por eso es la responsable del amortiguamiento.',
    html: () => `
      <p data-step="0"><b class="c-r">R</b> se opone al paso de la corriente. Se mide en ohmios (Ω).</p>
      <div class="pz-eq" data-step="1">${tex(`${T.R('V_R = R\\,i')}`)}<small>La caída de tensión es proporcional a la corriente (ley de Ohm).</small></div>
      <div class="pz-eq" data-step="2">${tex(`P_R = i^2 R`)}<small>Transforma energía en <b>calor</b>: observa cómo el resistor se calienta cuando la corriente crece.</small></div>
      <div class="pz-widget" data-step="1"><div class="pz-meters"></div></div>
      <p class="pz-callout" data-step="3">R es el <b>amortiguamiento</b> del circuito: ${tex('\\alpha = \\tfrac{R}{2L}', false)}. Más R ⇒ las oscilaciones se apagan más rápido.</p>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.resonance.build());
      ctx.stage.overlays({ arrows: true, energy: false, potential: false, labels: true });
      ctx.stage.focus('resistor');
      ctx.stage.shot([1.6, 1.6, 0.4], [0.45, 0.42, -1.8], 1.6);
      ctx.stage.orbit(0);
      const e = ctx.stage.engine;
      ctx.widgets.push(
        new LiveMeters(ctx.el.querySelector('.pz-meters')!, [
          { label: 'i(t)', color: 'var(--amber)', unit: 'A', get: () => e.state.i, scale: () => e.scales.i },
          { label: 'V_R = Ri', color: 'var(--amber)', unit: 'V', get: () => e.state.VR, scale: () => e.params.R * e.scales.i },
          { label: 'P_R = i²R', color: 'var(--red)', unit: 'W', get: () => e.state.PR, scale: () => e.scales.PR },
        ]),
      );
    },
  },

  // 4 ─────────────────────────────────────────────────────────────── INDUCTOR
  {
    id: 'inductor',
    kicker: 'Los componentes · 2 de 3',
    title: 'El inductor L',
    speaker: 'Sebastián',
    steps: 4,
    notes: 'En el osciloscopio, V_L es máxima cuando i cambia más rápido (pendiente) y vale cero en los picos de i: eso es exactamente una derivada.',
    html: () => `
      <p data-step="0"><b class="c-l">L</b> es una bobina: se opone a los <b>cambios</b> de corriente. Se mide en henrios (H).</p>
      <div class="pz-eq" data-step="1">${tex(`${T.L('V_L = L\\,\\dfrac{di}{dt}')}`)}<small>El voltaje depende de la <b>rapidez de cambio</b> de i, no de su valor: es una derivada.</small></div>
      <div class="pz-widget chart-sm" data-step="1"><canvas class="pz-scope"></canvas></div>
      <div class="pz-eq" data-step="2">${tex(`E_L = \\tfrac{1}{2} L\\,i^2`)}<small>Guarda energía en su <b>campo magnético</b> (líneas alrededor de la bobina, representación conceptual).</small></div>
      <p class="pz-callout" data-step="3">L es la <b>inercia</b> del circuito: junto con C fija ${tex('\\omega_0 = \\tfrac{1}{\\sqrt{LC}}', false)}.</p>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: true, energy: false, potential: false, labels: true });
      ctx.stage.focus('inductor');
      ctx.stage.shot([5.4, 1.9, 1.9], [3, 0.5, 0], 1.6);
      ctx.stage.speed(0.5);
      const scope = new Oscilloscope(canvas(ctx, '.pz-scope'), ctx.stage.engine);
      scope.channels[0].enabled = false;
      scope.channels[2].enabled = true;
      scope.timeDiv = 0.2;
      ctx.widgets.push({ update: () => scope.draw(), dispose: () => scope.dispose() });
    },
  },

  // 5 ─────────────────────────────────────────────────────────────── CAPACITOR
  {
    id: 'capacitor',
    kicker: 'Los componentes · 3 de 3',
    title: 'El capacitor C',
    speaker: 'Sebastián',
    steps: 4,
    notes: 'Las cargas rojas y azules crecen con |q|. En la gráfica, la energía almacenada es el área bajo la recta V = q/C.',
    html: () => `
      <p data-step="0"><b class="c-c">C</b> son dos placas separadas por un aislante: <b>almacena carga</b>. Se mide en faradios (F).</p>
      <div class="pz-eq" data-step="1">${tex(`${T.C('V_C = \\dfrac{q}{C}')}`)}<small>Placa A positiva (rojo) y placa B negativa (azul); los colores se intercambian si q cambia de signo.</small></div>
      <div class="pz-widget chart-sm" data-step="2"><canvas class="pz-cap"></canvas></div>
      <div class="pz-eq" data-step="2">${tex(`E_C = \\dfrac{q^2}{2C}`)}<small>Energía del campo eléctrico = área del triángulo.</small></div>
      <p class="pz-callout" data-step="3">C actúa como un <b>resorte</b>: devuelve la energía y hace posible la oscilación junto con L.</p>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: true, energy: false, potential: false, labels: true });
      ctx.stage.focus('capacitor');
      ctx.stage.shot([1.7, 1.6, 4.1], [0, 0.45, 1.8], 1.6);
      ctx.stage.speed(0.5);
      ctx.widgets.push(new CapacitorWidget(canvas(ctx, '.pz-cap'), ctx.stage.engine));
    },
  },

  // 6 ─────────────────────────────────────────────────────────────── KIRCHHOFF
  {
    id: 'kirchhoff',
    kicker: 'La ley física',
    title: 'Segunda ley de Kirchhoff',
    speaker: 'Alejandro',
    steps: 6,
    notes: 'Paso a paso: cada término se sustituye por su fórmula. Señalar en 3D las flechas de caída y el color de los cables: cada componente "baja" el potencial exactamente su caída. Al final, la verificación en vivo da 0 V.',
    html: () => `
      <p>En un lazo cerrado, el voltaje aplicado es igual a la suma de las caídas de tensión.</p>
      <div class="pz-derive">
        <div class="pz-eq" data-step="0">${tex(`${T.L('V_L')} + ${T.R('V_R')} + ${T.C('V_C')} = ${T.E('E(t)')}`)}</div>
        <div class="pz-eq" data-step="1">${tex(`${T.L('V_L')} + ${T.N(T.R('R\\,i'))} + ${T.C('V_C')} = ${T.E('E(t)')}`)}</div>
        <div class="pz-eq" data-step="2">${tex(`${T.N(T.L('L\\dfrac{di}{dt}'))} + ${T.R('R\\,i')} + ${T.C('V_C')} = ${T.E('E(t)')}`)}</div>
        <div class="pz-eq" data-step="3">${tex(`${T.L('L\\dfrac{di}{dt}')} + ${T.R('R\\,i')} + ${T.N(T.C('\\dfrac{q}{C}'))} = ${T.E('E(t)')}`)}</div>
        <div class="pz-eq pz-key" data-step="4">${tex(`i = \\dfrac{dq}{dt} \\;\\Rightarrow\\; \\dfrac{di}{dt} = \\dfrac{d^2q}{dt^2}`)}</div>
        <div class="pz-eq pz-final" data-step="5">${tex(`${T.L('L\\dfrac{d^2q}{dt^2}')} + ${T.R('R\\dfrac{dq}{dt}')} + ${T.C('\\dfrac{q}{C}')} = ${T.E('E(t)')}`)}<small>¡Nace la ecuación diferencial del circuito!</small></div>
      </div>
      <div class="pz-live" data-step="0"><span>comprobación en vivo</span><b class="lv-k mono"></b></div>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: true, energy: false, potential: true, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([0.4, 8.6, 5.4], [0.2, 0, 0.1], 1.8);
      ctx.stage.speed(0.4);
      const s = ctx.stage.engine.state;
      live(ctx, '.lv-k', () => `V_L + V_R + V_C − E = ${fmtSI(s.VL + s.VR + s.VC - s.E, 'V')}`);
    },
    step(k, ctx) {
      const focus: Array<ComponentId | null> = [null, 'resistor', 'inductor', 'capacitor', null, null];
      ctx.stage.focus(focus[k] ?? null);
    },
  },

  // 7 ─────────────────────────────────────────────────────────────── ¿POR QUÉ EDO?
  {
    id: 'edo',
    kicker: 'Del circuito a las matemáticas',
    title: '¿Por qué es una ecuación diferencial?',
    speaker: 'Alejandro',
    steps: 4,
    notes: 'La incógnita no es un número sino una FUNCIÓN q(t), y la ecuación la relaciona con sus derivadas. La tabla en vivo muestra que q, q′ e q″ cambian juntos y siempre cumplen la ecuación.',
    html: () => `
      <ol class="pz-chain">
        <li data-step="0"><b>Circuito</b></li>
        <li data-step="1"><b>Variables físicas</b><span>q(t), i(t), di/dt, t</span></li>
        <li data-step="2"><b>Derivadas</b><span>i = q′ · di/dt = q″</span></li>
        <li data-step="3"><b>Ecuación diferencial</b><span>relaciona q con q′ y q″</span></li>
      </ol>
      <table class="pz-table" data-step="2">
        <tr><th>${v('q')}(${v('t')})</th><td class="lv-q mono"></td><td>carga</td></tr>
        <tr><th>${v('q')}′ = ${v('i')}</th><td class="lv-i mono"></td><td>corriente</td></tr>
        <tr><th>${v('q')}″ = ${v('di')}/${v('dt')}</th><td class="lv-d mono"></td><td>cambio de la corriente</td></tr>
      </table>
      <div class="pz-tags" data-step="3"><span>lineal</span><span>2.º orden</span><span>coeficientes constantes</span><span>no homogénea si E ≠ 0</span></div>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([5.6, 3.6, 4.2], [1.3, 0.4, 0], 1.6);
      ctx.stage.speed(0.35);
      const s = ctx.stage.engine.state;
      live(ctx, '.lv-q', () => fmtSI(s.q, 'C'));
      live(ctx, '.lv-i', () => fmtSI(s.i, 'A'));
      live(ctx, '.lv-d', () => fmtSI(s.didt, 'A/s'));
    },
  },

  // 8 ─────────────────────────────────────────────────────────────── AL COMPUTADOR
  {
    id: 'rk4',
    kicker: 'Del papel al computador',
    title: 'Sistema de primer orden y RK4',
    speaker: 'Daniel',
    steps: 5,
    notes: 'RK4 evalúa cuatro pendientes por paso y las promedia con pesos 1-2-2-1. En la animación el paso h es enorme para que se vea; en el laboratorio h = 1 ms y el error es del orden de 10⁻⁹.',
    html: () => `
      <div class="pz-eq" data-step="0">${tex(`L\\,q'' + R\\,q' + \\tfrac{q}{C} = E(t)`)}</div>
      <div class="pz-eq" data-step="1">${tex(`x_1 = q,\\qquad x_2 = i = q'`)}<small>Cambio de variable: una ecuación de 2.º orden se convierte en dos de 1.er orden.</small></div>
      <div class="pz-eq" data-step="2">${tex(`\\begin{cases} q' = i \\\\[4pt] i' = \\dfrac{E(t) - R\\,i - q/C}{L} \\end{cases}`)}</div>
      <div class="pz-widget chart-md" data-step="3"><canvas class="pz-rk4"></canvas></div>
      <div class="pz-eq" data-step="4">${tex(`x_{n+1} = x_n + \\dfrac{h}{6}\\left(k_1 + 2k_2 + 2k_3 + k_4\\right)`)}<small>Error global O(h⁴): con h = 1 ms el error relativo es ≈ 10⁻⁹.</small></div>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: false });
      ctx.stage.focus(null);
      ctx.stage.shot([0.01, 11.5, 0.02], [0, 0, 0], 1.6);
      ctx.widgets.push(new RK4Widget(canvas(ctx, '.pz-rk4')));
    },
  },

  // 9 ─────────────────────────────────────────────────────────────── AMORTIGUAMIENTO
  {
    id: 'amortiguamiento',
    kicker: 'Solución de la ecuación',
    title: 'Los tres regímenes de amortiguamiento',
    speaker: 'Daniel',
    steps: 4,
    notes: 'El signo de Δ = α² − ω₀² decide todo. Mismo L y C; solo cambia R. En cada paso el circuito 3D ejecuta exactamente esa configuración.',
    html: () => `
      <div class="pz-eq">${tex(`s^2 + \\tfrac{R}{L}s + \\tfrac{1}{LC} = 0,\\quad \\Delta = \\alpha^2 - \\omega_0^2`)}</div>
      <div class="pz-widget chart-md"><canvas class="pz-damp"></canvas></div>
      <div class="pz-rline"><div class="pz-rbar"><i class="pz-rc"></i><b class="pz-rmark"></b></div><span class="pz-rtxt mono"></span></div>
      <div class="pz-cards">
        <div data-step="0"><b>Subamortiguado</b>${tex('\\Delta<0:\\; e^{-\\alpha t}(A\\cos\\omega_d t + B\\sin\\omega_d t)', false)}</div>
        <div data-step="1"><b>Crítico</b>${tex('\\Delta=0:\\; (A+Bt)\\,e^{-\\alpha t}', false)}</div>
        <div data-step="2"><b>Sobreamortiguado</b>${tex('\\Delta>0:\\; A e^{s_1 t} + B e^{s_2 t}', false)}</div>
      </div>`,
    enter(ctx) {
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([5.6, 3.6, 4.2], [1.3, 0.4, 0], 1.6);
      ctx.stage.speed(0.8);
      const w = new DampingWidget(canvas(ctx, '.pz-damp'), ctx.stage.engine);
      ctx.widgets.push(w);
      (ctx as SceneCtx & { damp?: DampingWidget }).damp = w;
    },
    step(k, ctx) {
      const w = (ctx as SceneCtx & { damp?: DampingWidget }).damp!;
      const Rs = [2, 10, 30];
      const Rc = 2 * Math.sqrt(L / C);
      w.showAll = k === 3;
      w.active = Math.min(k, 2);
      const R = k === 3 ? 2 : Rs[k];
      ctx.stage.apply(cfg(R, { kind: 'step', E0: 10, omega: W0 }));
      const mark = ctx.el.querySelector<HTMLElement>('.pz-rmark')!;
      const rc = ctx.el.querySelector<HTMLElement>('.pz-rc')!;
      rc.style.left = `${(100 * Rc) / 32}%`;
      mark.style.left = `${(100 * R) / 32}%`;
      const zeta = R / Rc;
      ctx.el.querySelector('.pz-rtxt')!.textContent = k === 3 ? 'misma L y C · solo cambia R' : `R = ${R} Ω · R_c = ${fmtNum(Rc, 3)} Ω · ζ = ${fmtNum(zeta, 3)}`;
    },
  },

  // 10 ────────────────────────────────────────────────────────────── RESONANCIA
  {
    id: 'resonancia',
    kicker: 'Excitación senoidal',
    title: 'Resonancia',
    speaker: 'Daniel',
    steps: 4,
    notes: 'Cuando ω se acerca a ω₀ las reactancias de L y C se cancelan y solo R limita la corriente: |I| = E₀/R. Es finita porque R > 0; solo con R = 0 crecería sin límite (linealmente en t).',
    html: () => `
      <div class="pz-eq">${tex(`|I(\\omega)| = \\dfrac{E_0}{\\sqrt{R^2 + \\left(\\omega L - \\tfrac{1}{\\omega C}\\right)^2}}`)}</div>
      <div class="pz-widget chart-md"><canvas class="pz-res"></canvas></div>
      <div class="pz-widget chart-sm"><canvas class="pz-scope"></canvas></div>
      <p class="pz-rtxt"></p>`,
    enter(ctx) {
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([5.2, 5.4, 7.4], [0.4, 0.2, 0], 1.6);
      ctx.stage.speed(1);
      ctx.widgets.push(new ResonanceWidget(canvas(ctx, '.pz-res'), ctx.stage.engine));
      const scope = new Oscilloscope(canvas(ctx, '.pz-scope'), ctx.stage.engine);
      scope.channels[0].enabled = false;
      scope.timeDiv = 0.5;
      ctx.widgets.push({ update: () => scope.draw(), dispose: () => scope.dispose() });
    },
    step(k, ctx) {
      const factors = [0.5, 1, 1.6, 1];
      const omega = factors[k] * W0;
      const c = cfg(1, { kind: 'sine', E0: 10, omega });
      ctx.stage.apply(c);
      const r = analyzeResonance(c.params, 10, omega);
      const texts = [
        `ω = ${fmtNum(omega, 3)} rad/s < ω₀: domina la reactancia del capacitor. |I| = ${fmtSI(r.currentAmplitude, 'A')}.`,
        `ω = ω₀ = ${fmtNum(W0, 3)} rad/s: resonancia. |I| = E₀/R = ${fmtSI(r.currentAmplitude, 'A')}: máxima, pero finita porque R > 0.`,
        `ω = ${fmtNum(omega, 3)} rad/s > ω₀: domina la reactancia del inductor. |I| = ${fmtSI(r.currentAmplitude, 'A')}.`,
        'Observa en 3D: en resonancia las partículas corren más rápido, el resistor se calienta más y el campo magnético es más intenso.',
      ];
      ctx.el.querySelector('.pz-rtxt')!.textContent = texts[k];
    },
  },

  // 11 ────────────────────────────────────────────────────────────── ENERGÍA
  {
    id: 'energia',
    kicker: 'Intercambio de energía',
    title: 'Energía: capacitor, inductor y calor',
    speaker: 'Sebastián',
    steps: 4,
    notes: 'Las columnas 3D y la gráfica muestran lo mismo: la energía va y viene entre C y L, y R la convierte poco a poco en calor. La suma de las tres siempre es la energía total.',
    html: () => `
      <div class="pz-eq-row">
        <div class="pz-eq" data-step="0">${tex(`${T.C('E_C = \\tfrac{q^2}{2C}')}`)}</div>
        <div class="pz-eq" data-step="1">${tex(`${T.L('E_L = \\tfrac{1}{2}L\\,i^2')}`)}</div>
        <div class="pz-eq" data-step="2">${tex(`${T.R('P_R = i^2 R')}`)}</div>
      </div>
      <div class="pz-widget chart-md"><canvas class="pz-energy"></canvas></div>
      <div class="pz-eq pz-final" data-step="3">${tex(`${T.C('E_C')} + ${T.L('E_L')} + ${T.R('W_R')} = E_{\\text{total}}`)}<small>Conservación de la energía: lo que pierde el circuito aparece como calor en R.</small></div>`,
    enter(ctx) {
      ctx.stage.apply(cfg(0.6, { kind: 'free', E0: 0, omega: W0 }, 0.2, 0));
      ctx.stage.overlays({ arrows: false, energy: true, potential: false, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([1.2, 3.4, 5.6], [-0.6, 0.6, 0], 1.6);
      ctx.stage.speed(0.6);
      ctx.widgets.push(new EnergyWidget(canvas(ctx, '.pz-energy'), ctx.stage.engine));
    },
  },

  // 12 ────────────────────────────────────────────────────────────── VALIDACIÓN
  {
    id: 'validacion',
    kicker: 'Resultados',
    title: '¿Cómo sabemos que es correcto?',
    speaker: 'Daniel',
    steps: 2,
    notes: 'Las dos curvas se superponen. El error máximo es de picocoulombs. Además hay 92 pruebas automáticas que se ejecutan antes de cada publicación.',
    html: () => `
      <p>Resolvemos la misma ecuación de dos formas y las comparamos:</p>
      <div class="pz-widget chart-md"><canvas class="pz-cmp"></canvas></div>
      <ul class="pz-checks" data-step="1">
        <li class="lv-err"></li>
        <li>Ejemplo del libro de Zill (sec. 5.1) reproducido exactamente.</li>
        <li>Al dividir h entre 2, el error baja ≈ 16 veces (orden 4).</li>
        <li>Con R = 0 la energía se conserva (deriva &lt; 10⁻⁹).</li>
        <li>92 pruebas automáticas en cada publicación.</li>
      </ul>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: false, energy: false, potential: false, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([5.2, 6.4, 8.6], [0, 0.2, 0], 1.6);
      const li = ctx.el.querySelector('.lv-err')!;
      const chart = new SolutionComparisonChart(canvas(ctx, '.pz-cmp'), ctx.stage.engine, (r) => {
        li.textContent = `Error máximo RK4 vs exacta: ${fmtSI(r.maxError, 'C')} (relativo ${r.maxRelativeError.toExponential(1)}).`;
      });
      ctx.widgets.push({ update: () => chart.draw(), dispose: () => chart.dispose() });
    },
  },

  // 13 ────────────────────────────────────────────────────────────── CONEXIÓN
  {
    id: 'conexion',
    kicker: 'Conexión con la simulación',
    title: 'Todo lo que acabamos de explicar está ocurriendo aquí',
    speaker: 'Sebastián',
    hero: true,
    steps: 1,
    notes: 'Pulsar "Entrar al laboratorio": la cámara vuela al laboratorio y la simulación arranca. Mostrar después "Obtener resultados" para el informe automático.',
    html: () => `
      <p class="pz-lead">Ecuación diferencial → modelo → RK4 y solución exacta → gráficas → comportamiento físico → animación 3D.</p>
      <div class="pz-hero-actions">
        <button class="primary pz-enter">Entrar al laboratorio →</button>
      </div>
      <p class="pz-uni">En el laboratorio puedes cambiar R, L, C y la fuente, y pulsar <b>Obtener resultados</b> para un informe interpretado automáticamente.</p>`,
    enter(ctx) {
      ctx.stage.apply(PRESETS.underdamped.build());
      ctx.stage.overlays({ arrows: true, energy: true, potential: true, labels: true });
      ctx.stage.focus(null);
      ctx.stage.shot([9, 7.5, 11], [0, 0.3, 0], 2);
      ctx.stage.orbit(0.1);
      ctx.el.querySelector('.pz-enter')!.addEventListener('click', () => ctx.stage.toLab());
    },
  },
];

/** Colores CSS de los términos (por si se necesitan en lienzos). */
export const TERM_COLORS = () => ({ L: COLORS.VL, R: COLORS.i, C: COLORS.VC, E: COLORS.q });
