/**
 * Posprocesado: RenderPass → UnrealBloomPass → OutputPass (tone mapping + sRGB).
 * El bloom tiene umbral alto: solo brillan los elementos emisivos que codifican
 * magnitudes físicas (partículas, resistor caliente, cargas, campos).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class PostProcessing {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.7, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  set enabled(on: boolean) {
    this.bloom.enabled = on;
  }

  get enabled(): boolean {
    return this.bloom.enabled;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
