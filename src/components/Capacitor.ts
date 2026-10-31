/**
 * Capacitor de placas paralelas. Placa A (+x) recibe la corriente positiva, por
 * lo que su carga es +q y la de la placa B es −q.
 *  - Puntos de carga en cada placa: cantidad ∝ |q| / q_máx; color rojo (+) / azul (−),
 *    que se intercambian cuando q cambia de signo.
 *  - Líneas de campo eléctrico entre placas: opacidad ∝ |V_C|; flechas de + a −.
 *  - Por el dieléctrico NO pasan partículas: no hay conducción a través de él.
 */
import * as THREE from 'three';
import { CAP, NODES, WIRE_Y } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree, materials } from '../scene/Materials';
import { norm, type LabComponent, type VisualFrame } from './types';

const PLATE = 0.95;
const GRID = 8;
const POS = new THREE.Color(0xff4d5e);
const NEG = new THREE.Color(0x3d8bff);

export class Capacitor implements LabComponent {
  readonly id = 'capacitor' as const;
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly anchor = new THREE.Vector3(0, WIRE_Y, CAP.z);
  private readonly plateMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly charges: THREE.InstancedMesh[];
  private readonly chargeMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly fieldMat: THREE.MeshBasicMaterial;
  private readonly fieldGroup = new THREE.Group();

  constructor() {
    const m = materials();
    const plateGeo = new THREE.BoxGeometry(0.035, PLATE, PLATE);
    const mk = () => new THREE.MeshStandardMaterial({ color: 0xc6ced9, metalness: 0.95, roughness: 0.25, emissive: 0x000000 });
    this.plateMats = [mk(), mk()];
    const xs = [CAP.plateA_x, CAP.plateB_x];
    xs.forEach((x, k) => {
      const plate = new THREE.Mesh(plateGeo, this.plateMats[k]);
      plate.position.set(x, WIRE_Y, CAP.z);
      this.group.add(plate);
      this.pickables.push(plate);
    });

    const diel = new THREE.Mesh(
      new THREE.BoxGeometry(CAP.gap - 0.05, PLATE * 0.92, PLATE * 0.92),
      new THREE.MeshPhysicalMaterial({ color: 0x5fb3ff, transmission: 0.6, roughness: 0.15, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    diel.position.set(0, WIRE_Y, CAP.z);
    this.group.add(diel);
    this.pickables.push(diel);

    this.group.add(cylinderBetween(NODES.capA, new THREE.Vector3(CAP.plateA_x, WIRE_Y, CAP.z), 0.028, m.copper));
    this.group.add(cylinderBetween(new THREE.Vector3(CAP.plateB_x, WIRE_Y, CAP.z), NODES.capB, 0.028, m.copper));

    // Cargas: rejilla GRID×GRID en la cara interior de cada placa
    const dotGeo = new THREE.SphereGeometry(0.022, 8, 6);
    this.chargeMats = [
      new THREE.MeshBasicMaterial({ color: POS, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: NEG, toneMapped: false }),
    ];
    const mtx = new THREE.Matrix4();
    const N = GRID * GRID;
    this.charges = xs.map((x, k) => {
      const inst = new THREE.InstancedMesh(dotGeo, this.chargeMats[k], N);
      const face = x + (k === 0 ? -0.03 : 0.03);
      for (let n = 0; n < N; n++) {
        // Orden de aparición fijo y disperso (37 es coprimo con 64): al crecer |q|
        // la placa se llena de forma uniforme y no por filas.
        const cell = (n * 37) % N;
        const a = Math.floor(cell / GRID);
        const b = cell % GRID;
        const y = WIRE_Y + ((a + 0.5) / GRID - 0.5) * PLATE * 0.85;
        const z = CAP.z + ((b + 0.5) / GRID - 0.5) * PLATE * 0.85;
        mtx.makeTranslation(face, y, z);
        inst.setMatrixAt(n, mtx);
      }
      inst.count = 0;
      this.group.add(inst);
      return inst;
    });

    // Campo eléctrico entre placas
    this.fieldMat = new THREE.MeshBasicMaterial({ color: 0x8ff0c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const lineGeo = new THREE.CylinderGeometry(0.004, 0.004, CAP.gap - 0.04, 4);
    const arrowGeo = new THREE.ConeGeometry(0.018, 0.045, 6);
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const y = WIRE_Y + (a - 1) * 0.28;
        const z = CAP.z + (b - 1) * 0.28;
        const line = new THREE.Mesh(lineGeo, this.fieldMat);
        line.rotation.z = Math.PI / 2;
        line.position.set(0, y, z);
        const arrow = new THREE.Mesh(arrowGeo, this.fieldMat);
        arrow.rotation.z = Math.PI / 2; // apunta a −x (de A a B)
        arrow.position.set(-0.02, y, z);
        this.fieldGroup.add(line, arrow);
      }
    }
    this.group.add(this.fieldGroup);
  }

  update(f: VisualFrame): void {
    const q = f.state.q;
    const qN = norm(q, f.scales.q);
    const count = Math.round(qN * GRID * GRID);
    this.charges[0].count = count;
    this.charges[1].count = count;
    const aPositive = q >= 0;
    this.chargeMats[0].color.copy(aPositive ? POS : NEG);
    this.chargeMats[1].color.copy(aPositive ? NEG : POS);
    this.plateMats[0].emissive.copy(aPositive ? POS : NEG).multiplyScalar(0.55 * qN);
    this.plateMats[1].emissive.copy(aPositive ? NEG : POS).multiplyScalar(0.55 * qN);

    this.fieldMat.opacity = 0.9 * norm(f.state.VC, f.scales.VC);
    // El campo apunta de la placa positiva a la negativa: se invierte con el signo de q
    this.fieldGroup.scale.x = aPositive ? 1 : -1;
  }

  dispose(): void {
    disposeTree(this.group, [...this.plateMats, ...this.chargeMats, this.fieldMat]);
  }
}
