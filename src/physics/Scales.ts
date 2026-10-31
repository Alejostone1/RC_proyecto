/**
 * Escalas de referencia de una configuración: el máximo de |q|, |i|, |V_L|, |V_C|
 * y P_R que alcanzará la solución EXACTA en un horizonte representativo.
 *
 * La visualización 3D normaliza cada efecto con estas escalas
 * (p. ej. brillo del resistor = P_R(t) / P_R,máx), de modo que lo que se ve es
 * proporcional a la magnitud física real y no a una ganancia arbitraria.
 */
import { solveAnalytically } from './AnalyticalSolver';
import type { DampingAnalysis } from './DampingClassifier';
import { evaluateExcitation, type Excitation } from './Excitation';
import type { InitialConditions, RLCParams } from './RLCModel';

export interface PhysicalScales {
  horizon: number;
  q: number;
  i: number;
  VL: number;
  VC: number;
  PR: number;
  energy: number;
}

const EPS = 1e-12;

/** Horizonte: ~5 constantes de tiempo del modo más lento y al menos 6 períodos. */
export function representativeHorizon(a: DampingAnalysis, exc: Excitation): number {
  const MAX = 30;
  const slowest = Math.min(Math.abs(a.roots[0].re), Math.abs(a.roots[1].re));
  const decay = slowest > 0 ? 5 / slowest : MAX;
  const natural = (6 * 2 * Math.PI) / a.omega0;
  const forced = exc.kind === 'sine' && exc.omega > 0 ? (8 * 2 * Math.PI) / exc.omega : 0;
  return Math.min(MAX, Math.max(decay, natural, forced, 1));
}

export function computeScales(p: RLCParams, exc: Excitation, ic: InitialConditions, a: DampingAnalysis): PhysicalScales {
  const horizon = representativeHorizon(a, exc);
  const sol = solveAnalytically(p, exc, ic);
  const N = 3000;
  const s = { q: 0, i: 0 };
  let q = EPS;
  let i = EPS;
  let VL = EPS;
  let VC = EPS;
  let PR = EPS;
  let energy = EPS;
  for (let k = 0; k <= N; k++) {
    const t = (horizon * k) / N;
    sol.evaluate(t, s);
    const vc = s.q / p.C;
    const vl = evaluateExcitation(exc, t) - p.R * s.i - vc;
    q = Math.max(q, Math.abs(s.q));
    i = Math.max(i, Math.abs(s.i));
    VC = Math.max(VC, Math.abs(vc));
    VL = Math.max(VL, Math.abs(vl));
    PR = Math.max(PR, s.i * s.i * p.R);
    energy = Math.max(energy, (s.q * s.q) / (2 * p.C) + 0.5 * p.L * s.i * s.i);
  }
  return { horizon, q, i, VL, VC, PR, energy };
}
