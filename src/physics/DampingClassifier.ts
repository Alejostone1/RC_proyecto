/**
 * Clasificación del régimen a partir de la ecuación característica
 *     s² + (R/L)s + 1/(LC) = 0
 * con α = R/(2L), ω₀ = 1/√(LC), Δ = α² − ω₀²  ⇒  s = −α ± √Δ.
 */
import { CRITICAL_RELATIVE_TOLERANCE } from '../utils/Constants';
import { approxZero } from '../utils/MathUtils';
import {
  assertValidParams,
  criticalResistance,
  dampingCoefficient,
  naturalFrequency,
  type RLCParams,
} from './RLCModel';

/**
 * - undamped     : R = 0 (Δ = −ω₀²), oscilación LC ideal sin pérdidas.
 *                  Es el caso límite del subamortiguado.
 * - underdamped  : Δ < 0  ⇔ R < R_c
 * - critical     : Δ ≈ 0  ⇔ R ≈ R_c
 * - overdamped   : Δ > 0  ⇔ R > R_c
 */
export type DampingRegime = 'undamped' | 'underdamped' | 'critical' | 'overdamped';

export interface Complex {
  re: number;
  im: number;
}

export interface DampingAnalysis {
  regime: DampingRegime;
  /** α = R/(2L) [1/s] */
  alpha: number;
  /** ω₀ = 1/√(LC) [rad/s] */
  omega0: number;
  /** ω_d = √(ω₀² − α²) [rad/s]; 0 si no es oscilatorio */
  omegaD: number;
  /** Δ = α² − ω₀² [1/s²] */
  delta: number;
  /** R_c = 2√(L/C) [Ω] */
  Rc: number;
  /** Factor de amortiguamiento ζ = α/ω₀ = R/R_c (adimensional) */
  zeta: number;
  /** Factor de calidad Q = ω₀/(2α) (Infinity si R = 0) */
  qualityFactor: number;
  /** Raíces s₁, s₂ de la ecuación característica */
  roots: [Complex, Complex];
}

export function classifyDamping(p: RLCParams, relTol = CRITICAL_RELATIVE_TOLERANCE): DampingAnalysis {
  assertValidParams(p);
  const alpha = dampingCoefficient(p);
  const omega0 = naturalFrequency(p);
  const w0sq = omega0 * omega0;
  const delta = alpha * alpha - w0sq;
  const Rc = criticalResistance(p);
  const zeta = alpha / omega0;
  const qualityFactor = alpha === 0 ? Infinity : omega0 / (2 * alpha);

  let regime: DampingRegime;
  let omegaD = 0;
  let roots: [Complex, Complex];

  if (approxZero(delta, w0sq, relTol)) {
    regime = 'critical';
    roots = [
      { re: -alpha, im: 0 },
      { re: -alpha, im: 0 },
    ];
  } else if (delta < 0) {
    regime = p.R === 0 ? 'undamped' : 'underdamped';
    omegaD = Math.sqrt(-delta);
    roots = [
      { re: -alpha, im: omegaD },
      { re: -alpha, im: -omegaD },
    ];
  } else {
    regime = 'overdamped';
    const sq = Math.sqrt(delta);
    roots = [
      { re: -alpha + sq, im: 0 },
      { re: -alpha - sq, im: 0 },
    ];
  }

  return { regime, alpha, omega0, omegaD, delta, Rc, zeta, qualityFactor, roots };
}

export const REGIME_LABELS: Record<DampingRegime, string> = {
  undamped: 'Sin amortiguamiento (LC ideal)',
  underdamped: 'Subamortiguado',
  critical: 'Críticamente amortiguado',
  overdamped: 'Sobreamortiguado',
};
