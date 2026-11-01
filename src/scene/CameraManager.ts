/**
 * Cámara orbital con vistas predefinidas, vuelos suaves (ease-in-out) y
 * encuadre adaptativo: en pantallas verticales (celular) se amplía el campo de
 * visión para que el circuito completo siga cabiendo en el ancho.
 */
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

/** Campo de visión horizontal mínimo que se garantiza en cualquier proporción. */
const MIN_HFOV = THREE.MathUtils.degToRad(50);

export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private readonly to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private t = 1;
  private duration = 1.2;
  current: CameraView | null = 'general';
  /** Órbita lenta automática (presentación). Radianes por segundo. */
  autoRotate = 0;

  constructor(dom: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 200);
    const v = CAMERA_VIEWS.general;
    this.camera.position.copy(v.pos);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.copy(v.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.setAspect(aspect);
    this.camera.position.copy(v.target).add(v.pos.clone().sub(v.target).multiplyScalar(this.fit));
    this.controls.update();
  }

  goTo(view: CameraView, duration = 1.2): void {
    const v = CAMERA_VIEWS[view];
    // En pantallas verticales el fov ya es más amplio: se acerca la cámara para compensar.
    const pos = v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(this.fit));
    this.flyTo(pos, v.target, duration);
    this.current = view;
  }

  /** Factor de distancia según la proporción de la pantalla (1 en horizontal). */
  get fit(): number {
    return this.camera.aspect < 1.25 ? 0.8 : 1;
  }

  /** Vuelo a una pose arbitraria (posición de cámara y punto observado). */
  flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.4): void {
    this.current = null;
    this.from.pos.copy(this.camera.position);
    this.from.target.copy(this.controls.target);
    this.to.pos.copy(pos);
    this.to.target.copy(target);
    this.duration = Math.max(0.01, duration);
    this.t = 0;
  }

  /** Acerca la cámara a un punto conservando la dirección de observación actual. */
  focusOn(point: THREE.Vector3, distance = 2.6): void {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    dir.y = Math.max(dir.y, 0.35);
    dir.normalize();
    this.flyTo(point.clone().addScaledVector(dir, distance), point, 1.0);
  }

  update(dt: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const e = this.t < 0.5 ? 4 * this.t ** 3 : 1 - (-2 * this.t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.from.pos, this.to.pos, e);
      this.controls.target.lerpVectors(this.from.target, this.to.target, e);
    } else if (this.autoRotate !== 0) {
      const off = this.camera.position.clone().sub(this.controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.autoRotate * dt);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.controls.update();
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  setAspect(aspect: number): void {
    // fov vertical necesario para conservar MIN_HFOV de ancho visible
    const needed = 2 * Math.atan(Math.tan(MIN_HFOV / 2) / aspect);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(needed), 42, 82);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
