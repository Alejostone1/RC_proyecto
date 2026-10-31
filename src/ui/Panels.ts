/**
 * Paneles de texto: TELEMETRÍA, MODELO MATEMÁTICO, ¿QUÉ ESTÁ PASANDO?,
 * estadísticas de la comparación y de la resonancia.
 * Las partes estáticas se reconstruyen solo al cambiar la configuración; las
 * dinámicas se actualizan a baja frecuencia (no en cada frame).
 */
import { solveAnalytically } from '../physics/AnalyticalSolver';
import { REGIME_LABELS, type DampingAnalysis } from '../physics/DampingClassifier';
import { analyzeResonance } from '../physics/Resonance';
import type { ComparisonResult } from '../physics/SolutionComparison';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtNum, fmtSI } from '../utils/Format';

const n = (x: number, d = 4) => fmtNum(x, d);
const v = (s: string) => `<var>${s}</var>`;
const frac = (a: string, b: string) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
/** Término "+ 3.2" / "− 3.2" para escribir ecuaciones con los valores numéricos. */
const term = (x: number, d = 4) => (x < 0 ? ` − ${n(-x, d)}` : ` + ${n(x, d)}`);

type Row = { label: string; cls?: string; get: () => string };

export class Telemetry {
  private readonly rows: Array<{ el: HTMLElement; get: () => string; last: string }> = [];
  private readonly bar: { c: HTMLElement; l: HTMLElement };
  fps = 0;
  stepsPerFrame = 0;

  constructor(
    root: HTMLElement,
    private readonly engine: SimulationEngine,
  ) {
    const e = engine;
    const s = e.state;
    const sections: Array<[string, Row[]]> = [
      [
        'Parámetros',
        [
          { label: 'R', get: () => fmtSI(e.params.R, 'Ω') },
          { label: 'L', get: () => fmtSI(e.params.L, 'H') },
          { label: 'C', get: () => fmtSI(e.params.C, 'F') },
          { label: 'E₀', get: () => (e.excitation.kind === 'free' ? '— (libre)' : fmtSI(e.excitation.E0, 'V')) },
          { label: 'ω', get: () => (e.excitation.kind === 'sine' ? `${n(e.excitation.omega)} rad/s` : '—') },
        ],
      ],
      [
        'Análisis de la ecuación característica',
        [
          { label: 'α', get: () => `${n(e.analysis.alpha)} s⁻¹` },
          { label: 'ω₀', get: () => `${n(e.analysis.omega0)} rad/s` },
          { label: 'ω_d', get: () => (e.analysis.omegaD > 0 ? `${n(e.analysis.omegaD)} rad/s` : '— (no oscila)') },
          { label: 'Δ = α² − ω₀²', get: () => `${n(e.analysis.delta)} s⁻²` },
          { label: 'R_c', get: () => fmtSI(e.analysis.Rc, 'Ω') },
          { label: 'ζ = R/R_c', get: () => n(e.analysis.zeta) },
          { label: 's₁, s₂', get: () => rootsText(e.analysis) },
          { label: 'Régimen', get: () => REGIME_LABELS[e.analysis.regime] },
        ],
      ],
      [
        'Estado instantáneo',
        [
          { label: 't', get: () => `${s.t.toFixed(4)} s` },
          { label: 'E(t)', get: () => fmtSI(s.E, 'V') },
          { label: 'q(t)', cls: 'q', get: () => fmtSI(s.q, 'C') },
          { label: 'i(t)', cls: 'i', get: () => fmtSI(s.i, 'A') },
          { label: 'di/dt', get: () => fmtSI(s.didt, 'A/s') },
          { label: 'V_R(t)', get: () => fmtSI(s.VR, 'V') },
          { label: 'V_L(t)', cls: 'vl', get: () => fmtSI(s.VL, 'V') },
          { label: 'V_C(t)', cls: 'vc', get: () => fmtSI(s.VC, 'V') },
          { label: 'Σ caídas − E', get: () => fmtSI(s.VR + s.VL + s.VC - s.E, 'V') },
        ],
      ],
      [
        'Energía',
        [
          { label: 'E_C = q²/2C', cls: 'vc', get: () => fmtSI(s.EC, 'J') },
          { label: 'E_L = Li²/2', cls: 'vl', get: () => fmtSI(s.EL, 'J') },
          { label: 'E_C + E_L', get: () => fmtSI(s.EC + s.EL, 'J') },
          { label: 'P_R = i²R', cls: 'i', get: () => fmtSI(s.PR, 'W') },
        ],
      ],
      [
        'Numérico y rendimiento',
        [
          { label: 'método', get: () => 'RK4 · paso fijo' },
          { label: 'h', get: () => fmtSI(e.h, 's') },
          { label: 'muestreo', get: () => fmtSI(e.sampleDt, 's') },
          { label: 'pasos/frame', get: () => String(this.stepsPerFrame) },
          { label: 'estado', get: () => s.status },
          { label: 'FPS', get: () => String(Math.round(this.fps)) },
        ],
      ],
    ];
    root.innerHTML = '';
    for (const [title, rows] of sections) {
      const sec = document.createElement('div');
      sec.className = 'tele-section';
      sec.innerHTML = `<h2>${title}</h2>`;
      const dl = document.createElement('dl');
      dl.className = 'tele';
      for (const r of rows) {
        const dt = document.createElement('dt');
        dt.textContent = r.label;
        const dd = document.createElement('dd');
        if (r.cls) dd.className = r.cls;
        dl.append(dt, dd);
        this.rows.push({ el: dd, get: r.get, last: '' });
      }
      sec.appendChild(dl);
      if (title === 'Energía') {
        const bar = document.createElement('div');
        bar.className = 'energy-bar';
        bar.innerHTML = '<i style="background:var(--green)"></i><i style="background:var(--violet)"></i>';
        sec.appendChild(bar);
        const legend = document.createElement('div');
        legend.className = 'note';
        legend.textContent = 'Reparto de la energía almacenada: capacitor (verde) / inductor (violeta).';
        sec.appendChild(legend);
        this.barEls = bar;
      }
      root.appendChild(sec);
    }
    const [c, l] = Array.from(this.barEls!.children) as HTMLElement[];
    this.bar = { c, l };
  }

  private barEls: HTMLElement | null = null;

  update(): void {
    for (const r of this.rows) {
      const t = r.get();
      if (t !== r.last) {
        r.el.textContent = t;
        r.last = t;
      }
    }
    const s = this.engine.state;
    const tot = s.EC + s.EL;
    const pc = tot > 0 ? (100 * s.EC) / tot : 50;
    this.bar.c.style.width = `${pc}%`;
    this.bar.l.style.width = `${100 - pc}%`;
  }
}

function rootsText(a: DampingAnalysis): string {
  const [r1, r2] = a.roots;
  if (r1.im !== 0) return `${n(r1.re)} ± ${n(Math.abs(r1.im))}j`;
  if (a.regime === 'critical') return `${n(r1.re)} (doble)`;
  return `${n(r1.re)}, ${n(r2.re)}`;
}

/** Panel MODELO MATEMÁTICO: derivación y ecuaciones con los valores actuales. */
export function renderMath(root: HTMLElement, e: SimulationEngine): void {
  const { R, L, C } = e.params;
  const exc = e.excitation;
  const a = e.analysis;
  const sol = solveAnalytically(e.params, exc, e.initial);
  const Etxt = exc.kind === 'step' ? n(exc.E0) : exc.kind === 'sine' ? `${n(exc.E0)} sin(${n(exc.omega)}${v('t')})` : '0';
  const charForm =
    a.regime === 'overdamped'
      ? `${v('s')}<sub>1,2</sub> = −α ± √Δ = ${n(a.roots[0].re)}, ${n(a.roots[1].re)}`
      : a.regime === 'critical'
        ? `${v('s')}<sub>1</sub> = ${v('s')}<sub>2</sub> = −α = ${n(-a.alpha)} (raíz doble)`
        : `${v('s')}<sub>1,2</sub> = −α ± ${v('j')}ω<sub>d</sub> = ${n(-a.alpha)} ± ${n(a.omegaD)}${v('j')}`;

  root.innerHTML = `
    <h2>1 · Segunda ley de Kirchhoff</h2>
    <p class="note">En un lazo cerrado, el voltaje aplicado es igual a la suma de las caídas de tensión.</p>
    <div class="eq">${v('V')}<sub>L</sub> + ${v('V')}<sub>R</sub> + ${v('V')}<sub>C</sub> = ${v('E')}(${v('t')})</div>
    <div class="eq">${v('L')} ${frac(`d${v('i')}`, `d${v('t')}`)} + ${v('R')}${v('i')} + ${frac('1', v('C'))}${v('q')} = ${v('E')}(${v('t')})</div>
    <h2>2 · Corriente y carga</h2>
    <div class="eq">${v('i')} = ${frac(`d${v('q')}`, `d${v('t')}`)} &nbsp;⇒&nbsp; ${frac(`d${v('i')}`, `d${v('t')}`)} = ${frac(`d²${v('q')}`, `d${v('t')}²`)}</div>
    <h2>3 · Ecuación diferencial de segundo orden</h2>
    <div class="eq big">${v('L')}${v('q')}″ + ${v('R')}${v('q')}′ + ${frac(v('q'), v('C'))} = ${v('E')}(${v('t')})</div>
    <p class="note">Con los valores actuales:</p>
    <div class="eq">${n(L)} ${v('q')}″${term(R)} ${v('q')}′${term(1 / C)} ${v('q')} = ${Etxt}</div>
    <h2>4 · Sistema de primer orden (para RK4)</h2>
    <p class="note">La ecuación de segundo orden se transforma en dos ecuaciones de primer orden con el estado ${v('x')} = [${v('q')}, ${v('i')}]. Así puede integrarse con Runge–Kutta 4, que trabaja con sistemas ${v('x')}′ = ${v('f')}(${v('t')}, ${v('x')}).</p>
    <div class="eq">${v('q')}′ = ${v('i')}</div>
    <div class="eq">${v('i')}′ = ${frac(`${v('E')}(${v('t')}) − ${v('R')}${v('i')} − ${v('q')}/${v('C')}`, v('L'))} = ${frac(`${Etxt} − ${n(R)}${v('i')} − ${n(1 / C)}${v('q')}`, n(L))}</div>
    <h2>5 · Runge–Kutta de cuarto orden</h2>
    <div class="eq" style="font-size:14px">
      ${v('k')}<sub>1</sub> = ${v('f')}(${v('t')}<sub>n</sub>, ${v('x')}<sub>n</sub>)<br>
      ${v('k')}<sub>2</sub> = ${v('f')}(${v('t')}<sub>n</sub> + ${v('h')}/2, ${v('x')}<sub>n</sub> + ${v('h')}${v('k')}<sub>1</sub>/2)<br>
      ${v('k')}<sub>3</sub> = ${v('f')}(${v('t')}<sub>n</sub> + ${v('h')}/2, ${v('x')}<sub>n</sub> + ${v('h')}${v('k')}<sub>2</sub>/2)<br>
      ${v('k')}<sub>4</sub> = ${v('f')}(${v('t')}<sub>n</sub> + ${v('h')}, ${v('x')}<sub>n</sub> + ${v('h')}${v('k')}<sub>3</sub>)<br>
      ${v('x')}<sub>n+1</sub> = ${v('x')}<sub>n</sub> + ${v('h')}(${v('k')}<sub>1</sub> + 2${v('k')}<sub>2</sub> + 2${v('k')}<sub>3</sub> + ${v('k')}<sub>4</sub>)/6
    </div>
    <p class="note">Paso fijo ${v('h')} = ${fmtSI(e.h, 's')}, elegido como 0.02 / (tasa más rápida del sistema). Es independiente del FPS.</p>
    <h2>6 · Ecuación característica</h2>
    <div class="eq">${v('s')}² + ${frac(v('R'), v('L'))}${v('s')} + ${frac('1', `${v('L')}${v('C')}`)} = 0 &nbsp;→&nbsp; ${v('s')}²${term(R / L)}${v('s')}${term(1 / (L * C))} = 0</div>
    <div class="eq" style="font-size:15px">α = ${frac(v('R'), `2${v('L')}`)} = ${n(a.alpha)} &nbsp; ω₀ = ${frac('1', `√(${v('L')}${v('C')})`)} = ${n(a.omega0)} &nbsp; Δ = α² − ω₀² = ${n(a.delta)}</div>
    <div class="eq" style="font-size:15px">${charForm}</div>
    <div class="callout"><b>${REGIME_LABELS[a.regime]}</b> — ${regimeCondition(a)}</div>
    <h2>7 · Solución analítica: <span style="text-transform:none">q = q<sub>h</sub> + q<sub>p</sub></span></h2>
    <p class="note">Respuesta natural (transitoria) con las constantes ajustadas a q(0) = ${n(e.initial.q0)} C y i(0) = ${n(e.initial.i0)} A:</p>
    <div class="eq" style="font-size:14px">${sol.natural.formula}</div>
    <p class="note">Respuesta forzada (permanente):</p>
    <div class="eq" style="font-size:14px">${sol.forced.formula}</div>
    ${sol.forced.kind === 'pure-resonance' ? '<div class="callout warn">R = 0 y ω = ω₀: resonancia pura. La amplitud crece linealmente con t; no existe régimen permanente acotado.</div>' : ''}
  `;
}

function regimeCondition(a: DampingAnalysis): string {
  switch (a.regime) {
    case 'undamped':
      return `R = 0 ⇒ α = 0: oscilación perpetua con ω₀ = ${n(a.omega0)} rad/s (circuito LC ideal).`;
    case 'underdamped':
      return `Δ < 0 ⇔ R < R_c = ${n(a.Rc)} Ω: raíces complejas, oscilación amortiguada con ω_d = ${n(a.omegaD)} rad/s.`;
    case 'critical':
      return `Δ ≈ 0 ⇔ R = R_c = ${n(a.Rc)} Ω: raíz real doble, retorno más rápido sin oscilar.`;
    case 'overdamped':
      return `Δ > 0 ⇔ R > R_c = ${n(a.Rc)} Ω: dos raíces reales negativas, retorno lento sin oscilar.`;
  }
}

/** Panel ¿QUÉ ESTÁ PASANDO?: parte estática (por configuración) + dinámica. */
export class Explain {
  private readonly live: HTMLDivElement;
  private readonly staticEl: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private readonly engine: SimulationEngine,
  ) {
    root.innerHTML = '<h2>Ahora mismo</h2>';
    this.live = document.createElement('div');
    this.live.className = 'callout';
    this.staticEl = document.createElement('div');
    root.append(this.live, this.staticEl);
  }

  rebuild(): void {
    const e = this.engine;
    const a = e.analysis;
    const { R, L, C } = e.params;
    const exc = e.excitation;
    let reson = '';
    if (exc.kind === 'sine') {
      const r = analyzeResonance(e.params, exc.E0, exc.omega);
      reson = `
        <h3>Resonancia</h3>
        <p>La fuente oscila con ω = ${n(exc.omega)} rad/s y el circuito tiene frecuencia natural ω₀ = ${n(r.omega0)} rad/s (|ω − ω₀| = ${n(r.detuning)}).
        ${r.near ? '<b>Estamos dentro de la banda de resonancia (|ω − ω₀| ≤ α):</b> la fuente empuja la carga en fase con su oscilación natural y la amplitud de la corriente se acerca a su máximo.' : 'Estamos fuera de la banda de resonancia: la fuente y el circuito "no están sincronizados" y la amplitud de la corriente es menor.'}</p>
        <p>Amplitud permanente de la corriente: ${fmtSI(r.currentAmplitude, 'A')}. Máximo teórico en ω = ω₀: E₀/R = ${fmtSI(r.peakCurrent, 'A')}.
        ${R > 0 ? 'Con R > 0 la amplitud en resonancia es <b>finita</b>: la resistencia disipa la energía que entrega la fuente.' : 'Con R = 0 no hay disipación y en ω = ω₀ la amplitud crece linealmente con el tiempo, sin límite (caso ideal).'}</p>`;
    }
    this.staticEl.innerHTML = `
      <h3>Régimen: ${REGIME_LABELS[a.regime]}</h3>
      <p>${regimeStory(a)}</p>
      <h3>¿Qué representa cada variable?</h3>
      <p><b style="color:var(--accent)">q(t)</b> es la carga en las placas del capacitor [C]. <b style="color:var(--amber)">i(t) = dq/dt</b> es la corriente [A], es decir, la rapidez con que cambia la carga.</p>
      <h3>¿Qué hace cada componente?</h3>
      <p><b>R = ${fmtSI(R, 'Ω')}</b> se opone al paso de corriente y transforma energía en calor (P = i²R). Es la causa del amortiguamiento.<br>
      <b>L = ${fmtSI(L, 'H')}</b> se opone a los <i>cambios</i> de corriente (V_L = L di/dt) y guarda energía en su campo magnético. Es la "inercia" del circuito.<br>
      <b>C = ${fmtSI(C, 'F')}</b> acumula carga y guarda energía en su campo eléctrico (V_C = q/C). Actúa como un "resorte".</p>
      <h3>Los parámetros del análisis</h3>
      <p><b>α = R/2L = ${n(a.alpha)} s⁻¹</b>: rapidez con que decae la envolvente e<sup>−αt</sup>. Tiempo característico 1/α = ${a.alpha > 0 ? fmtSI(1 / a.alpha, 's') : '∞'}.<br>
      <b>ω₀ = 1/√(LC) = ${n(a.omega0)} rad/s</b>: frecuencia a la que oscilaría el circuito sin resistencia (período ${fmtSI((2 * Math.PI) / a.omega0, 's')}).<br>
      <b>ω_d = √(ω₀² − α²)</b>: frecuencia real de la oscilación amortiguada${a.omegaD > 0 ? ` = ${n(a.omegaD)} rad/s` : ' (no existe en este régimen)'}.<br>
      <b>Δ = α² − ω₀² = ${n(a.delta)}</b>: su signo decide el tipo de raíces de la ecuación característica y, por tanto, el régimen.</p>
      ${reson}
      <h3>Sobre la animación</h3>
      <p class="note">Las partículas representan de forma <b>conceptual</b> la corriente convencional: su velocidad y su sentido siguen a i(t). No son una simulación de electrones. Las líneas alrededor de la bobina y entre las placas son representaciones conceptuales de los campos magnético y eléctrico, con intensidad proporcional a i y a V_C. No son una simulación electromagnética completa.</p>`;
  }

  update(): void {
    const s = this.engine.state;
    const e = this.engine;
    if (s.status === 'idle') {
      this.live.innerHTML = 'Interruptor abierto: el circuito está en sus condiciones iniciales. Cierra el interruptor (▶ Iniciar) para ver la evolución de la ecuación.';
      return;
    }
    const tot = s.EC + s.EL;
    const pc = tot > 0 ? Math.round((100 * s.EC) / tot) : 0;
    const iSmall = Math.abs(s.i) < 0.02 * e.scales.i;
    const charging = s.q * s.i > 0;
    const parts: string[] = [];
    parts.push(
      iSmall
        ? 'La corriente es prácticamente nula: las partículas se detienen.'
        : `La corriente circula en sentido <b>${s.i > 0 ? 'positivo' : 'negativo'}</b> (${fmtSI(s.i, 'A')}).`,
    );
    if (Math.abs(s.q) > 0.02 * e.scales.q) parts.push(`El capacitor se está <b>${charging ? 'cargando' : 'descargando'}</b> (|q| ${charging ? 'aumenta' : 'disminuye'}). La placa A es ${s.q > 0 ? 'positiva' : 'negativa'}.`);
    parts.push(`Energía almacenada: ${pc}% en el capacitor y ${100 - pc}% en el inductor.`);
    if (e.params.R > 0) parts.push(`El resistor disipa ${fmtSI(s.PR, 'W')} como calor.`);
    if (Math.abs(s.VL) > 0.3 * e.scales.VL) parts.push(`La corriente cambia con rapidez (di/dt = ${fmtSI(s.didt, 'A/s')}): el inductor responde con V_L = ${fmtSI(s.VL, 'V')}.`);
    if (s.status === 'paused') parts.push('<i>(simulación en pausa)</i>');
    this.live.innerHTML = parts.join(' ');
  }
}

function regimeStory(a: DampingAnalysis): string {
  switch (a.regime) {
    case 'undamped':
      return 'Sin resistencia no hay pérdidas: la energía pasa una y otra vez del capacitor al inductor y vuelve, como un péndulo ideal. En el retrato de fase la trayectoria es una curva cerrada.';
    case 'underdamped':
      return `La resistencia es pequeña frente a R_c = ${n(a.Rc)} Ω. La carga oscila con frecuencia ω_d dentro de una envolvente e<sup>−αt</sup> que decrece: en el retrato de fase la trayectoria es una espiral que converge al equilibrio.`;
    case 'critical':
      return 'La resistencia es exactamente la crítica: el sistema vuelve al equilibrio lo más rápido posible sin oscilar. Es la frontera entre oscilar y no oscilar.';
    case 'overdamped':
      return 'La resistencia es tan grande que frena cualquier oscilación: la carga se acerca al equilibrio de forma lenta y monótona, como la suma de dos exponenciales decrecientes.';
  }
}

export function renderCompareStats(root: HTMLElement, r: ComparisonResult, tEnd: number, h: number): void {
  const ok = r.maxRelativeError < 1e-6;
  root.innerHTML = `
    <span>intervalo</span><span>[0, ${tEnd.toFixed(2)}] s</span>
    <span>paso h</span><span>${fmtSI(h, 's')} (${Math.round(tEnd / h)} pasos)</span>
    <span>error máximo</span><span class="${ok ? 'good' : ''}">${fmtSI(r.maxError, 'C')}</span>
    <span>en t =</span><span>${r.maxErrorAt.toFixed(4)} s</span>
    <span>error relativo</span><span class="${ok ? 'good' : ''}">${r.maxRelativeError.toExponential(2)}</span>
    <span>veredicto</span><span class="${ok ? 'good' : ''}">${ok ? 'RK4 coincide con la solución exacta' : 'revisar el paso h'}</span>`;
}

export function renderResonanceStats(root: HTMLElement, e: SimulationEngine): void {
  const exc = e.excitation;
  const r = analyzeResonance(e.params, exc.E0 || 1, exc.omega);
  root.innerHTML = `
    <span>ω (fuente)</span><span>${exc.kind === 'sine' ? `${n(exc.omega)} rad/s` : '— (fuente no senoidal)'}</span>
    <span>ω₀</span><span>${n(r.omega0)} rad/s</span>
    <span>|ω − ω₀|</span><span>${exc.kind === 'sine' ? n(r.detuning) : '—'}</span>
    <span>semiancho α</span><span>${n(e.analysis.alpha)} rad/s</span>
    <span>|I| permanente</span><span>${exc.kind === 'sine' ? fmtSI(r.currentAmplitude, 'A') : '—'}</span>
    <span>E₀/R (máximo)</span><span>${fmtSI(r.peakCurrent, 'A')}</span>
    <span>estado</span><span class="${r.near && exc.kind === 'sine' ? 'good' : ''}">${exc.kind !== 'sine' ? 'seleccione fuente senoidal' : r.near ? 'cerca de resonancia' : 'fuera de resonancia'}</span>`;
}
