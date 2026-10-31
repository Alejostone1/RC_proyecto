/**
 * Solución analítica exacta de  L q'' + R q' + q/C = E(t),  q(0) = q₀, q'(0) = i₀.
 *
 * Estructura (principio de superposición):
 *     q(t) = q_h(t) + q_p(t)
 *   - q_p : solución particular (respuesta FORZADA / permanente)
 *   - q_h : solución de la homogénea (respuesta NATURAL / transitoria cuando R > 0)
 * Las constantes de q_h se ajustan a las condiciones iniciales DEL TOTAL:
 *     q_h(0) = q₀ − q_p(0),   q_h'(0) = i₀ − q_p'(0)
 *
 * Soluciones particulares implementadas (todas exactas, sin fórmulas aproximadas):
 *   - free : q_p = 0
 *   - step : q_p = C·E₀               (constante; q_p' = 0)
 *   - sine : q_p = E₀ (K sin ωt − Rω cos ωt) / D,
 *            K = 1/C − Lω²,  D = K² + (Rω)²
 *            Caso D = 0 (R = 0 y ω = ω₀, resonancia pura):
 *            q_p = −E₀/(2Lω₀) · t·cos(ω₀t)   (amplitud que crece linealmente)
 *
 * Soluciones homogéneas con Q = q_h(0), I = q_h'(0):
 *   - Subamortiguado (Δ<0): e^{−αt}[A cos ω_d t + B sin ω_d t], A = Q, B = (I + αQ)/ω_d
 *   - Crítico (Δ≈0):        (A + Bt) e^{−αt},                    A = Q, B = I + αQ
 *   - Sobreamortiguado:     A e^{s₁t} + B e^{s₂t},
 *                           A = (I − s₂Q)/(s₁ − s₂),  B = (s₁Q − I)/(s₁ − s₂)
 */
import { RESONANCE_RELATIVE_TOLERANCE } from '../utils/Constants';
import { approxZero } from '../utils/MathUtils';
import { classifyDamping, type DampingAnalysis, type DampingRegime } from './DampingClassifier';
import type { Excitation } from './Excitation';
import { assertValidParams, type InitialConditions, type RLCParams } from './RLCModel';

export interface ChargeCurrent {
  q: number;
  i: number;
}

export interface NaturalResponse {
  regime: DampingRegime;
  /** Constantes A, B según la forma del régimen (ver cabecera). */
  A: number;
  B: number;
  /** Expresión legible de q_h(t) con las constantes sustituidas. */
  formula: string;
  evaluate(t: number, out: ChargeCurrent): ChargeCurrent;
}

export interface ForcedResponse {
  kind: 'none' | 'constant' | 'sinusoidal' | 'pure-resonance';
  formula: string;
  /** Amplitud de la carga en régimen permanente (∞-creciente en resonancia pura → NaN). */
  chargeAmplitude: number;
  /** Amplitud de la corriente en régimen permanente. */
  currentAmplitude: number;
  evaluate(t: number, out: ChargeCurrent): ChargeCurrent;
}

export interface AnalyticalSolution {
  analysis: DampingAnalysis;
  natural: NaturalResponse;
  forced: ForcedResponse;
  /** q(t), i(t) totales. */
  evaluate(t: number, out?: ChargeCurrent): ChargeCurrent;
}

const fmt = (x: number) => (Math.abs(x) < 1e-12 ? '0' : x.toPrecision(5));
/** Término con signo explícito: " + 0.5" o " − 0.5". */
const sgn = (x: number) => (x < 0 ? ` − ${fmt(-x)}` : ` + ${fmt(x)}`);

/** Respuesta natural ajustada a q_h(0) = Q, q_h'(0) = I. */
export function naturalResponse(a: DampingAnalysis, Q: number, I: number): NaturalResponse {
  const { alpha } = a;
  switch (a.regime) {
    case 'undamped':
    case 'underdamped': {
      const wd = a.omegaD;
      const A = Q;
      const B = (I + alpha * Q) / wd;
      return {
        regime: a.regime,
        A,
        B,
        formula: `q_h(t) = ${alpha === 0 ? '' : `e^(−${fmt(alpha)}t)·`}[${fmt(A)}·cos(${fmt(wd)}t)${sgn(B)}·sin(${fmt(wd)}t)]`,
        evaluate(t, out) {
          const e = Math.exp(-alpha * t);
          const c = Math.cos(wd * t);
          const s = Math.sin(wd * t);
          out.q = e * (A * c + B * s);
          out.i = e * ((wd * B - alpha * A) * c - (wd * A + alpha * B) * s);
          return out;
        },
      };
    }
    case 'critical': {
      const A = Q;
      const B = I + alpha * Q;
      return {
        regime: 'critical',
        A,
        B,
        formula: `q_h(t) = (${fmt(A)}${sgn(B)}·t)·e^(−${fmt(alpha)}t)`,
        evaluate(t, out) {
          const e = Math.exp(-alpha * t);
          out.q = (A + B * t) * e;
          out.i = (B - alpha * (A + B * t)) * e;
          return out;
        },
      };
    }
    case 'overdamped': {
      const s1 = a.roots[0].re;
      const s2 = a.roots[1].re;
      const A = (I - s2 * Q) / (s1 - s2);
      const B = (s1 * Q - I) / (s1 - s2);
      return {
        regime: 'overdamped',
        A,
        B,
        formula: `q_h(t) = ${fmt(A)}·e^(${fmt(s1)}t)${sgn(B)}·e^(${fmt(s2)}t)`,
        evaluate(t, out) {
          const e1 = Math.exp(s1 * t);
          const e2 = Math.exp(s2 * t);
          out.q = A * e1 + B * e2;
          out.i = A * s1 * e1 + B * s2 * e2;
          return out;
        },
      };
    }
  }
}

/** Solución particular (respuesta forzada) para la excitación dada. */
export function forcedResponse(p: RLCParams, exc: Excitation): ForcedResponse {
  const { R, L, C } = p;
  if (exc.kind === 'free' || exc.E0 === 0 || (exc.kind === 'sine' && exc.omega === 0)) {
    return {
      kind: 'none',
      formula: 'q_p(t) = 0',
      chargeAmplitude: 0,
      currentAmplitude: 0,
      evaluate(_t, out) {
        out.q = 0;
        out.i = 0;
        return out;
      },
    };
  }
  if (exc.kind === 'step') {
    const qss = C * exc.E0;
    return {
      kind: 'constant',
      formula: `q_p(t) = C·E₀ = ${fmt(qss)} C`,
      chargeAmplitude: Math.abs(qss),
      currentAmplitude: 0,
      evaluate(_t, out) {
        out.q = qss;
        out.i = 0;
        return out;
      },
    };
  }

  // Senoidal: E₀ sin ωt
  const { E0, omega: w } = exc;
  const invC = 1 / C;
  const K = invC - L * w * w;
  const Rw = R * w;
  const D = K * K + Rw * Rw;

  if (approxZero(R, Math.sqrt(L / C), RESONANCE_RELATIVE_TOLERANCE) && approxZero(K, invC, RESONANCE_RELATIVE_TOLERANCE)) {
    // Resonancia pura sin pérdidas: el término forzante coincide con la solución homogénea.
    const c = -E0 / (2 * L * w);
    return {
      kind: 'pure-resonance',
      formula: `q_p(t) = −E₀/(2Lω₀)·t·cos(ω₀t) = ${fmt(c)}·t·cos(${fmt(w)}t)`,
      chargeAmplitude: NaN,
      currentAmplitude: NaN,
      evaluate(t, out) {
        const cs = Math.cos(w * t);
        out.q = c * t * cs;
        out.i = c * (cs - w * t * Math.sin(w * t));
        return out;
      },
    };
  }

  const a = (E0 * K) / D; // coeficiente de sin
  const b = (-E0 * Rw) / D; // coeficiente de cos
  const amp = Math.abs(E0) / Math.sqrt(D);
  return {
    kind: 'sinusoidal',
    formula: `q_p(t) = ${fmt(a)}·sin(${fmt(w)}t)${sgn(b)}·cos(${fmt(w)}t)`,
    chargeAmplitude: amp,
    currentAmplitude: amp * w,
    evaluate(t, out) {
      const s = Math.sin(w * t);
      const cs = Math.cos(w * t);
      out.q = a * s + b * cs;
      out.i = w * (a * cs - b * s);
      return out;
    },
  };
}

export function solveAnalytically(p: RLCParams, exc: Excitation, ic: InitialConditions): AnalyticalSolution {
  assertValidParams(p);
  const analysis = classifyDamping(p);
  const forced = forcedResponse(p, exc);
  const fp0 = forced.evaluate(0, { q: 0, i: 0 });
  const natural = naturalResponse(analysis, ic.q0 - fp0.q, ic.i0 - fp0.i);
  const tmpN: ChargeCurrent = { q: 0, i: 0 };
  const tmpF: ChargeCurrent = { q: 0, i: 0 };
  return {
    analysis,
    natural,
    forced,
    evaluate(t, out = { q: 0, i: 0 }) {
      natural.evaluate(t, tmpN);
      forced.evaluate(t, tmpF);
      out.q = tmpN.q + tmpF.q;
      out.i = tmpN.i + tmpF.i;
      return out;
    },
  };
}

/**
 * Amplitudes en régimen permanente senoidal (útil para la curva de resonancia):
 *   |q| = E₀ / √((1/C − Lω²)² + (Rω)²),     |i| = ω·|q| = E₀ / √(R² + (ωL − 1/(ωC))²)
 * |i| es máxima exactamente en ω = ω₀ (vale E₀/R). |q| (y V_C) es máxima en
 * ω_r = √(ω₀² − 2α²) si ω₀² > 2α²; si no, en ω = 0.
 */
export function steadyStateAmplitudes(p: RLCParams, E0: number, omega: number): { charge: number; current: number } {
  const K = 1 / p.C - p.L * omega * omega;
  const D = K * K + (p.R * omega) ** 2;
  const charge = Math.abs(E0) / Math.sqrt(D);
  return { charge, current: charge * omega };
}

/** Frecuencia de máxima amplitud de CARGA (≠ ω₀ cuando R > 0). */
export function chargeResonanceFrequency(p: RLCParams): number {
  const a = p.R / (2 * p.L);
  const w0sq = 1 / (p.L * p.C);
  const v = w0sq - 2 * a * a;
  return v > 0 ? Math.sqrt(v) : 0;
}
