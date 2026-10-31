/**
 * Orquesta la escena 3D: renderer, entorno, laboratorio, componentes, partículas,
 * etiquetas CSS2D, selección por raycasting y posprocesado.
 * Solo LEE el estado de simulación a través de VisualFrame.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Capacitor } from '../components/Capacitor';
import { Inductor } from '../components/Inductor';
import { Resistor } from '../components/Resistor';
import { Switch } from '../components/Switch';
import type { ComponentId, LabComponent, VisualFrame } from '../components/types';
import { VoltageSource } from '../components/VoltageSource';
import { Wires } from '../components/Wires';
import { CurrentFlow } from '../particles/CurrentFlow';
import { CameraManager } from './CameraManager';
import { CircuitPath, NODES, WIRE_Y } from './CircuitPath';
import { Laboratory } from './Laboratory';
import { createLighting } from './Lighting';
import { disposeMaterials, materials } from './Materials';
import { PostProcessing } from './PostProcessing';

export const COMPONENT_NAMES: Record<ComponentId, string> = {
  source: 'Fuente E(t)',
  switch: 'Interruptor S',
  resistor: 'Resistor R',
  inductor: 'Inductor L',
  capacitor: 'Capacitor C',
};

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameras: CameraManager;
  readonly post: PostProcessing;
  readonly components: Record<ComponentId, LabComponent>;
  readonly flow: CurrentFlow;
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly labels = new Map<ComponentId, HTMLDivElement>();
  private readonly wires = new Wires();
  private readonly lab = new Laboratory();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly selectionRing: THREE.Mesh;
  private readonly envTexture: THREE.Texture;
  private readonly stands = new THREE.Group();
  selected: ComponentId | null = null;
  onPick: (id: ComponentId | null) => void = () => {};

  constructor(private readonly container: HTMLElement) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.scene.background = new THREE.Color(0x05080f);
    this.scene.fog = new THREE.Fog(0x05080f, 14, 34);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.cameras = new CameraManager(this.renderer.domElement, w / h);
    this.scene.add(createLighting(), this.lab.group, this.wires.group);

    this.components = {
      source: new VoltageSource(),
      switch: new Switch(),
      resistor: new Resistor(),
      inductor: new Inductor(),
      capacitor: new Capacitor(),
    };
    for (const c of Object.values(this.components)) {
      this.scene.add(c.group);
      c.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) o.castShadow = true;
      });
      for (const p of c.pickables) {
        p.userData.componentId = c.id;
        this.pickables.push(p);
      }
      this.addLabel(c);
    }
    this.buildStands();

    const path = new CircuitPath();
    this.flow = new CurrentFlow(path);
    this.scene.add(this.flow.mesh);

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.82, 64),
      new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.post = new PostProcessing(this.renderer, this.scene, this.cameras.camera);
    this.post.setSize(w, h, this.renderer.getPixelRatio());

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** Soportes bajo los componentes y bornes en las esquinas (estética de banco de pruebas). */
  private buildStands(): void {
    const m = materials();
    const post = new THREE.CylinderGeometry(0.05, 0.07, WIRE_Y - 0.08, 12);
    const at = (x: number, z: number) => {
      const s = new THREE.Mesh(post, m.darkMetal);
      s.position.set(x, 0.08 + (WIRE_Y - 0.08) / 2, z);
      s.castShadow = true;
      this.stands.add(s);
    };
    for (const n of [NODES.cornerBL, NODES.cornerBR, NODES.cornerFR, NODES.cornerFL]) at(n.x, n.z);
    at(NODES.resA.x + 0.12, NODES.resA.z);
    at(NODES.resB.x - 0.12, NODES.resB.z);
    at(3, -0.85);
    at(3, 0.85);
    at(0.35, 1.8);
    at(-0.35, 1.8);
    this.scene.add(this.stands);
  }

  private addLabel(c: LabComponent): void {
    const div = document.createElement('div');
    div.className = 'tag';
    div.innerHTML = `<b>${COMPONENT_NAMES[c.id]}</b><span></span>`;
    div.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.select(c.id);
      this.onPick(c.id);
    });
    const obj = new CSS2DObject(div);
    const offset = c.id === 'source' ? 0.65 : c.id === 'inductor' ? 0.75 : c.id === 'capacitor' ? 0.75 : 0.55;
    obj.position.copy(c.anchor).add(new THREE.Vector3(0, offset, 0));
    this.scene.add(obj);
    this.labels.set(c.id, div);
  }

  setLabelValue(id: ComponentId, text: string): void {
    const span = this.labels.get(id)?.querySelector('span');
    if (span && span.textContent !== text) span.textContent = text;
  }

  setLabelsVisible(on: boolean): void {
    this.labelRenderer.domElement.style.display = on ? '' : 'none';
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    let downX = 0;
    let downY = 0;
    el.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      // Solo es "clic" si el puntero apenas se movió (si no, fue una órbita)
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const id = this.pick(e.clientX, e.clientY);
      this.select(id);
      this.onPick(id);
    });
    el.addEventListener('pointermove', (e) => {
      el.style.cursor = this.pick(e.clientX, e.clientY) ? 'pointer' : '';
    });
  }

  pick(clientX: number, clientY: number): ComponentId | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.cameras.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return (hit?.object.userData.componentId as ComponentId | undefined) ?? null;
  }

  select(id: ComponentId | null): void {
    this.selected = id;
    for (const [cid, div] of this.labels) div.classList.toggle('selected', cid === id);
    if (!id) {
      this.selectionRing.visible = false;
      return;
    }
    const a = this.components[id].anchor;
    this.selectionRing.position.set(a.x, 0.09, a.z);
    this.selectionRing.visible = true;
  }

  onConfigure(frame: VisualFrame): void {
    for (const c of Object.values(this.components)) c.onConfigure?.(frame);
  }

  update(frame: VisualFrame): void {
    this.cameras.update(frame.dt);
    for (const c of Object.values(this.components)) c.update(frame);
    this.wires.update(frame);
    this.flow.update(frame);
    if (this.selectionRing.visible) {
      const s = 1 + 0.04 * Math.sin(frame.time * 4);
      this.selectionRing.scale.set(s, s, s);
    }
    this.post.render();
    this.labelRenderer.render(this.scene, this.cameras.camera);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.cameras.setAspect(w / h);
  }

  dispose(): void {
    for (const c of Object.values(this.components)) c.dispose();
    this.wires.dispose();
    this.lab.dispose();
    this.flow.dispose();
    this.post.dispose();
    this.envTexture.dispose();
    disposeMaterials();
    this.renderer.dispose();
  }
}
