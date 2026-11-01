/**
 * Paletas de la escena 3D por tema. Convención: las claves que terminan en
 * "Color" son colores hexadecimales; el resto son números que se interpolan.
 * `additive` decide la mezcla de los efectos de campo: la mezcla aditiva solo
 * es visible sobre fondo oscuro; en tema claro se usa mezcla normal con colores
 * sobrios (sin neón).
 */
import * as THREE from 'three';
import type { ThemeName } from '../utils/Theme';

export interface SceneThemeDef {
  backgroundColor: number;
  fogNear: number;
  fogFar: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  rimColor: number;
  rimIntensity: number;
  exposure: number;
  envIntensity: number;
  bloomStrength: number;
  bloomThreshold: number;
  tableColor: number;
  edgeColor: number;
  floorColor: number;
  gridColor: number;
  gridOpacity: number;
  legColor: number;
  panelColor: number;
  panelLineColor: number;
  magneticColor: number;
  magneticMarkerColor: number;
  electricColor: number;
  heatColor: number;
  particleColor: number;
  ringColor: number;
  potentialPosColor: number;
  potentialNegColor: number;
  arrowRColor: number;
  arrowLColor: number;
  arrowCColor: number;
  glassColor: number;
  additive: number; // 1 = aditiva, 0 = normal
}

export const SCENE_THEMES: Record<ThemeName, SceneThemeDef> = {
  dark: {
    backgroundColor: 0x05080f,
    fogNear: 14,
    fogFar: 34,
    hemiSkyColor: 0x9cc4ff,
    hemiGroundColor: 0x0a0f18,
    hemiIntensity: 0.55,
    keyIntensity: 2.2,
    fillIntensity: 0.45,
    rimColor: 0x4fc3ff,
    rimIntensity: 0.9,
    exposure: 1.0,
    envIntensity: 0.45,
    bloomStrength: 0.7,
    bloomThreshold: 0.9,
    tableColor: 0x141b27,
    edgeColor: 0x2f9fff,
    floorColor: 0x070b12,
    gridColor: 0x1d3550,
    gridOpacity: 0.55,
    legColor: 0x0e131c,
    panelColor: 0x0b111b,
    panelLineColor: 0x15476e,
    magneticColor: 0xa98bff,
    magneticMarkerColor: 0xcdb8ff,
    electricColor: 0x8ff0c4,
    heatColor: 0xff8a3a,
    particleColor: 0xffc266,
    ringColor: 0x4fc3ff,
    potentialPosColor: 0xff7a59,
    potentialNegColor: 0x5aa9ff,
    arrowRColor: 0xffb347,
    arrowLColor: 0xc49bff,
    arrowCColor: 0x5fe3a8,
    glassColor: 0x9cc4ff,
    additive: 1,
  },
  light: {
    backgroundColor: 0xe8edf3,
    fogNear: 16,
    fogFar: 40,
    hemiSkyColor: 0xffffff,
    hemiGroundColor: 0xaeb9c6,
    hemiIntensity: 1.15,
    keyIntensity: 2.4,
    fillIntensity: 0.7,
    rimColor: 0xc9d8ea,
    rimIntensity: 0.5,
    exposure: 1.0,
    envIntensity: 0.75,
    bloomStrength: 0.12,
    bloomThreshold: 0.97,
    tableColor: 0xdfe5ec,
    edgeColor: 0x3d6fa8,
    floorColor: 0xd3dbe4,
    gridColor: 0xb3bfcc,
    gridOpacity: 0.6,
    legColor: 0x8794a3,
    panelColor: 0xcfd8e2,
    panelLineColor: 0x9fb3c8,
    magneticColor: 0x5b3f9a,
    magneticMarkerColor: 0x4a3389,
    electricColor: 0x1f7a52,
    heatColor: 0xc2410c,
    particleColor: 0xc26a14,
    ringColor: 0x1f5fae,
    potentialPosColor: 0xc0392b,
    potentialNegColor: 0x1f5fae,
    arrowRColor: 0xb8620f,
    arrowLColor: 0x6a4c9c,
    arrowCColor: 0x2e7d55,
    glassColor: 0x8899aa,
    additive: 0,
  },
};

const ca = new THREE.Color();
const cb = new THREE.Color();

/** Interpola dos paletas (u ∈ [0, 1]) para una transición suave entre temas. */
export function blendSceneTheme(a: SceneThemeDef, b: SceneThemeDef, u: number, out: SceneThemeDef): SceneThemeDef {
  for (const key of Object.keys(a) as Array<keyof SceneThemeDef>) {
    if (key.endsWith('Color')) {
      ca.setHex(a[key]);
      cb.setHex(b[key]);
      out[key] = ca.lerp(cb, u).getHex();
    } else if (key === 'additive') {
      out[key] = u < 0.5 ? a[key] : b[key];
    } else {
      out[key] = a[key] + (b[key] - a[key]) * u;
    }
  }
  return out;
}

export function blendingFor(t: SceneThemeDef): THREE.Blending {
  return t.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
}
