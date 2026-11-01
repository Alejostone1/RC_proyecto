/**
 * Orquesta la escena 3D: renderer, entorno, laboratorio, componentes, partículas,
 * etiquetas CSS2D, selección por raycasting, posprocesado y tema.
 * Solo LEE el estado de simulación a través de VisualFrame.
 *
 * Un único contexto WebGL se comparte entre el laboratorio y la presentación:
 * `mount()` mueve el lienzo al contenedor de la vista activa.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Capacitor } from '../components/Capacitor';
import { EnergyMonitor } from '../components/EnergyMonitor';
import { Inductor } from '../components/Inductor';
import { Resistor } from '../components/Resistor';
import { Switch } from '../components/Switch';
import type { ComponentId, LabComponent, VisualFrame } from '../components/types';
import { VoltageArrows } from '../components/VoltageArrows';
import { VoltageSource } from '../components/VoltageSource';
import { Wires } from '../components/Wires';
import { CurrentFlow } from '../particles/CurrentFlow';
import type { ThemeName } from '../utils/Theme';
import { CameraManager } from './CameraManager';
import { CircuitPath, NODES, WIRE_Y } from './CircuitPath';
import { Laboratory } from './Laboratory';
import { Lighting } from './Lighting';
import { disposeMaterials, materials } from './Materials';
import { PostProcessing } from './PostProcessing';
import { SCENE_THEMES, blendSceneTheme, type SceneThemeDef } from './SceneTheme';

export const COMPONENT_NAMES: Record<ComponentId, string> = {
  source: 'Fuente E(t)',
  switch: 'Interruptor S',
  resistor: 'Resistor R',
  inductor: 'Inductor L',
  capacitor: 'Capacitor C',
};

/** Equipos táctiles o pantallas pequeñas: menos píxeles, sin sombras, sin bloom por defecto. */
export const LOW_POWER = typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760);

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameras: CameraManager;
  readonly post: PostProcessing;
  readonly components: Record<ComponentId, LabComponent>;
  readonly flow: CurrentFlow;
  readonly wires = new Wires();
  readonly arrows = new VoltageArrows();
  readonly energy = new EnergyMonitor();
  private readonly lighting: Lighting;
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly labels = new Map<ComponentId, HTMLDivElement>();
  private readonly lab = new Laboratory();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly selectionRing: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly envTexture: THREE.Texture;
  private readonly stands = new THREE.Group();
  private readonly observer: ResizeObserver;
  private container: HTMLElement;
  private hovered: ComponentId | null = null;
  /** Bloom deseado por el usuario (el tema puede atenuarlo). */
  private bloomWanted = !LOW_POWER;

  // Tema: transición interpolada entre dos paletas
  private themeFrom: SceneThemeDef = { ...SCENE_THEMES.dark };
  private themeTo: SceneThemeDef = { ...SCENE_THEMES.dark };
  private readonly themeNow: SceneThemeDef = { ...SCENE_THEMES.dark };
  private themeU = 1;

  selected: ComponentId | null = null;
  onPick: (id: ComponentId | null) => void = () => {};
  /** Si es false no se renderiza (vista de resultados): ahorra batería en el celular. */
  active = true;

  constructor(container: HTMLElement, theme: ThemeName) {
    this.container = container;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: !LOW_POWER || window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_POWER ? 1.5 : 1.75));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = !LOW_POWER;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('gl-canvas');
    container.prepend(this.renderer.domElement);

    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.className = 'label-layer';
    container.prepend(this.labelRenderer.domElement);
    container.prepend(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x05080f);
    this.scene.fog = new THREE.Fog(0x05080f, 14, 34);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.cameras = new CameraManager(this.renderer.domElement, w / h);
    this.lighting = new Lighting(!LOW_POWER);
    this.scene.add(this.lighting.group, this.lab.group, this.wires.group, this.arrows.group, this.energy.group);

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

    this.flow = new CurrentFlow(new CircuitPath());
    this.scene.add(this.flow.mesh);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false });
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.82, 64), this.ringMat);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.post = new PostProcessing(this.renderer, this.scene, this.cameras.camera);
    this.post.setSize(w, h, this.renderer.getPixelRatio());

    this.bindPointer();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.setTheme(theme, false);
  }

  /** Mueve el lienzo 3D (y sus etiquetas) a otro contenedor. */
  mount(container: HTMLElement): void {
    if (container === this.container) return;
    this.observer.unobserve(this.container);
    this.container = container;
    container.prepend(this.labelRenderer.domElement);
    container.prepend(this.renderer.domElement);
    this.observer.observe(container);
    this.resize();
  }

  // ---------- tema ----------
  setTheme(theme: ThemeName, animate = true): void {
    this.themeFrom = { ...this.themeNow };
    this.themeTo = { ...SCENE_THEMES[theme] };
    this.themeU = animate ? 0 : 1;
    if (!animate) this.applyTheme(this.themeTo);
  }

  private applyTheme(t: SceneThemeDef): void {
    (this.scene.background as THREE.Color).setHex(t.backgroundColor);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(t.backgroundColor);
    fog.near = t.fogNear;
    fog.far = t.fogFar;
    this.renderer.toneMappingExposure = t.exposure;
    this.scene.environmentIntensity = t.envIntensity;
    this.post.bloom.strength = t.bloomStrength;
    this.post.bloom.threshold = t.bloomThreshold;
    this.post.enabled = this.bloomWanted && t.bloomStrength > 0.05;
    this.lighting.applyTheme(t);
    this.lab.applyTheme(t);
    for (const c of Object.values(this.components)) c.applyTheme?.(t);
    this.flow.applyTheme(t);
    this.wires.applyTheme(t);
    this.arrows.applyTheme(t);
    this.energy.applyTheme(t);
    this.ringMat.color.setHex(t.ringColor);
    Object.assign(this.themeNow, t);
  }

  setBloom(on: boolean): void {
    this.bloomWanted = on;
    this.post.enabled = on && this.themeNow.bloomStrength > 0.05;
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
    div.dataset.component = c.id;
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

  /** Atenúa las etiquetas que no sean `id` (enfoque didáctico de la presentación). */
  emphasize(id: ComponentId | null): void {
    for (const [cid, div] of this.labels) div.classList.toggle('muted', id !== null && cid !== id);
    this.select(id);
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
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const id = this.pick(e.clientX, e.clientY);
      this.select(id);
      this.onPick(id);
    });
    el.addEventListener('dblclick', (e) => {
      const id = this.pick(e.clientX, e.clientY);
      if (id) this.cameras.focusOn(this.components[id].anchor);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const id = this.pick(e.clientX, e.clientY);
      el.style.cursor = id ? 'pointer' : '';
      if (id !== this.hovered) {
        if (this.hovered) this.labels.get(this.hovered)?.classList.remove('hover');
        if (id) this.labels.get(id)?.classList.add('hover');
        this.hovered = id;
      }
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
    this.wires.onConfigure(frame);
    this.arrows.onConfigure(frame);
    this.energy.onConfigure(frame);
  }

  update(frame: VisualFrame): void {
    if (this.themeU < 1) {
      this.themeU = Math.min(1, this.themeU + frame.dt / 0.45);
      const u = this.themeU * this.themeU * (3 - 2 * this.themeU);
      this.applyTheme(blendSceneTheme(this.themeFrom, this.themeTo, u, { ...this.themeNow }));
    }
    if (!this.active) return;
    this.cameras.update(frame.dt);
    for (const c of Object.values(this.components)) c.update(frame);
    this.wires.update(frame);
    this.arrows.update(frame);
    this.energy.update(frame);
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
    this.arrows.dispose();
    this.energy.dispose();
    this.lab.dispose();
    this.flow.dispose();
    this.post.dispose();
    this.envTexture.dispose();
    this.ringMat.dispose();
    disposeMaterials();
    this.renderer.dispose();
  }
}
