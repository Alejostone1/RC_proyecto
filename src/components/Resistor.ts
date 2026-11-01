/**
 * Resistor 3D: cuerpo cerámico, bandas de color (valor de R) y terminales.
 * Disipación P_R = i²R → "temperatura visual" T con un retardo térmico de primer
 * orden (dT/dt = (P_R/P_R,máx − T)/τ). Es una representación conceptual: no se
 * modela la variación de R con la temperatura.
 */
import * as THREE from 'three';
import { NODES } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree, heatColor, materials } from '../scene/Materials';
import { blendingFor, type SceneThemeDef } from '../scene/SceneTheme';
import { resistorBands } from '../utils/ResistorCode';
import { norm, type LabComponent, type VisualFrame } from './types';

const THERMAL_TAU = 0.35; // s de simulación

export class Resistor implements LabComponent {
  readonly id = 'resistor' as const;
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly anchor: THREE.Vector3;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly bandMats: THREE.MeshStandardMaterial[] = [];
  private readonly glow: THREE.PointLight;
  private readonly heat: THREE.Points;
  private readonly heatMat: THREE.PointsMaterial;
  private readonly heatSeeds: Float32Array;
  private T = 0;
  private readonly tmpColor = new THREE.Color();

  constructor() {
    const m = materials();
    const a = NODES.resA;
    const b = NODES.resB;
    const center = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    this.anchor = center.clone();
    const bodyLen = 0.95;

    // Perfil de "hueso" típico de resistor axial (torneado alrededor del eje X)
    const profile: THREE.Vector2[] = [];
    const r0 = 0.15;
    const steps = 28;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const x = -bodyLen / 2 + u * bodyLen;
      const bulge = 0.035 * (Math.exp(-((u - 0.08) ** 2) / 0.004) + Math.exp(-((u - 0.92) ** 2) / 0.004));
      const cap = Math.sqrt(Math.max(0, 1 - ((Math.abs(u - 0.5) * 2) ** 18)));
      profile.push(new THREE.Vector2((r0 + bulge) * cap + 0.001, x));
    }
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xb9a985, roughness: 0.85, metalness: 0.0, emissive: 0x000000 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), this.bodyMat);
    body.rotation.z = -Math.PI / 2;
    body.position.copy(center);
    this.group.add(body);
    this.pickables.push(body);

    // Bandas
    const bandX = [-0.26, -0.14, -0.02, 0.24];
    for (const bx of bandX) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5 });
      this.bandMats.push(mat);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.055, 40, 1, true), mat);
      band.rotation.z = Math.PI / 2;
      band.position.set(center.x + bx, center.y, center.z);
      this.group.add(band);
      this.pickables.push(band);
    }

    // Terminales
    this.group.add(cylinderBetween(a, new THREE.Vector3(center.x - bodyLen / 2, a.y, a.z), 0.022, m.tin));
    this.group.add(cylinderBetween(new THREE.Vector3(center.x + bodyLen / 2, b.y, b.z), b, 0.022, m.tin));

    // Brillo térmico
    this.glow = new THREE.PointLight(0xff6a1a, 0, 2.5, 2);
    this.glow.position.copy(center).add(new THREE.Vector3(0, 0.35, 0));
    this.group.add(this.glow);

    // Calor ascendente (partículas conceptuales)
    const N = 60;
    this.heatSeeds = new Float32Array(N * 3);
    const pos = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      this.heatSeeds[3 * k] = (Math.random() - 0.5) * bodyLen * 0.9;
      this.heatSeeds[3 * k + 1] = Math.random();
      this.heatSeeds[3 * k + 2] = (Math.random() - 0.5) * 0.25;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.heatMat = new THREE.PointsMaterial({ color: 0xff8a3a, size: 0.05, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.heat = new THREE.Points(g, this.heatMat);
    this.heat.position.copy(center);
    this.heat.frustumCulled = false;
    this.group.add(this.heat);
  }

  onConfigure(frame: VisualFrame): void {
    const bands = resistorBands(frame.params.R);
    bands.colors.forEach((c, k) => this.bandMats[k].color.set(c));
  }

  applyTheme(t: SceneThemeDef): void {
    this.heatMat.color.setHex(t.heatColor);
    const b = blendingFor(t);
    if (this.heatMat.blending !== b) {
      this.heatMat.blending = b;
      this.heatMat.needsUpdate = true;
    }
  }

  /** Temperatura visual normalizada (0 = fría, 1 = máxima potencia del experimento). */
  get temperature(): number {
    return this.T;
  }

  update(f: VisualFrame): void {
    const target = norm(f.state.PR, f.scales.PR);
    // Retardo térmico en tiempo simulado; si la simulación está pausada, la temperatura se congela.
    if (f.simDt > 0) this.T += (target - this.T) * (1 - Math.exp(-f.simDt / THERMAL_TAU));
    if (f.state.status === 'idle') this.T *= Math.exp(-f.dt / 0.4);
    const T = this.T;
    heatColor(T, this.tmpColor);
    this.bodyMat.emissive.copy(this.tmpColor);
    this.bodyMat.emissiveIntensity = 0.4 + 2.2 * T;
    this.glow.intensity = 3 * T * T;

    this.heatMat.opacity = Math.min(0.8, T * 1.1);
    const pos = this.heat.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = arr.length / 3;
    const rise = f.dt * (0.25 + 0.6 * T);
    for (let k = 0; k < n; k++) {
      let life = this.heatSeeds[3 * k + 1] + rise;
      if (life > 1) life -= 1;
      this.heatSeeds[3 * k + 1] = life;
      arr[3 * k] = this.heatSeeds[3 * k] + 0.03 * Math.sin(f.time * 3 + k);
      arr[3 * k + 1] = 0.15 + life * 0.7;
      arr[3 * k + 2] = this.heatSeeds[3 * k + 2];
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    disposeTree(this.group, [this.bodyMat, this.heatMat, ...this.bandMats]);
  }
}
