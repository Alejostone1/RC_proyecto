/**
 * Instantánea del estado de la simulación. Es la única fuente de verdad que lee la
 * capa de visualización (SIMULACIÓN → ESTADO → VISUALIZACIÓN).
 */
import type { DampingRegime } from '../physics/DampingClassifier';

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'error';

export interface SimulationState {
  status: SimulationStatus;
  /** Tiempo simulado [s] */
  t: number;
  /** q(t) [C] */
  q: number;
  /** i(t) [A] */
  i: number;
  /** di/dt [A/s] */
  didt: number;
  /** E(t) [V] */
  E: number;
  VR: number;
  VL: number;
  VC: number;
  EC: number;
  EL: number;
  PR: number;
  regime: DampingRegime;
  /** Mensaje de error si status === 'error' */
  error: string | null;
}

export function createInitialState(regime: DampingRegime): SimulationState {
  return {
    status: 'idle',
    t: 0,
    q: 0,
    i: 0,
    didt: 0,
    E: 0,
    VR: 0,
    VL: 0,
    VC: 0,
    EC: 0,
    EL: 0,
    PR: 0,
    regime,
    error: null,
  };
}
