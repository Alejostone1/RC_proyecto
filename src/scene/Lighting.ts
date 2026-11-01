import * as THREE from 'three';
import type { SceneThemeDef } from './SceneTheme';

/** Iluminación de laboratorio: luz clave, relleno cálido suave y contraluz. */
export class Lighting {
  readonly group = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight(0x9cc4ff, 0x0a0f18, 0.55);
  private readonly key = new THREE.DirectionalLight(0xe8f1ff, 2.2);
  private readonly fill = new THREE.DirectionalLight(0xffd8b0, 0.45);
  private readonly rim = new THREE.DirectionalLight(0x4fc3ff, 0.9);

  constructor(shadows: boolean) {
    this.key.position.set(4, 9, 6);
    this.key.castShadow = shadows;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -6;
    this.key.shadow.camera.right = 6;
    this.key.shadow.camera.top = 5;
    this.key.shadow.camera.bottom = -5;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.fill.position.set(-6, 4, 3);
    this.rim.position.set(-3, 3, -8);
    this.group.add(this.hemi, this.key, this.fill, this.rim);
  }

  applyTheme(t: SceneThemeDef): void {
    this.hemi.color.setHex(t.hemiSkyColor);
    this.hemi.groundColor.setHex(t.hemiGroundColor);
    this.hemi.intensity = t.hemiIntensity;
    this.key.intensity = t.keyIntensity;
    this.fill.intensity = t.fillIntensity;
    this.rim.color.setHex(t.rimColor);
    this.rim.intensity = t.rimIntensity;
  }
}
