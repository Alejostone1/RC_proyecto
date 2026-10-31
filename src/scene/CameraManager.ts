/** Cámara orbital con vistas predefinidas y transiciones suaves (ease-in-out). */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraView = 'general' | 'components' | 'top' | 'capacitor' | 'inductor';

export const CAMERA_VIEWS: Record<CameraView, { label: string; pos: THREE.Vector3; target: THREE.Vector3 }> = {
  general: { label: 'General', pos: new THREE.Vector3(5.2, 6.4, 8.6), target: new THREE.Vector3(0, 0.2, 0) },
  components: { label: 'Componentes R·L·C', pos: new THREE.Vector3(5.6, 3.6, 4.2), target: new THREE.Vector3(1.3, 0.4, 0) },
  top: { label: 'Superior', pos: new THREE.Vector3(0, 11.5, 0.01), target: new THREE.Vector3(0, 0, 0) },
  capacitor: { label: 'Capacitor', pos: new THREE.Vector3(1.6, 1.5, 4.0), target: new THREE.Vector3(0, 0.45, 1.8) },
  inductor: { label: 'Inductor', pos: new THREE.Vector3(5.3, 1.7, 1.6), target: new THREE.Vector3(3, 0.45, 0) },
};

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private t = 1;
  private duration = 1.2;
  current: CameraView = 'general';

  constructor(dom: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 200);
    const v = CAMERA_VIEWS.general;
    this.camera.position.copy(v.pos);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.copy(v.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.update();
  }

  goTo(view: CameraView, duration = 1.2): void {
    this.current = view;
    this.from.pos.copy(this.camera.position);
    this.from.target.copy(this.controls.target);
    this.to.pos.copy(CAMERA_VIEWS[view].pos);
    this.to.target.copy(CAMERA_VIEWS[view].target);
    this.duration = duration;
    this.t = 0;
  }

  update(dt: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const e = this.t < 0.5 ? 4 * this.t ** 3 : 1 - (-2 * this.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.from.pos, this.to.pos, e);
      this.controls.target.lerpVectors(this.from.target, this.to.target, e);
    }
    this.controls.update();
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
