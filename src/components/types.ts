/**
 * Datos que la visualización recibe en cada frame. Es de solo lectura: los
 * componentes 3D nunca modifican el estado matemático (SIMULACIÓN → ESTADO → VISUALIZACIÓN).
 */
import type * as THREE from 'three';
import type { Excitation } from '../physics/Excitation';
import type { RLCParams } from '../physics/RLCModel';
import type { PhysicalScales } from '../physics/Scales';
import type { SimulationState } from '../simulation/SimulationState';
import type { SceneThemeDef } from '../scene/SceneTheme';

export interface VisualFrame {
  state: Readonly<SimulationState>;
  scales: Readonly<PhysicalScales>;
  params: Readonly<RLCParams>;
  excitation: Readonly<Excitation>;
  switchClosed: boolean;
  /** Tiempo real del frame [s] (solo para animaciones cosméticas). */
  dt: number;
  /** Tiempo simulado avanzado en este frame [s]. */
  simDt: number;
  /** Tiempo real acumulado [s]. */
  time: number;
}

export type ComponentId = 'source' | 'switch' | 'resistor' | 'inductor' | 'capacitor';

export interface LabComponent {
  readonly id: ComponentId;
  readonly group: THREE.Group;
  /** Mallas sobre las que funciona el raycasting. */
  readonly pickables: THREE.Object3D[];
  /** Punto de enfoque para cámara/etiquetas. */
  readonly anchor: THREE.Vector3;
  onConfigure?(frame: VisualFrame): void;
  applyTheme?(theme: SceneThemeDef): void;
  update(frame: VisualFrame): void;
  dispose(): void;
}

/** Normaliza una magnitud con su escala física y la limita a [0, 1]. */
export function norm(value: number, scale: number): number {
  return Math.min(1, Math.abs(value) / (scale > 0 ? scale : 1));
}
