/**
 * Geometría del lazo del circuito (plano XZ, a la altura Y de los cables).
 *
 * Sentido positivo de la corriente (i > 0): sale del borne + de la fuente,
 * pasa por el interruptor, el resistor, el inductor (siguiendo la hélice), la
 * placa A del capacitor y vuelve al borne −. Por tanto q > 0 significa placa A
 * positiva.
 *
 * La trayectoria es una polilínea parametrizada por longitud de arco; la usan
 * los cables y las partículas de corriente.
 */
import * as THREE from 'three';

export const WIRE_Y = 0.42;

/** Nodos principales del circuito. */
export const NODES = {
  srcPlus: new THREE.Vector3(-3, WIRE_Y, -0.6),
  cornerBL: new THREE.Vector3(-3, WIRE_Y, -1.8),
  swA: new THREE.Vector3(-2.1, WIRE_Y, -1.8),
  swB: new THREE.Vector3(-1.2, WIRE_Y, -1.8),
  resA: new THREE.Vector3(-0.35, WIRE_Y, -1.8),
  resB: new THREE.Vector3(1.25, WIRE_Y, -1.8),
  cornerBR: new THREE.Vector3(3, WIRE_Y, -1.8),
  indA: new THREE.Vector3(3, WIRE_Y, -0.95),
  indB: new THREE.Vector3(3, WIRE_Y, 0.95),
  cornerFR: new THREE.Vector3(3, WIRE_Y, 1.8),
  capA: new THREE.Vector3(0.55, WIRE_Y, 1.8),
  capB: new THREE.Vector3(-0.55, WIRE_Y, 1.8),
  cornerFL: new THREE.Vector3(-3, WIRE_Y, 1.8),
  srcMinus: new THREE.Vector3(-3, WIRE_Y, 0.6),
} as const;

/** Hélice del inductor (eje Z, centrada en x = 3). Compartida por la bobina y las partículas. */
export const COIL = {
  center: new THREE.Vector3(3, WIRE_Y + 0.05, 0),
  radius: 0.3,
  turns: 10,
  halfLength: 0.72,
};

export function coilPoints(samplesPerTurn = 24): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const n = COIL.turns * samplesPerTurn;
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const th = Math.PI / 2 + u * COIL.turns * Math.PI * 2;
    pts.push(
      new THREE.Vector3(
        COIL.center.x + COIL.radius * Math.cos(th),
        COIL.center.y + COIL.radius * Math.sin(th),
        COIL.center.z - COIL.halfLength + 2 * COIL.halfLength * u,
      ),
    );
  }
  return pts;
}

/** Placas del capacitor (perpendiculares a X). Placa A en +x (recibe i > 0). */
export const CAP = { gap: 0.22, plateA_x: 0.11, plateB_x: -0.11, z: 1.8 };

/** Tramos de cable visibles (los componentes dibujan sus propios terminales/cuerpos). */
export const WIRE_SEGMENTS: Array<[THREE.Vector3, THREE.Vector3]> = [
  [NODES.srcPlus, NODES.cornerBL],
  [NODES.cornerBL, NODES.swA],
  [NODES.swB, NODES.resA],
  [NODES.resB, NODES.cornerBR],
  [NODES.cornerBR, NODES.indA],
  [NODES.indB, NODES.cornerFR],
  [NODES.cornerFR, NODES.capA],
  [NODES.capB, NODES.cornerFL],
  [NODES.cornerFL, NODES.srcMinus],
];

export class CircuitPath {
  readonly points: THREE.Vector3[];
  private readonly cum: Float64Array;
  readonly length: number;
  /** Intervalos de longitud de arco donde NO hay conducción visible (dieléctrico). */
  readonly hidden: Array<[number, number]> = [];

  constructor() {
    const coil = coilPoints();
    const pts: THREE.Vector3[] = [
      NODES.srcPlus,
      NODES.cornerBL,
      NODES.swA,
      NODES.swB,
      NODES.resA,
      NODES.resB,
      NODES.cornerBR,
      NODES.indA,
      ...coil,
      NODES.indB,
      NODES.cornerFR,
      NODES.capA,
      new THREE.Vector3(CAP.plateA_x, WIRE_Y, CAP.z),
      new THREE.Vector3(CAP.plateB_x, WIRE_Y, CAP.z),
      NODES.capB,
      NODES.cornerFL,
      NODES.srcMinus,
      NODES.srcPlus, // a través de la fuente (de − a +)
    ];
    this.points = pts;
    this.cum = new Float64Array(pts.length);
    for (let k = 1; k < pts.length; k++) this.cum[k] = this.cum[k - 1] + pts[k].distanceTo(pts[k - 1]);
    this.length = this.cum[pts.length - 1];
    const gapStart = pts.findIndex((p) => p.z === CAP.z && p.x === CAP.plateA_x);
    this.hidden.push([this.cum[gapStart], this.cum[gapStart + 1]]);
  }

  /** Escribe en `out` el punto a longitud de arco s (módulo la longitud total). */
  pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    const L = this.length;
    s = ((s % L) + L) % L;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo];
    const u = seg > 0 ? (s - this.cum[lo]) / seg : 0;
    return out.lerpVectors(this.points[lo], this.points[hi], u);
  }

  isHidden(s: number): boolean {
    const L = this.length;
    s = ((s % L) + L) % L;
    for (const [a, b] of this.hidden) if (s > a && s < b) return true;
    return false;
  }
}
