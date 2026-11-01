/**
 * Mediciones de una respuesta q(t) a partir de un RunStatistics. Se usa el
 * MISMO algoritmo para la corrida RK4 y para la solución exacta muestreada,
 * así que la comparación "medido vs teórico" es justa.
 */
import { solveAnalytically } from '../physics/AnalyticalSolver';
import type { DampingAnalysis } from '../physics/DampingClassifier';
import { evaluateExcitation, type Excitation } from '../physics/Excitation';
import type { InitialConditions, RLCParams } from '../physics/RLCModel';
import { RunStatistics } from '../simulation/RunStatistics';

export interface Measurements {
  /** Período medido entre extremos de q [s] (null si no hubo oscilación suficiente). */
  period: number | null;
  /** α medido por decremento logarítmico [1/s] (solo respuesta natural subamortiguada). */
  alpha: number | null;
  /** Sobrepico respecto del valor final, en % (solo escalón). */
  overshootPct: number | null;
  /** Tiempo de establecimiento al 2 % [s] (null si aún no se estableció). */
  settlingTime: number | null;
  maxAbsQ: number;
  maxAbsI: number;
  tMaxAbsI: number;
  maxAbsVL: number;
  maxAbsVC: number;
  maxPR: number;
  crossings: number;
  extrema: number;
  energyDelivered: number;
  energyDissipated: number;
}

export function equilibriumCharge(p: RLCParams, exc: Excitation): number {
  return exc.kind === 'step' ? p.C * exc.E0 : 0;
}

/** Banda de establecimiento (2 %) — misma regla que usa el motor. */
export function settlingBand(p: RLCParams, exc: Excitation, ic: InitialConditions, scaleQ: number): number {
  const span = Math.abs(equilibriumCharge(p, exc) - ic.q0);
  return 0.02 * (exc.kind === 'step' && span > 0 ? span : scaleQ);
}

export function deriveMeasurements(st: RunStatistics, exc: Excitation, ic: InitialConditions, a: DampingAnalysis): Measurements {
  const n = st.extremaCount;
  const T = st.extremaT;
  const Q = st.extremaQ;

  // Período: promedio de t[k+2] − t[k]. En senoidal se usan los últimos extremos (régimen permanente).
  let period: number | null = null;
  if (n >= 3) {
    const from = exc.kind === 'sine' ? Math.max(0, n - 9) : 0;
    const to = exc.kind === 'sine' ? n : Math.min(n, 9);
    let sum = 0;
    let cnt = 0;
    for (let k = from; k + 2 < to; k++) {
      sum += T[k + 2] - T[k];
      cnt++;
    }
    if (cnt > 0) period = sum / cnt;
  }

  // Decremento logarítmico: A_k = |q_k − q_ref|, α = ln(A_k / A_{k+2}) / (t_{k+2} − t_k)
  let alpha: number | null = null;
  if (exc.kind !== 'sine' && (a.regime === 'underdamped' || a.regime === 'undamped') && n >= 3) {
    const A0 = Math.abs(Q[0] - st.qRef);
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k + 2 < Math.min(n, 9); k++) {
      const Ak = Math.abs(Q[k] - st.qRef);
      const Ak2 = Math.abs(Q[k + 2] - st.qRef);
      if (Ak2 < 1e-6 * A0 || Ak <= 0) break;
      sum += Math.log(Ak / Ak2) / (T[k + 2] - T[k]);
      cnt++;
    }
    if (cnt > 0) alpha = Math.max(0, sum / cnt);
  }

  let overshootPct: number | null = null;
  if (exc.kind === 'step') {
    const span = st.qRef - ic.q0;
    if (Math.abs(span) > 1e-15) {
      const peak = span > 0 ? st.qMax : st.qMin;
      overshootPct = (100 * Math.max(0, (peak - st.qRef) * Math.sign(span))) / Math.abs(span);
    }
  }

  // Establecido si lleva dentro de la banda al menos un 10 % del tiempo corrido (y ≥ 0.2 s)
  let settlingTime: number | null = null;
  if (exc.kind !== 'sine') {
    const last = Math.max(0, st.lastOutsideBand);
    if (st.tEnd - last >= Math.max(0.2, 0.1 * st.tEnd)) settlingTime = last;
  }

  return {
    period,
    alpha,
    overshootPct,
    settlingTime,
    maxAbsQ: st.maxAbsQ,
    maxAbsI: st.maxAbsI,
    tMaxAbsI: st.tMaxAbsI,
    maxAbsVL: st.maxAbsVL,
    maxAbsVC: st.maxAbsVC,
    maxPR: st.maxPR,
    crossings: st.crossings,
    extrema: n,
    energyDelivered: st.energyDelivered,
    energyDissipated: st.energyDissipated,
  };
}

/**
 * Recorre la solución EXACTA en [0, tEnd] con paso dt y acumula las mismas
 * estadísticas que el motor. Devuelve las estadísticas crudas.
 */
export function exactStatistics(p: RLCParams, exc: Excitation, ic: InitialConditions, tEnd: number, dt: number, scaleQ: number): RunStatistics {
  const sol = solveAnalytically(p, exc, ic);
  const st = new RunStatistics();
  st.reset(ic.q0, ic.i0, evaluateExcitation(exc, 0), p.R, equilibriumCharge(p, exc), settlingBand(p, exc, ic, scaleQ));
  const steps = Math.max(1, Math.round(tEnd / dt));
  const h = tEnd / steps;
  const s = { q: 0, i: 0 };
  for (let k = 1; k <= steps; k++) {
    const t = k * h;
    sol.evaluate(t, s);
    const E = evaluateExcitation(exc, t);
    const VC = s.q / p.C;
    st.onStep(t, h, s.q, s.i, E, p.R, E - p.R * s.i - VC, VC);
  }
  return st;
}
