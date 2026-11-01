/**
 * Inductor 3D: bobina helicoidal de cobre sobre núcleo de ferrita.
 *
 * Representación CONCEPTUAL del campo magnético:
 *  - Líneas de campo cerradas (por dentro del núcleo y por fuera) cuya opacidad
 *    es ∝ |i| (B ∝ i en un solenoide).
 *  - Marcadores que recorren las líneas en el sentido dado por el signo de i
 *    (regla de la mano derecha) con velocidad ∝ |i|.
 *  - Brillo de la bobina ∝ |V_L| = |L di/dt| (fem inducida).
 */
import * as THREE from 'three';
import { COIL, NODES, coilPoints } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree, materials } from '../scene/Materials';
import { blendingFor, type SceneThemeDef } from '../scene/SceneTheme';
import { norm, type LabComponent, type VisualFrame } from './types';

const FIELD_LINES = 8;
const MARKERS_PER_LINE = 6;

export class Inductor implements LabComponent {
  readonly id = 'inductor' as const;
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly anchor = COIL.center.clone();
  private readonly coilMat: THREE.MeshStandardMaterial;
  private readonly fieldMat: THREE.LineBasicMaterial;
  private readonly markerMat: THREE.MeshBasicMaterial;
  private readonly markers: THREE.InstancedMesh;
  private readonly curves: THREE.EllipseCurve[] = [];
  private readonly angles: number[] = [];
  private phase = 0;
  /** Ganancia del brillo de la bobina (menor en tema claro: sin efecto neón). */
  private coilGain = 1.6;
  private readonly m4 = new THREE.Matrix4();
  private readonly v2 = new THREE.Vector2();
  private readonly v3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor() {
    const m = materials();
    const helix = coilPoints(32);
    const curve = new THREE.CatmullRomCurve3(helix);
    this.coilMat = new THREE.MeshStandardMaterial({ color: 0xd2884f, metalness: 1, roughness: 0.3, emissive: 0x7a3cff, emissiveIntensity: 0 });
    const coil = new THREE.Mesh(new THREE.TubeGeometry(curve, COIL.turns * 40, 0.034, 8, false), this.coilMat);
    this.group.add(coil);
    this.pickables.push(coil);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, COIL.halfLength * 2 + 0.3, 32), m.ferrite);
    core.rotation.x = Math.PI / 2;
    core.position.copy(COIL.center);
    this.group.add(core);
    this.pickables.push(core);
    for (const sgn of [-1, 1]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 40), m.darkMetal);
      flange.rotation.x = Math.PI / 2;
      flange.position.copy(COIL.center).add(new THREE.Vector3(0, 0, sgn * (COIL.halfLength + 0.08)));
      this.group.add(flange);
      this.pickables.push(flange);
    }

    // Terminales: del nodo del circuito al extremo de la hélice
    this.group.add(cylinderBetween(NODES.indA, helix[0], 0.03, m.copper));
    this.group.add(cylinderBetween(helix[helix.length - 1], NODES.indB, 0.03, m.copper));

    // Líneas de campo: elipses en planos que contienen el eje Z, rotadas alrededor de él
    this.fieldMat = new THREE.LineBasicMaterial({ color: 0xa98bff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const fieldGroup = new THREE.Group();
    fieldGroup.position.copy(COIL.center);
    for (let k = 0; k < FIELD_LINES; k++) {
      const ang = (k / FIELD_LINES) * Math.PI * 2;
      const rx = 0.55 + 0.1 * (k % 2);
      // elipse en el plano (radial, z): pasa por dentro del núcleo y vuelve por fuera
      const ell = new THREE.EllipseCurve(rx, 0, rx, 1.35 + 0.15 * (k % 2), 0, Math.PI * 2, false, 0);
      this.curves.push(ell);
      this.angles.push(ang);
      const pts = ell.getPoints(80).map((p) => new THREE.Vector3(p.x * Math.cos(ang), p.x * Math.sin(ang), p.y));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.fieldMat);
      fieldGroup.add(line);
    }
    this.group.add(fieldGroup);

    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xcdb8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.markers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.03, 0.09, 8), this.markerMat, FIELD_LINES * MARKERS_PER_LINE);
    this.markers.position.copy(COIL.center);
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  applyTheme(t: SceneThemeDef): void {
    this.fieldMat.color.setHex(t.magneticColor);
    this.coilMat.emissive.setHex(t.additive ? 0x7a3cff : t.magneticColor);
    this.coilGain = t.additive ? 1.6 : 0.45;
    this.markerMat.color.setHex(t.magneticMarkerColor);
    const b = blendingFor(t);
    if (this.fieldMat.blending !== b) {
      this.fieldMat.blending = this.markerMat.blending = b;
      this.fieldMat.needsUpdate = this.markerMat.needsUpdate = true;
    }
  }

  update(f: VisualFrame): void {
    const iN = norm(f.state.i, f.scales.i);
    const vN = norm(f.state.VL, f.scales.VL);
    // La fem inducida solo existe con el circuito cerrado
    this.coilMat.emissiveIntensity = f.switchClosed ? this.coilGain * vN : 0;
    this.fieldMat.opacity = 0.08 + 0.75 * iN;
    this.markerMat.opacity = Math.min(1, 1.2 * iN);
    // Sentido de B según el signo de i; velocidad de los marcadores ∝ |i|
    this.phase += Math.sign(f.state.i) * f.dt * (0.05 + 0.35 * iN);
    let k = 0;
    for (let l = 0; l < FIELD_LINES; l++) {
      const ell = this.curves[l];
      const ang = this.angles[l];
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      for (let j = 0; j < MARKERS_PER_LINE; j++) {
        const u = (((j / MARKERS_PER_LINE + this.phase) % 1) + 1) % 1;
        ell.getPoint(u, this.v2);
        const x = this.v2.x;
        this.v3.set(x * c, x * sn, this.v2.y);
        ell.getTangent(u, this.v2);
        const dir = this.dir.set(this.v2.x * c, this.v2.x * sn, this.v2.y).normalize();
        if (f.state.i < 0) dir.negate();
        this.q.setFromUnitVectors(Inductor.UP, dir);
        const sc = 0.6 + 0.8 * iN;
        this.s.set(sc, sc, sc);
        this.m4.compose(this.v3, this.q, this.s);
        this.markers.setMatrixAt(k++, this.m4);
      }
    }
    this.markers.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    disposeTree(this.group, [this.coilMat, this.fieldMat, this.markerMat]);
  }
}
