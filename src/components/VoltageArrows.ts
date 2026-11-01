/**
 * Flechas de caída de tensión sobre R, L y C. Cada flecha apunta del extremo de
 * mayor potencial al de menor potencial (sentido de la caída) y su longitud es
 * proporcional a |V| respecto de la escala de voltaje de la configuración.
 *   V_R = R·i     V_L = L·di/dt     V_C = q/C
 */
import * as THREE from 'three';
import { COIL, NODES, WIRE_Y } from '../scene/CircuitPath';
import type { SceneThemeDef } from '../scene/SceneTheme';
import type { VisualFrame } from './types';

interface Arrow {
  key: 'VR' | 'VL' | 'VC';
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  /** Sentido positivo de la corriente en ese tramo (unitario). */
  pathDir: THREE.Vector3;
  len: number;
}

const X = new THREE.Vector3(1, 0, 0);
const MAX_LEN = 1.25;

export class VoltageArrows {
  readonly group = new THREE.Group();
  private readonly arrows: Arrow[] = [];
  private readonly shaftGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 10);
  private readonly headGeo = new THREE.ConeGeometry(0.075, 0.18, 14);
  private readonly dir = new THREE.Vector3();
  private vScale = 1;

  constructor() {
    this.shaftGeo.rotateZ(-Math.PI / 2); // eje del cilindro a lo largo de +X
    this.shaftGeo.translate(0.5, 0, 0); // de 0 a 1 en X
    this.headGeo.rotateZ(-Math.PI / 2);
    const resMid = new THREE.Vector3().addVectors(NODES.resA, NODES.resB).multiplyScalar(0.5);
    this.add('VR', new THREE.Vector3(resMid.x, WIRE_Y + 0.62, resMid.z), new THREE.Vector3(1, 0, 0));
    this.add('VL', new THREE.Vector3(COIL.center.x - 0.95, WIRE_Y + 0.25, COIL.center.z), new THREE.Vector3(0, 0, 1));
    this.add('VC', new THREE.Vector3(0, WIRE_Y + 0.78, 1.8), new THREE.Vector3(-1, 0, 0));
  }

  private add(key: Arrow['key'], center: THREE.Vector3, pathDir: THREE.Vector3): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.4, emissive: 0x000000 });
    const group = new THREE.Group();
    group.position.copy(center);
    const shaft = new THREE.Mesh(this.shaftGeo, mat);
    const head = new THREE.Mesh(this.headGeo, mat);
    group.add(shaft, head);
    group.visible = false;
    this.group.add(group);
    this.arrows.push({ key, group, shaft, head, mat, pathDir, len: 0 });
  }

  applyTheme(t: SceneThemeDef): void {
    const c = { VR: t.arrowRColor, VL: t.arrowLColor, VC: t.arrowCColor };
    for (const a of this.arrows) {
      a.mat.color.setHex(c[a.key]);
      a.mat.emissive.setHex(c[a.key]).multiplyScalar(t.additive ? 0.35 : 0.05);
    }
  }

  onConfigure(f: VisualFrame): void {
    const E0 = f.excitation.kind === 'free' ? 0 : Math.abs(f.excitation.E0);
    this.vScale = Math.max(E0, f.scales.VC, f.scales.VL, f.params.R * f.scales.i, 1e-9);
  }

  update(f: VisualFrame): void {
    const s = f.state;
    for (const a of this.arrows) {
      const v = f.switchClosed || a.key === 'VC' ? s[a.key] : 0;
      const target = (MAX_LEN * Math.min(1, Math.abs(v) / this.vScale)) * (v >= 0 ? 1 : -1);
      a.len += (target - a.len) * (1 - Math.exp(-f.dt * 14));
      const L = Math.abs(a.len);
      a.group.visible = L > 0.04;
      if (!a.group.visible) continue;
      // Caída positiva ⇒ el potencial baja en el sentido positivo de la corriente
      this.dir.copy(a.pathDir).multiplyScalar(Math.sign(a.len));
      a.group.quaternion.setFromUnitVectors(X, this.dir);
      const shaftLen = Math.max(0.01, L - 0.16);
      a.shaft.scale.set(shaftLen, 1, 1);
      a.shaft.position.set(-L / 2, 0, 0);
      a.head.position.set(-L / 2 + shaftLen + 0.08, 0, 0);
    }
  }

  dispose(): void {
    this.shaftGeo.dispose();
    this.headGeo.dispose();
    for (const a of this.arrows) a.mat.dispose();
  }
}
