/**
 * Análisis de resonancia para E(t) = E₀ sin(ωt).
 *
 * Amplitud de corriente en régimen permanente:
 *     |I(ω)| = E₀ / √(R² + (ωL − 1/(ωC))²)
 * máxima en ω = ω₀ con valor E₀/R. El ancho de banda de media potencia es
 * Δω = R/L = 2α, así que "cerca de resonancia" ⇔ |ω − ω₀| ≤ α.
 * Con R = 0 no hay régimen permanente en ω₀: la amplitud crece linealmente.
 */
import type { RLCParams } from './RLCModel';

export interface ResonanceInfo {
  omega: number;
  omega0: number;
  detuning: number;
  /** Semiancho de banda α = R/(2L) (con piso para R = 0). */
  halfBandwidth: number;
  near: boolean;
  /** Amplitud permanente de corriente (Infinity si R = 0 y ω = ω₀). */
  currentAmplitude: number;
  /** E₀/R: máximo teórico de |I| (Infinity si R = 0). */
  peakCurrent: number;
}

export function currentAmplitude(p: RLCParams, E0: number, omega: number): number {
  if (omega <= 0) return 0;
  const X = omega * p.L - 1 / (omega * p.C);
  const Z = Math.sqrt(p.R * p.R + X * X);
  return Z === 0 ? Infinity : Math.abs(E0) / Z;
}

export function analyzeResonance(p: RLCParams, E0: number, omega: number): ResonanceInfo {
  const omega0 = 1 / Math.sqrt(p.L * p.C);
  const alpha = p.R / (2 * p.L);
  const halfBandwidth = Math.max(alpha, 0.02 * omega0);
  const detuning = Math.abs(omega - omega0);
  return {
    omega,
    omega0,
    detuning,
    halfBandwidth,
    near: detuning <= halfBandwidth,
    currentAmplitude: currentAmplitude(p, E0, omega),
    peakCurrent: p.R > 0 ? Math.abs(E0) / p.R : Infinity,
  };
}
