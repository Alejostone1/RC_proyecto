/**
 * Monitor de energía 3D en el centro de la mesa: cuatro columnas de vidrio.
 *
 *   E_C = q²/2C             energía en el campo eléctrico del capacitor
 *   E_L = L i²/2            energía en el campo magnético del inductor
 *   W_R = ∫ R i² dt         energía convertida en calor por el resistor
 *   Σ   = E(0) + ∫ E·i dt   energía total aportada (inicial + fuente)
 *
 * Por conservación de la energía, E_C + E_L + W_R = Σ en todo instante: la suma
 * de las tres primeras columnas iguala a la cuarta. Todas comparten la misma
 * escala, que solo crece durante una corrida para que las alturas sean comparables.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { SceneThemeDef } from '../scene/SceneTheme';
import type { VisualFrame } from './types';

const H = 1.25;
const R = 0.12;
const BASE_Y = 0.08;

interface Column {
  fill: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  value: number;
}

export class EnergyMonitor {
  readonly group = new THREE.Group();
  private readonly cols: Column[] = [];
  private readonly glassMat: THREE.MeshPhysicalMaterial;
  private readonly fillGeo = new THREE.CylinderGeometry(R * 0.82, R * 0.82, 1, 24);
  private readonly glassGeo = new THREE.CylinderGeometry(R, R, H, 24, 1, true);
  private readonly baseGeo = new THREE.CylinderGeometry(R * 1.25, R * 1.35, 0.06, 24);
  private readonly baseMat = new THREE.MeshStandardMaterial({ color: 0x2a3443, metalness: 0.7, roughness: 0.4 });
  private scale = 1;
  private initialEnergy = 0;
  private readonly labels: HTMLElement[] = [];

  constructor() {
    this.fillGeo.translate(0, 0.5, 0); // crece desde la base
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0, depthWrite: false });
    const names = ['E<sub>C</sub>', 'E<sub>L</sub>', 'W<sub>R</sub>', 'Σ'];
    const xs = [-1.75, -1.35, -0.95, -0.45];
    const Z = 0.45;
    xs.forEach((x, k) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1, transparent: k === 3, opacity: k === 3 ? 0.55 : 1 });
      const fill = new THREE.Mesh(this.fillGeo, mat);
      fill.position.set(x, BASE_Y + 0.06, Z);
      fill.scale.y = 0.0001;
      const glass = new THREE.Mesh(this.glassGeo, this.glassMat);
      glass.position.set(x, BASE_Y + 0.06 + H / 2, Z);
      const base = new THREE.Mesh(this.baseGeo, this.baseMat);
      base.position.set(x, BASE_Y + 0.03, Z);
      this.group.add(fill, glass, base);
      this.cols.push({ fill, mat, value: 0 });

      const div = document.createElement('div');
      div.className = 'tag energy-tag';
      div.innerHTML = `<b>${names[k]}</b>`;
      const lbl = new CSS2DObject(div);
      lbl.position.set(x, BASE_Y + 0.02, Z + 0.32);
      this.group.add(lbl);
      this.labels.push(div);
    });
    // "=" visual entre la suma y el total
    const eqDiv = document.createElement('div');
    eqDiv.className = 'energy-eq';
    eqDiv.textContent = '=';
    const eq = new CSS2DObject(eqDiv);
    eq.position.set(-0.7, BASE_Y + H * 0.55, Z);
    this.group.add(eq);
  }

  applyTheme(t: SceneThemeDef): void {
    const colors = [t.arrowCColor, t.arrowLColor, t.heatColor, t.ringColor];
    this.cols.forEach((c, k) => {
      c.mat.color.setHex(colors[k]);
      c.mat.emissive.setHex(colors[k]).multiplyScalar(t.additive ? 0.25 : 0);
    });
    this.glassMat.color.setHex(t.glassColor);
    this.glassMat.opacity = t.additive ? 0.16 : 0.28;
    this.baseMat.color.setHex(t.additive ? 0x2a3443 : 0x9aa6b4);
  }

  onConfigure(f: VisualFrame): void {
    const { q0, i0 } = { q0: f.state.q, i0: f.state.i };
    this.initialEnergy = (q0 * q0) / (2 * f.params.C) + 0.5 * f.params.L * i0 * i0;
    this.scale = Math.max(f.scales.energy, this.initialEnergy, 1e-12);
  }

  /** Reinicia la referencia (al reiniciar la simulación sin cambiar parámetros). */
  resetScale(f: VisualFrame): void {
    this.onConfigure(f);
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }

  update(f: VisualFrame): void {
    if (!this.group.visible) return;
    const s = f.state;
    const total = this.initialEnergy + s.Wsrc;
    // La escala solo crece (p. ej. con fuente senoidal la energía aportada aumenta sin cesar)
    this.scale = Math.max(this.scale, total, s.EC + s.EL + s.Wdiss);
    const targets = [s.EC, s.EL, s.Wdiss, total];
    const k = 1 - Math.exp(-f.dt * 12);
    this.cols.forEach((c, n) => {
      c.value += (targets[n] / this.scale - c.value) * k;
      c.fill.scale.y = Math.max(0.0001, H * Math.min(1, Math.max(0, c.value)));
    });
  }

  dispose(): void {
    this.fillGeo.dispose();
    this.glassGeo.dispose();
    this.baseGeo.dispose();
    this.glassMat.dispose();
    this.baseMat.dispose();
    for (const c of this.cols) c.mat.dispose();
  }
}
