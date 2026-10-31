/**
 * Modelo del circuito RLC en serie.
 *
 * Segunda ley de Kirchhoff (suma de caídas = voltaje aplicado):
 *     L di/dt + R i + q/C = E(t),   con i = dq/dt
 * ⇒   L q'' + R q' + q/C = E(t)
 *
 * Reducción a sistema de primer orden con x = [x₁, x₂] = [q, i]:
 *     x₁' = x₂
 *     x₂' = (E(t) − R x₂ − x₁/C) / L
 */
import { PARAM_LIMITS } from '../utils/Constants';
import { isFiniteNumber } from '../utils/MathUtils';
import { evaluateExcitation, type Excitation } from './Excitation';

export interface RLCParams {
  /** Resistencia [Ω], R ≥ 0 */
  R: number;
  /** Inductancia [H], L > 0 */
  L: number;
  /** Capacitancia [F], C > 0 */
  C: number;
}

export interface InitialConditions {
  /** q(0) [C] */
  q0: number;
  /** i(0) = q'(0) [A] */
  i0: number;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Valida parámetros físicos. Devuelve la lista de problemas (vacía si todo es válido).
 * Los límites de rango solo se comprueban si `checkRanges` es true; las condiciones
 * físicas (L > 0, C > 0, R ≥ 0, finitos) se comprueban siempre.
 */
export function validateParams(p: RLCParams, checkRanges = false): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const check = (field: 'R' | 'L' | 'C', value: number) => {
    if (!isFiniteNumber(value)) {
      issues.push({ field, message: `${field} debe ser un número finito (recibido ${value}).` });
      return;
    }
    if (field === 'R' && value < 0) issues.push({ field, message: 'R debe ser ≥ 0.' });
    if (field !== 'R' && value <= 0) issues.push({ field, message: `${field} debe ser > 0 (evita división por cero).` });
    if (checkRanges) {
      const lim = PARAM_LIMITS[field];
      if (value < lim.min || value > lim.max) {
        issues.push({ field, message: `${field} fuera de rango [${lim.min}, ${lim.max}].` });
      }
    }
  };
  check('R', p.R);
  check('L', p.L);
  check('C', p.C);
  return issues;
}

export function validateInitialConditions(ic: InitialConditions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isFiniteNumber(ic.q0)) issues.push({ field: 'q0', message: 'q₀ debe ser finito.' });
  if (!isFiniteNumber(ic.i0)) issues.push({ field: 'i0', message: 'i₀ debe ser finito.' });
  return issues;
}

export function assertValidParams(p: RLCParams): void {
  const issues = validateParams(p);
  if (issues.length > 0) {
    throw new RangeError(issues.map((i) => i.message).join(' '));
  }
}

/** α = R / (2L) — coeficiente de amortiguamiento [1/s] */
export function dampingCoefficient(p: RLCParams): number {
  return p.R / (2 * p.L);
}

/** ω₀ = 1 / √(LC) — frecuencia natural no amortiguada [rad/s] */
export function naturalFrequency(p: RLCParams): number {
  return 1 / Math.sqrt(p.L * p.C);
}

/** R_c = 2√(L/C) — resistencia crítica [Ω] */
export function criticalResistance(p: RLCParams): number {
  return 2 * Math.sqrt(p.L / p.C);
}

/**
 * Lado derecho del sistema de primer orden, sin asignar memoria:
 * escribe en `out` el vector x' = f(t, x).
 */
export type StateDerivative = (t: number, x: Float64Array, out: Float64Array) => void;

export function createRLCDerivative(p: RLCParams, exc: Excitation): StateDerivative {
  assertValidParams(p);
  const { R, L, C } = p;
  const invL = 1 / L;
  const invC = 1 / C;
  return (t, x, out) => {
    const q = x[0];
    const i = x[1];
    out[0] = i;
    out[1] = (evaluateExcitation(exc, t) - R * i - q * invC) * invL;
  };
}

/** Caídas de tensión instantáneas en cada elemento. */
export interface VoltageDrops {
  /** V_R = R i */
  VR: number;
  /** V_L = L di/dt */
  VL: number;
  /** V_C = q / C */
  VC: number;
}

/**
 * Calcula las caídas de tensión a partir de (t, q, i). di/dt se obtiene de la
 * propia ecuación diferencial, por lo que V_R + V_L + V_C = E(t) se cumple exactamente.
 */
export function voltageDrops(p: RLCParams, exc: Excitation, t: number, q: number, i: number): VoltageDrops {
  const VR = p.R * i;
  const VC = q / p.C;
  const VL = evaluateExcitation(exc, t) - VR - VC;
  return { VR, VL, VC };
}
