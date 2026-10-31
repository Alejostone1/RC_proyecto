/**
 * Presets del laboratorio. Todos usan L = 0.5 H y C = 0.02 F
 * (ω₀ = 10 rad/s, R_c = 2√(L/C) = 10 Ω) para que los regímenes sean comparables.
 */
import type { Excitation } from '../physics/Excitation';
import type { InitialConditions, RLCParams } from '../physics/RLCModel';

export interface LabConfig {
  params: RLCParams;
  excitation: Excitation;
  initial: InitialConditions;
}

export type PresetId = 'underdamped' | 'critical' | 'overdamped' | 'resonance';

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  build(): LabConfig;
}

const L = 0.5;
const C = 0.02;
const RC = 2 * Math.sqrt(L / C);
const W0 = 1 / Math.sqrt(L * C);

export const PRESETS: Record<PresetId, Preset> = {
  underdamped: {
    id: 'underdamped',
    label: 'Subamortiguado',
    description: `R = 2 Ω < R_c = ${RC.toFixed(1)} Ω. Escalón de 10 V: la carga oscila alrededor de C·E₀ y se amortigua.`,
    build: () => ({ params: { R: 2, L, C }, excitation: { kind: 'step', E0: 10, omega: W0 }, initial: { q0: 0, i0: 0 } }),
  },
  critical: {
    id: 'critical',
    label: 'Crítico',
    description: `R = R_c = 2√(L/C) = ${RC.toFixed(1)} Ω. Llega al equilibrio lo más rápido posible sin oscilar.`,
    build: () => ({ params: { R: RC, L, C }, excitation: { kind: 'step', E0: 10, omega: W0 }, initial: { q0: 0, i0: 0 } }),
  },
  overdamped: {
    id: 'overdamped',
    label: 'Sobreamortiguado',
    description: `R = 30 Ω > R_c. Dos exponenciales reales: aproximación lenta y sin oscilación.`,
    build: () => ({ params: { R: 30, L, C }, excitation: { kind: 'step', E0: 10, omega: W0 }, initial: { q0: 0, i0: 0 } }),
  },
  resonance: {
    id: 'resonance',
    label: 'Resonancia',
    description: `Fuente senoidal con ω = ω₀ = ${W0.toFixed(1)} rad/s y R = 1 Ω: la corriente permanente alcanza E₀/R = 10 A.`,
    build: () => ({ params: { R: 1, L, C }, excitation: { kind: 'sine', E0: 10, omega: W0 }, initial: { q0: 0, i0: 0 } }),
  },
};

export const DEFAULT_PRESET: PresetId = 'underdamped';
