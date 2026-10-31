/**
 * Fuente de voltaje 3D con pantalla que muestra el modo (DC / AC / OFF) y E(t).
 * La pantalla es una CanvasTexture que se redibuja a ~12 Hz (no en cada frame).
 */
import * as THREE from 'three';
import { NODES, WIRE_Y } from '../scene/CircuitPath';
import { cylinderBetween, disposeTree, materials } from '../scene/Materials';
import { fmtSI } from '../utils/Format';
import type { LabComponent, VisualFrame } from './types';

export class VoltageSource implements LabComponent {
  readonly id = 'source' as const;
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly anchor = new THREE.Vector3(-3, WIRE_Y, 0);
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly ledMat: THREE.MeshBasicMaterial;
  private lastDraw = -1;

  constructor() {
    const m = materials();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 1.5), m.darkMetal);
    body.position.set(-3.05, 0.31 + 0.08, 0);
    this.group.add(body);
    this.pickables.push(body);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 1.12), m.blackPlastic);
    bezel.position.set(-3.05, 0.71, -0.05);
    this.group.add(bezel);

    this.canvas.width = 512;
    this.canvas.height = 320;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), this.screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.rotation.z = -Math.PI / 2; // legible desde +x (hacia el centro del circuito)
    screen.position.set(-3.05, 0.722, -0.05);
    this.group.add(screen);
    this.pickables.push(screen);

    // Bornes: + (rojo) hacia −z, − (negro) hacia +z
    const post = new THREE.CylinderGeometry(0.07, 0.07, 0.16, 20);
    const plus = new THREE.Mesh(post, m.redPlastic);
    plus.position.set(-3, WIRE_Y, -0.68);
    plus.rotation.x = Math.PI / 2;
    const minus = new THREE.Mesh(post, m.blackPlastic);
    minus.position.set(-3, WIRE_Y, 0.68);
    minus.rotation.x = Math.PI / 2;
    this.group.add(plus, minus);
    this.group.add(cylinderBetween(NODES.srcPlus, plus.position, 0.03, m.copper));
    this.group.add(cylinderBetween(minus.position, NODES.srcMinus, 0.03, m.copper));

    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x1a3a26, toneMapped: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.ledMat);
    led.position.set(-3.05, 0.72, 0.62);
    this.group.add(led);
  }

  update(f: VisualFrame): void {
    this.ledMat.color.set(f.switchClosed ? 0x39ff88 : 0x1a3a26);
    if (f.time - this.lastDraw < 1 / 12 && this.lastDraw >= 0) return;
    this.lastDraw = f.time;
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const off = f.excitation.kind === 'free';
    c.fillStyle = '#04121c';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(79,195,255,0.35)';
    c.lineWidth = 4;
    c.strokeRect(6, 6, W - 12, H - 12);
    c.fillStyle = off ? '#5b6b80' : '#4fc3ff';
    c.font = 'bold 56px "JetBrains Mono", Consolas, monospace';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    const mode = off ? 'OFF' : f.excitation.kind === 'step' ? 'DC' : 'AC';
    c.fillText(mode, 28, 24);
    c.font = '34px "JetBrains Mono", Consolas, monospace';
    c.fillStyle = '#7d8ea6';
    c.textAlign = 'right';
    c.fillText(f.switchClosed ? 'S: CERRADO' : 'S: ABIERTO', W - 28, 34);
    c.textAlign = 'left';
    c.fillStyle = off ? '#5b6b80' : '#e6f4ff';
    c.font = 'bold 76px "JetBrains Mono", Consolas, monospace';
    c.fillText(`E=${fmtSI(f.state.E, 'V', 3)}`, 28, 110);
    c.font = '32px "JetBrains Mono", Consolas, monospace';
    c.fillStyle = '#7d8ea6';
    const sub =
      f.excitation.kind === 'sine'
        ? `E₀=${fmtSI(f.excitation.E0, 'V')} ω=${f.excitation.omega.toFixed(2)}`
        : f.excitation.kind === 'step'
          ? `E₀=${fmtSI(f.excitation.E0, 'V')} constante`
          : 'descarga libre E=0';
    c.fillText(sub, 28, 220);
    if (f.excitation.kind === 'sine') {
      c.strokeStyle = '#ffb347';
      c.lineWidth = 4;
      c.beginPath();
      for (let x = 0; x <= 140; x += 4) {
        const y = 270 + 22 * Math.sin((x / 140) * Math.PI * 2);
        if (x === 0) c.moveTo(W - 170 + x, y);
        else c.lineTo(W - 170 + x, y);
      }
      c.stroke();
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    disposeTree(this.group, [this.screenMat, this.ledMat]);
    this.texture.dispose();
  }
}
