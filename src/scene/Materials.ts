/**
 * Materiales compartidos (se crean una sola vez y se reutilizan entre mallas).
 * Los materiales que cambian por frame (emisivos dinámicos) los crea cada componente.
 */
import * as THREE from 'three';

let cache: ReturnType<typeof build> | null = null;

function build() {
  return {
    copper: new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 1, roughness: 0.32 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xaab4c3, metalness: 0.9, roughness: 0.28 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1b2230, metalness: 0.75, roughness: 0.45 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x0d1118, metalness: 0.1, roughness: 0.6 }),
    redPlastic: new THREE.MeshStandardMaterial({ color: 0xb3262e, metalness: 0.1, roughness: 0.45 }),
    ferrite: new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.35, roughness: 0.75 }),
    tin: new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.22 }),
  };
}

export function materials() {
  if (!cache) cache = build();
  return cache;
}

export function disposeMaterials(): void {
  if (!cache) return;
  for (const m of Object.values(cache)) m.dispose();
  cache = null;
}

/** Cilindro entre dos puntos (para terminales y cables). */
export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, radial = 12): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial, 1, true);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Libera geometrías de un subárbol (los materiales compartidos se liberan aparte). */
export function disposeTree(root: THREE.Object3D, ownMaterials: THREE.Material[] = []): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  for (const m of ownMaterials) m.dispose();
}

/** Rampa de color de "cuerpo caliente" para T normalizada ∈ [0, 1]. */
const RAMP = [
  new THREE.Color(0x000000),
  new THREE.Color(0x5a0a00),
  new THREE.Color(0xc42a00),
  new THREE.Color(0xff7a14),
  new THREE.Color(0xffd27a),
  new THREE.Color(0xfff4e0),
];
export function heatColor(T: number, out: THREE.Color): THREE.Color {
  const x = Math.min(0.9999, Math.max(0, T)) * (RAMP.length - 1);
  const k = Math.floor(x);
  return out.copy(RAMP[k]).lerp(RAMP[k + 1], x - k);
}
