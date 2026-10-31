/**
 * Búfer circular de muestras de la simulación (tamaño fijo, sin asignaciones
 * durante la ejecución). Lo leen el osciloscopio y el retrato de fase.
 */
export const HISTORY_CHANNELS = ['t', 'q', 'i', 'VL', 'VC', 'E'] as const;
export type HistoryChannel = (typeof HISTORY_CHANNELS)[number];

export class History {
  readonly capacity: number;
  private readonly data: Record<HistoryChannel, Float64Array>;
  private head = 0; // índice donde se escribirá la próxima muestra
  private count = 0;

  constructor(capacity = 8192) {
    this.capacity = capacity;
    this.data = {} as Record<HistoryChannel, Float64Array>;
    for (const ch of HISTORY_CHANNELS) this.data[ch] = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(t: number, q: number, i: number, VL: number, VC: number, E: number): void {
    const k = this.head;
    const d = this.data;
    d.t[k] = t;
    d.q[k] = q;
    d.i[k] = i;
    d.VL[k] = VL;
    d.VC[k] = VC;
    d.E[k] = E;
    this.head = (k + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Muestra n-ésima en orden cronológico (0 = la más antigua conservada). */
  get(channel: HistoryChannel, n: number): number {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    return this.data[channel][(start + n) % this.capacity];
  }

  /** Índice cronológico de la primera muestra con t ≥ tMin (búsqueda binaria). */
  indexAtTime(tMin: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.get('t', mid) < tMin) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  latestTime(): number {
    return this.count === 0 ? 0 : this.get('t', this.count - 1);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
