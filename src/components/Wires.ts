/** Conductores de cobre entre componentes, con un leve brillo ∝ |i|. */
import * as THREE from 'three';
import { WIRE_SEGMENTS } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree } from '../scene/Materials';
import { norm, type VisualFrame } from './types';

export class Wires {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 1, roughness: 0.32, emissive: 0xff9a3c, emissiveIntensity: 0 });

  constructor() {
    const joint = new THREE.SphereGeometry(0.03, 12, 8);
    for (const [a, b] of WIRE_SEGMENTS) {
      this.group.add(cylinderBetween(a, b, 0.028, this.mat));
      const j = new THREE.Mesh(joint, this.mat);
      j.position.copy(b);
      this.group.add(j);
    }
  }

  update(f: VisualFrame): void {
    this.mat.emissiveIntensity = 0.12 * norm(f.state.i, f.scales.i);
  }

  dispose(): void {
    disposeTree(this.group, [this.mat]);
  }
}
