/**
 * Conductores de cobre. Opcionalmente se colorean según su POTENCIAL ELÉCTRICO
 * (tonos cálidos = potencial positivo, fríos = negativo, cobre = 0 V). Así la
 * ley de Kirchhoff se ve directamente: cada componente produce un "salto" de
 * color igual a su caída de tensión.
 */
import * as THREE from 'three';
import { nodePotentials, type NodePotentials } from '../physics/NodePotentials';
import { WIRE_SEGMENTS } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree } from '../scene/Materials';
import type { SceneThemeDef } from '../scene/SceneTheme';
import { norm, type VisualFrame } from './types';

/** Red (nodo) a la que pertenece cada tramo de WIRE_SEGMENTS, en orden. */
const SEGMENT_NET: Array<keyof NodePotentials> = ['A', 'A', 'B', 'C', 'C', 'D', 'D', 'G', 'G'];
const NETS: Array<keyof NodePotentials> = ['A', 'B', 'C', 'D', 'G'];
const COPPER = new THREE.Color(0xc8794a);

export class Wires {
  readonly group = new THREE.Group();
  /** Colorear por potencial (si es false, cobre con brillo ∝ |i|). */
  showPotential = true;
  private readonly mats = new Map<keyof NodePotentials, THREE.MeshStandardMaterial>();
  private readonly pot: NodePotentials = { A: 0, B: 0, C: 0, D: 0, G: 0 };
  private readonly pos = new THREE.Color(0xff7a59);
  private readonly neg = new THREE.Color(0x5aa9ff);
  private vScale = 1;
  private emissiveGain = 0.35;

  constructor() {
    for (const n of NETS) {
      this.mats.set(n, new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 0.85, roughness: 0.35, emissive: 0x000000 }));
    }
    const joint = new THREE.SphereGeometry(0.03, 12, 8);
    WIRE_SEGMENTS.forEach(([a, b], k) => {
      const mat = this.mats.get(SEGMENT_NET[k])!;
      this.group.add(cylinderBetween(a, b, 0.03, mat));
      const j = new THREE.Mesh(joint, mat);
      j.position.copy(b);
      this.group.add(j);
    });
  }

  applyTheme(t: SceneThemeDef): void {
    this.pos.setHex(t.potentialPosColor);
    this.neg.setHex(t.potentialNegColor);
    this.emissiveGain = t.additive ? 0.35 : 0.12;
  }

  onConfigure(f: VisualFrame): void {
    const E0 = f.excitation.kind === 'free' ? 0 : Math.abs(f.excitation.E0);
    this.vScale = Math.max(E0, f.scales.VC, f.scales.VL, f.params.R * f.scales.i, 1e-9);
  }

  /** Potenciales actuales (también los usa la leyenda del HUD). */
  get potentials(): Readonly<NodePotentials> {
    return this.pot;
  }

  get scale(): number {
    return this.vScale;
  }

  update(f: VisualFrame): void {
    const s = f.state;
    nodePotentials(s.E, s.VR, s.VL, s.VC, f.switchClosed, this.pot);
    const iGlow = 0.12 * norm(s.i, f.scales.i);
    for (const n of NETS) {
      const m = this.mats.get(n)!;
      if (!this.showPotential) {
        m.color.copy(COPPER);
        m.emissive.setRGB(1, 0.6, 0.24).multiplyScalar(iGlow);
        continue;
      }
      const v = this.pot[n];
      const u = Math.min(1, Math.abs(v) / this.vScale);
      const target = v >= 0 ? this.pos : this.neg;
      m.color.copy(COPPER).lerp(target, Math.sqrt(u));
      m.emissive.copy(target).multiplyScalar(this.emissiveGain * u);
    }
  }

  dispose(): void {
    disposeTree(this.group, [...this.mats.values()]);
  }
}
