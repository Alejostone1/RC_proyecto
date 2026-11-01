/**
 * Interruptor de cuchilla 3D. La palanca gira alrededor de la bisagra (nodo swA)
 * con una animación suave hacia el ángulo objetivo (abierto ≈ 55°, cerrado = 0°).
 */
import * as THREE from 'three';
import { NODES, WIRE_Y } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree, materials } from '../scene/Materials';
import type { LabComponent, VisualFrame } from './types';

const OPEN_ANGLE = THREE.MathUtils.degToRad(55);

export class Switch implements LabComponent {
  readonly id = 'switch' as const;
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly anchor: THREE.Vector3;
  private readonly pivot = new THREE.Group();
  private readonly contactMat: THREE.MeshStandardMaterial;
  private angle = OPEN_ANGLE;
  private wasClosed = false;
  /** Destello breve al hacer contacto (retroalimentación visual, no un arco modelado). */
  private readonly flash = new THREE.PointLight(0xffd9a0, 0, 1.6, 2);

  constructor() {
    const m = materials();
    const a = NODES.swA;
    const b = NODES.swB;
    const len = a.distanceTo(b);
    this.anchor = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

    const base = new THREE.Mesh(new THREE.BoxGeometry(len + 0.35, 0.08, 0.42), m.blackPlastic);
    base.position.set(this.anchor.x, WIRE_Y - 0.2, a.z);
    this.group.add(base);
    this.pickables.push(base);

    for (const p of [a, b]) {
      const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.16), m.steel);
      postMesh.position.set(p.x, WIRE_Y - 0.06, p.z);
      this.group.add(postMesh);
      this.pickables.push(postMesh);
    }
    this.contactMat = new THREE.MeshStandardMaterial({ color: 0xaab4c3, metalness: 0.9, roughness: 0.3, emissive: 0x000000 });
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), this.contactMat);
    clip.position.set(b.x, WIRE_Y + 0.03, b.z);
    this.group.add(clip);

    // Palanca: pivota en a, apunta hacia +x
    this.pivot.position.copy(a);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.09), m.copper);
    blade.position.set(len / 2, 0.02, 0);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), m.redPlastic);
    handle.position.set(len + 0.1, 0.12, 0);
    handle.rotation.z = -0.3;
    this.pivot.add(blade, handle);
    this.pickables.push(blade, handle);
    this.group.add(this.pivot);

    this.flash.position.set(b.x, WIRE_Y + 0.15, b.z);
    this.group.add(this.flash);

    // Tramito de cable entre el poste y el nodo (estético)
    this.group.add(cylinderBetween(new THREE.Vector3(a.x - 0.05, WIRE_Y, a.z), a, 0.03, m.copper));
  }

  update(f: VisualFrame): void {
    const target = f.switchClosed ? 0 : OPEN_ANGLE;
    this.angle += (target - this.angle) * (1 - Math.exp(-f.dt * 12));
    this.pivot.rotation.z = this.angle;
    if (f.switchClosed && !this.wasClosed) this.flash.intensity = 6;
    this.wasClosed = f.switchClosed;
    this.flash.intensity *= Math.exp(-f.dt * 9);
    this.contactMat.emissive.setRGB(f.switchClosed ? 0.1 : 0, f.switchClosed ? 0.45 : 0, f.switchClosed ? 0.25 : 0);
  }

  dispose(): void {
    disposeTree(this.group, [this.contactMat]);
  }
}
