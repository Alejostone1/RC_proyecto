/**
 * Runge–Kutta clásico de cuarto orden para sistemas x' = f(t, x) de dimensión n.
 *
 *   k₁ = f(tₙ,       xₙ)
 *   k₂ = f(tₙ + h/2, xₙ + h·k₁/2)
 *   k₃ = f(tₙ + h/2, xₙ + h·k₂/2)
 *   k₄ = f(tₙ + h,   xₙ + h·k₃)
 *   xₙ₊₁ = xₙ + h·(k₁ + 2k₂ + 2k₃ + k₄)/6
 *
 * Los buffers intermedios se reservan una sola vez: `step` no asigna memoria,
 * por lo que puede llamarse miles de veces por frame sin presión sobre el GC.
 */
import type { StateDerivative } from './RLCModel';

export class RK4Solver {
  readonly dim: number;
  private readonly k1: Float64Array;
  private readonly k2: Float64Array;
  private readonly k3: Float64Array;
  private readonly k4: Float64Array;
  private readonly tmp: Float64Array;

  constructor(dim: number) {
    if (!Number.isInteger(dim) || dim < 1) throw new RangeError('La dimensión debe ser un entero ≥ 1.');
    this.dim = dim;
    this.k1 = new Float64Array(dim);
    this.k2 = new Float64Array(dim);
    this.k3 = new Float64Array(dim);
    this.k4 = new Float64Array(dim);
    this.tmp = new Float64Array(dim);
  }

  /** Avanza `x` (in-place) de t a t + h. */
  step(f: StateDerivative, t: number, x: Float64Array, h: number): void {
    const { dim, k1, k2, k3, k4, tmp } = this;
    const hh = h / 2;

    f(t, x, k1);
    for (let j = 0; j < dim; j++) tmp[j] = x[j] + hh * k1[j];
    f(t + hh, tmp, k2);
    for (let j = 0; j < dim; j++) tmp[j] = x[j] + hh * k2[j];
    f(t + hh, tmp, k3);
    for (let j = 0; j < dim; j++) tmp[j] = x[j] + h * k3[j];
    f(t + h, tmp, k4);

    const h6 = h / 6;
    for (let j = 0; j < dim; j++) {
      x[j] += h6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    }
  }
}

export interface IntegrationResult {
  t: Float64Array;
  /** Componentes del estado: x[0][n] = q(tₙ), x[1][n] = i(tₙ) para el RLC. */
  x: Float64Array[];
}

/**
 * Integra desde t = 0 hasta tEnd con paso fijo h y guarda cada `sampleEvery` pasos.
 * Útil para validación y para generar series completas (no se usa en el bucle de render).
 */
export function integrate(
  f: StateDerivative,
  x0: ArrayLike<number>,
  tEnd: number,
  h: number,
  sampleEvery = 1,
): IntegrationResult {
  if (!(h > 0) || !(tEnd >= 0)) throw new RangeError('Se requiere h > 0 y tEnd ≥ 0.');
  const dim = x0.length;
  const steps = Math.round(tEnd / h);
  const nSamples = Math.floor(steps / sampleEvery) + 1;
  const t = new Float64Array(nSamples);
  const x = Array.from({ length: dim }, () => new Float64Array(nSamples));
  const state = Float64Array.from(x0);
  const solver = new RK4Solver(dim);

  let s = 0;
  const record = (time: number) => {
    t[s] = time;
    for (let j = 0; j < dim; j++) x[j][s] = state[j];
    s++;
  };
  record(0);
  for (let n = 1; n <= steps; n++) {
    // t se calcula como n·h (no acumulando) para no arrastrar error de redondeo.
    solver.step(f, (n - 1) * h, state, h);
    if (n % sampleEvery === 0) record(n * h);
  }
  return { t, x };
}
