/** Entorno del laboratorio: mesa de trabajo, suelo con rejilla y paneles de fondo. */
import * as THREE from 'three';
import { disposeTree } from './Materials';

export class Laboratory {
  readonly group = new THREE.Group();
  private readonly mats: THREE.Material[] = [];

  constructor() {
    const top = this.mat(new THREE.MeshStandardMaterial({ color: 0x141b27, metalness: 0.4, roughness: 0.55 }));
    const edge = this.mat(new THREE.MeshBasicMaterial({ color: 0x2f9fff, toneMapped: false }));
    const floorMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x070b12, metalness: 0.2, roughness: 0.9 }));

    // Mesa
    const slab = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.16, 5.4), top);
    slab.position.y = 0.0;
    slab.receiveShadow = true;
    this.group.add(slab);
    // Línea de luz perimetral (acento)
    const stripGeoX = new THREE.BoxGeometry(8.62, 0.012, 0.012);
    const stripGeoZ = new THREE.BoxGeometry(0.012, 0.012, 5.42);
    for (const z of [-2.7, 2.7]) {
      const s = new THREE.Mesh(stripGeoX, edge);
      s.position.set(0, 0.075, z);
      this.group.add(s);
    }
    for (const x of [-4.3, 4.3]) {
      const s = new THREE.Mesh(stripGeoZ, edge);
      s.position.set(x, 0.075, 0);
      this.group.add(s);
    }
    // Patas
    const legGeo = new THREE.BoxGeometry(0.18, 1.6, 0.18);
    const legMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x0e131c, metalness: 0.7, roughness: 0.4 }));
    for (const [x, z] of [
      [-4, -2.4],
      [4, -2.4],
      [-4, 2.4],
      [4, 2.4],
    ]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, -0.88, z);
      this.group.add(leg);
    }

    // Suelo
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.68;
    floor.receiveShadow = true;
    this.group.add(floor);
    const grid = new THREE.GridHelper(40, 80, 0x1d3550, 0x0f1c2c);
    grid.position.y = -1.67;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.mats.push(grid.material as THREE.Material);
    this.group.add(grid);

    // Paneles verticales de fondo (ambientación sobria)
    const panelMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x0b111b, metalness: 0.5, roughness: 0.6 }));
    const glowMat = this.mat(new THREE.MeshBasicMaterial({ color: 0x15476e, toneMapped: false }));
    const panelGeo = new THREE.BoxGeometry(2.6, 6, 0.2);
    const lineGeo = new THREE.BoxGeometry(0.04, 5.2, 0.05);
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI * (0.9 + (k / 8) * 1.2);
      const r = 15;
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.position.set(Math.cos(ang) * r, 1.3, Math.sin(ang) * r);
      p.lookAt(0, 1.3, 0);
      const l = new THREE.Mesh(lineGeo, glowMat);
      l.position.set(0, 0, 0.12);
      p.add(l);
      this.group.add(p);
    }
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  dispose(): void {
    disposeTree(this.group, this.mats);
  }
}
