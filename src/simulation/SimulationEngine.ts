/**
 * Motor de simulación: integra la EDO del RLC con RK4 a paso fijo, independiente
 * del renderizado. Expone un SimulationState que la visualización solo lee.
 */
import { classifyDamping, type DampingAnalysis } from '../physics/DampingClassifier';
import { computeEnergyInto, type EnergySnapshot } from '../physics/EnergyCalculator';
import { evaluateExcitation, type Excitation } from '../physics/Excitation';
import {
  createRLCDerivative,
  validateInitialConditions,
  validateParams,
  type InitialConditions,
  type RLCParams,
  type StateDerivative,
} from '../physics/RLCModel';
import { RK4Solver } from '../physics/RK4Solver';
import {
  MAX_TIMESTEP,
  MIN_TIMESTEP,
  OVERFLOW_THRESHOLD,
  TIMESTEP_FRACTION,
} from '../utils/Constants';
import { clamp } from '../utils/MathUtils';
import { computeScales, type PhysicalScales } from '../physics/Scales';
import { FixedTimestep } from './FixedTimestep';
import { History } from './History';
import { RunStatistics } from './RunStatistics';
import { createInitialState, type SimulationState } from './SimulationState';

export interface SimulationConfig {
  params: RLCParams;
  excitation: Excitation;
  initial: InitialConditions;
}

/**
 * Paso recomendado: una fracción del tiempo característico más rápido del sistema.
 * Tasas consideradas: ω₀, |s₂| (raíz rápida en sobreamortiguado ≈ R/L) y ω de la fuente.
 * Así RK4 queda lejos de su límite de estabilidad (|h·s| ≲ 2.78) incluso en casos rígidos.
 */
export function recommendedTimestep(analysis: DampingAnalysis, exc: Excitation): number {
  const fastestRoot = Math.max(Math.hypot(analysis.roots[0].re, analysis.roots[0].im), Math.hypot(analysis.roots[1].re, analysis.roots[1].im));
  const rate = Math.max(analysis.omega0, fastestRoot, exc.kind === 'sine' ? Math.abs(exc.omega) : 0);
  return clamp(TIMESTEP_FRACTION / rate, MIN_TIMESTEP, MAX_TIMESTEP);
}

export class SimulationEngine {
  readonly state: SimulationState;
  analysis!: DampingAnalysis;
  private config!: SimulationConfig;
  private f!: StateDerivative;
  /**
   * Estado aumentado x = [q, i, W_fuente, W_R]. Las dos últimas componentes son
   * integrales de energía (W' = E·i, W_R' = R·i²) que RK4 integra con el mismo
   * orden 4 que q e i; no influyen en la dinámica de q e i.
   */
  private readonly solver = new RK4Solver(4);
  private readonly x = new Float64Array(4);
  private fAug!: StateDerivative;
  private readonly dx = new Float64Array(2);
  private readonly energy: EnergySnapshot = { EC: 0, EL: 0, total: 0, PR: 0 };
  private stepCount = 0;
  readonly clock: FixedTimestep;
  /** Muestras para osciloscopio y retrato de fase (decimadas a `sampleDt`). */
  readonly history = new History(8192);
  /** Escalas físicas de referencia (máximos de la solución exacta). */
  scales!: PhysicalScales;
  /** Intervalo de muestreo del historial [s de simulación]. */
  sampleDt = 0.002;
  /** Estadísticas acumuladas de la corrida actual (para el informe de resultados). */
  readonly stats = new RunStatistics();
  private nextSampleStep = 0;
  private sampleEverySteps = 1;

  constructor(config: SimulationConfig) {
    this.state = createInitialState('underdamped');
    this.clock = new FixedTimestep(MAX_TIMESTEP);
    this.configure(config);
  }

  get h(): number {
    return this.clock.h;
  }

  get params(): Readonly<RLCParams> {
    return this.config.params;
  }

  get excitation(): Readonly<Excitation> {
    return this.config.excitation;
  }

  get initial(): Readonly<InitialConditions> {
    return this.config.initial;
  }

  /**
   * Aplica una nueva configuración y reinicia en t = 0.
   * Lanza RangeError si los parámetros son físicamente inválidos (L ≤ 0, C ≤ 0, R < 0, NaN…).
   */
  configure(config: SimulationConfig): void {
    const issues = [...validateParams(config.params), ...validateInitialConditions(config.initial)];
    if (!Number.isFinite(config.excitation.E0) || !Number.isFinite(config.excitation.omega)) {
      issues.push({ field: 'excitation', message: 'E₀ y ω deben ser finitos.' });
    }
    if (issues.length > 0) throw new RangeError(issues.map((i) => i.message).join(' '));

    this.config = {
      params: { ...config.params },
      excitation: { ...config.excitation },
      initial: { ...config.initial },
    };
    this.f = createRLCDerivative(this.config.params, this.config.excitation);
    const f2 = this.f;
    const exc = this.config.excitation;
    const R = this.config.params.R;
    this.fAug = (t, x, out) => {
      f2(t, x, out);
      out[2] = evaluateExcitation(exc, t) * x[1];
      out[3] = R * x[1] * x[1];
    };
    this.analysis = classifyDamping(this.config.params);
    this.clock.h = recommendedTimestep(this.analysis, this.config.excitation);
    this.scales = computeScales(this.config.params, this.config.excitation, this.config.initial, this.analysis);
    // ≥ 40 muestras por el período más corto relevante, sin bajar de h ni pasar de 5 ms
    const fastest = Math.max(this.analysis.omega0, this.config.excitation.kind === 'sine' ? this.config.excitation.omega : 0);
    const target = Math.min(0.005, (2 * Math.PI) / fastest / 40);
    this.sampleEverySteps = Math.max(1, Math.round(target / this.clock.h));
    this.sampleDt = this.sampleEverySteps * this.clock.h;
    this.reset();
  }

  reset(): void {
    this.x[0] = this.config.initial.q0;
    this.x[1] = this.config.initial.i0;
    this.x[2] = 0;
    this.x[3] = 0;
    this.stepCount = 0;
    this.clock.reset();
    this.state.status = 'idle';
    this.state.error = null;
    this.state.regime = this.analysis.regime;
    this.history.clear();
    this.nextSampleStep = 0;
    const { params, excitation, initial } = this.config;
    const qRef = excitation.kind === 'step' ? params.C * excitation.E0 : 0;
    const span = Math.abs(qRef - initial.q0);
    const band = 0.02 * (excitation.kind === 'step' && span > 0 ? span : this.scales.q);
    this.stats.reset(initial.q0, initial.i0, evaluateExcitation(excitation, 0), params.R, qRef, band);
    this.syncState();
    this.recordSample();
  }

  /** Tiempo de simulación que cabe en el historial [s]. */
  get historySpan(): number {
    return this.history.capacity * this.sampleDt;
  }

  private recordSample(): void {
    const s = this.state;
    s.t = this.stepCount * this.clock.h;
    const { R, C } = this.config.params;
    const q = this.x[0];
    const i = this.x[1];
    const E = evaluateExcitation(this.config.excitation, s.t);
    const VC = q / C;
    this.history.push(s.t, q, i, E - R * i - VC, VC, E);
    this.nextSampleStep = this.stepCount + this.sampleEverySteps;
  }

  start(): void {
    if (this.state.status !== 'error') this.state.status = 'running';
  }

  pause(): void {
    if (this.state.status === 'running') this.state.status = 'paused';
  }

  /** Avanza la simulación según el tiempo real transcurrido. Devuelve los pasos ejecutados. */
  update(realDt: number, speed = 1): number {
    if (this.state.status !== 'running') return 0;
    const n = this.clock.advance(realDt, speed, () => this.stepOnce());
    this.syncState();
    return n;
  }

  /** Avanza exactamente `n` pasos físicos (útil en pruebas y demostraciones). */
  stepN(n: number): void {
    for (let k = 0; k < n; k++) if (!this.stepOnce()) break;
    this.syncState();
  }

  private stepOnce(): boolean {
    const t = this.stepCount * this.clock.h;
    const prevQ = this.x[0];
    const prevI = this.x[1];
    const prevW = this.x[2];
    const prevWR = this.x[3];
    this.solver.step(this.fAug, t, this.x, this.clock.h);
    this.stepCount++;
    const q = this.x[0];
    const i = this.x[1];
    if (!Number.isFinite(q) || !Number.isFinite(i) || Math.abs(q) > OVERFLOW_THRESHOLD || Math.abs(i) > OVERFLOW_THRESHOLD) {
      const which = !Number.isFinite(q) || Math.abs(q) > OVERFLOW_THRESHOLD ? 'q(t)' : 'i(t)';
      const kind = Number.isNaN(q) || Number.isNaN(i) ? 'NaN' : 'desbordamiento numérico';
      this.state.status = 'error';
      this.state.error =
        `Simulación detenida en t = ${(this.stepCount * this.clock.h).toFixed(6)} s: ${kind} en ${which}. ` +
        `Revise los parámetros (R=${this.config.params.R}, L=${this.config.params.L}, C=${this.config.params.C}, h=${this.clock.h}).`;
      // Se restaura el último valor finito conocido para que la visualización no reciba NaN.
      this.x[0] = prevQ;
      this.x[1] = prevI;
      this.x[2] = prevW;
      this.x[3] = prevWR;
      this.stepCount--;
      return false;
    }
    const tn = this.stepCount * this.clock.h;
    const { R, C } = this.config.params;
    const E = evaluateExcitation(this.config.excitation, tn);
    const VC = q / C;
    this.stats.onStep(tn, this.clock.h, q, i, E, R, E - R * i - VC, VC);
    // Integrales de energía de orden 4 (sustituyen a la estimación por trapecio)
    this.stats.energyDelivered = this.x[2];
    this.stats.energyDissipated = this.x[3];
    if (this.stepCount >= this.nextSampleStep) this.recordSample();
    return true;
  }

  private syncState(): void {
    const s = this.state;
    const t = this.stepCount * this.clock.h;
    const { params, excitation } = this.config;
    this.f(t, this.x, this.dx);
    s.t = t;
    s.q = this.x[0];
    s.i = this.x[1];
    s.didt = this.dx[1];
    s.E = evaluateExcitation(excitation, t);
    s.VR = params.R * s.i;
    s.VC = s.q / params.C;
    s.VL = params.L * s.didt;
    computeEnergyInto(params, s.q, s.i, this.energy);
    s.EC = this.energy.EC;
    s.EL = this.energy.EL;
    s.PR = this.energy.PR;
    s.Wsrc = this.stats.energyDelivered;
    s.Wdiss = this.stats.energyDissipated;
  }
}
