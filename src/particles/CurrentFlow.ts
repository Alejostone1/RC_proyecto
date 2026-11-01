/**
 * Representación CONCEPTUAL de la corriente: partículas (InstancedMesh) que
 * recorren el lazo del circuito. No es una simulación de electrones.
 *
 *   - velocidad de avance  ∝ i(t) / i_máx   (con signo: i > 0 sentido positivo, i < 0 inverso)
 *   - tamaño/brillo        ∝ |i(t)| / i_máx
 *   - i ≈ 0                → las partículas se frenan progresivamente
 *   - dieléctrico          → las partículas se ocultan entre las placas (no hay conducción)
 *
 * Se usa la corriente convencional (sentido de la carga positiva).
 */
import * as THREE from 'three';
import { norm, type VisualFrame } from '../components/types';
import type { CircuitPath } from '../scene/CircuitPath';
import type { SceneThemeDef } from '../scene/SceneTheme';

const MAX_SPEED = 2.6; // unidades de escena por segundo real cuando |i| = i_máx

export class CurrentFlow {
  readonly mesh: THREE.InstancedMesh;
  private readonly offsets: Float32Array;
  private readonly mat: THREE.MeshBasicMaterial;
  private shift = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly base = new THREE.Color(0xffc266);

  constructor(
    private readonly path: CircuitPath,
    count = 220,
  ) {
    this.mat = new THREE.MeshBasicMaterial({ color: this.base, toneMapped: false, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 10, 8), this.mat, count);
    this.mesh.frustumCulled = false;
    this.offsets = new Float32Array(count);
    for (let k = 0; k < count; k++) this.offsets[k] = (k / count) * path.length;
  }

  applyTheme(t: SceneThemeDef): void {
    this.base.setHex(t.particleColor);
  }

  /** Velocidad visual actual (unidades/s), útil para la telemetría. */
  speed = 0;

  update(f: VisualFrame): void {
    const iN = norm(f.state.i, f.scales.i);
    const running = f.state.status === 'running' && f.switchClosed;
    // Velocidad objetivo según i(t); se suaviza para que i ≈ 0 frene sin saltos.
    const target = running ? Math.sign(f.state.i) * iN * MAX_SPEED : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-f.dt * 10));
    this.shift += this.speed * f.dt;

    const size = f.switchClosed ? 0.35 + 0.55 * Math.sqrt(iN) : 0;
    this.mat.color.copy(this.base).multiplyScalar(0.45 + 1.1 * iN);
    const n = this.offsets.length;
    for (let k = 0; k < n; k++) {
      const s = this.offsets[k] + this.shift;
      this.path.pointAt(s, this.p);
      const sc = this.path.isHidden(s) ? 0 : size;
      this.s.set(sc, sc, sc);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
