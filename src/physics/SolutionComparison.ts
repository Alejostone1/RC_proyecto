/**
 * Comparación RK4 vs. solución analítica:
 *     error(t) = |q_RK4(t) − q_analítico(t)|,   error_máximo = max error(t)
 * Este módulo solo calcula; la gráfica correspondiente vivirá en visualization/.
 */
import { solveAnalytically } from './AnalyticalSolver';
import type { Excitation } from './Excitation';
import { createRLCDerivative, type InitialConditions, type RLCParams } from './RLCModel';
import { integrate } from './RK4Solver';

export interface ComparisonResult {
  t: Float64Array;
  qRK4: Float64Array;
  qExact: Float64Array;
  iRK4: Float64Array;
  iExact: Float64Array;
  error: Float64Array;
  maxError: number;
  /** max error / max |q_exacto| */
  maxRelativeError: number;
  maxErrorAt: number;
}

export function compareSolutions(
  p: RLCParams,
  exc: Excitation,
  ic: InitialConditions,
  tEnd: number,
  h: number,
  sampleEvery = 1,
): ComparisonResult {
  const num = integrate(createRLCDerivative(p, exc), [ic.q0, ic.i0], tEnd, h, sampleEvery);
  const exact = solveAnalytically(p, exc, ic);
  const n = num.t.length;
  const qExact = new Float64Array(n);
  const iExact = new Float64Array(n);
  const error = new Float64Array(n);
  const tmp = { q: 0, i: 0 };
  let maxError = 0;
  let maxErrorAt = 0;
  let maxQ = 0;
  for (let k = 0; k < n; k++) {
    exact.evaluate(num.t[k], tmp);
    qExact[k] = tmp.q;
    iExact[k] = tmp.i;
    error[k] = Math.abs(num.x[0][k] - tmp.q);
    maxQ = Math.max(maxQ, Math.abs(tmp.q));
    if (error[k] > maxError) {
      maxError = error[k];
      maxErrorAt = num.t[k];
    }
  }
  return {
    t: num.t,
    qRK4: num.x[0],
    iRK4: num.x[1],
    qExact,
    iExact,
    error,
    maxError,
    maxRelativeError: maxQ > 0 ? maxError / maxQ : maxError,
    maxErrorAt,
  };
}
