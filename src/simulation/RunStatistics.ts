/**
 * Estadísticas acumuladas durante TODA la corrida (no solo la ventana del
 * historial). Se actualizan en cada paso físico, sin asignar memoria:
 *
 *   W_fuente = ∫ E(t)·i dt     energía entregada por la fuente   [J]
 *   W_R      = ∫ R·i² dt       energía disipada en el resistor   [J]
 *   máximos de |q|, |i|, |V_L|, |V_C|, P_R y sus instantes
 *   extremos de q (cuando i cambia de signo) → período y decremento medidos
 *   cruces de q por su valor de equilibrio y última salida de la banda del 2 %
 *
 * Las integrales usan la regla del trapecio con los valores de cada paso h.
 */
const MAX_EVENTS = 256;

export class RunStatistics {
  steps = 0;
  tEnd = 0;
  energyDelivered = 0;
  energyDissipated = 0;
  maxAbsQ = 0;
  tMaxAbsQ = 0;
  maxAbsI = 0;
  tMaxAbsI = 0;
  maxAbsVL = 0;
  maxAbsVC = 0;
  maxPR = 0;
  /** q máxima y mínima alcanzadas (con signo). */
  qMax = -Infinity;
  qMin = Infinity;
  /** Extremos de q: instantes y valores (i cambia de signo). */
  readonly extremaT = new Float64Array(MAX_EVENTS);
  readonly extremaQ = new Float64Array(MAX_EVENTS);
  extremaCount = 0;
  /** Cruces de q por q_ref. */
  crossings = 0;
  /** Último instante en que |q − q_ref| superó la banda de establecimiento. */
  lastOutsideBand = 0;

  qRef = 0;
  band = 0;
  private prevP = 0;
  private prevPR = 0;
  private prevI = 0;
  private prevDev = 0;

  /** Reinicia con el estado inicial y la referencia de equilibrio. */
  reset(q0: number, i0: number, E0: number, R: number, qRef: number, band: number): void {
    this.steps = 0;
    this.tEnd = 0;
    this.energyDelivered = 0;
    this.energyDissipated = 0;
    this.maxAbsQ = Math.abs(q0);
    this.tMaxAbsQ = 0;
    this.maxAbsI = Math.abs(i0);
    this.tMaxAbsI = 0;
    this.maxAbsVL = 0;
    this.maxAbsVC = 0;
    this.maxPR = i0 * i0 * R;
    this.qMax = q0;
    this.qMin = q0;
    this.extremaCount = 0;
    this.crossings = 0;
    this.qRef = qRef;
    this.band = band;
    this.lastOutsideBand = Math.abs(q0 - qRef) > band ? 0 : -1;
    this.prevP = E0 * i0;
    this.prevPR = R * i0 * i0;
    this.prevI = i0;
    this.prevDev = q0 - qRef;
  }

  /** Registra el estado tras un paso de tamaño h que terminó en t. */
  onStep(t: number, h: number, q: number, i: number, E: number, R: number, VL: number, VC: number): void {
    this.steps++;
    this.tEnd = t;
    const P = E * i;
    const PR = R * i * i;
    this.energyDelivered += 0.5 * h * (this.prevP + P);
    this.energyDissipated += 0.5 * h * (this.prevPR + PR);
    this.prevP = P;
    this.prevPR = PR;

    const aq = Math.abs(q);
    if (aq > this.maxAbsQ) {
      this.maxAbsQ = aq;
      this.tMaxAbsQ = t;
    }
    const ai = Math.abs(i);
    if (ai > this.maxAbsI) {
      this.maxAbsI = ai;
      this.tMaxAbsI = t;
    }
    if (q > this.qMax) this.qMax = q;
    if (q < this.qMin) this.qMin = q;
    const avl = Math.abs(VL);
    if (avl > this.maxAbsVL) this.maxAbsVL = avl;
    const avc = Math.abs(VC);
    if (avc > this.maxAbsVC) this.maxAbsVC = avc;
    if (PR > this.maxPR) this.maxPR = PR;

    // Extremo de q ⇔ i = dq/dt cambia de signo (se interpola el instante)
    if ((this.prevI > 0 && i <= 0) || (this.prevI < 0 && i >= 0)) {
      if (this.extremaCount < MAX_EVENTS) {
        const frac = this.prevI / (this.prevI - i);
        this.extremaT[this.extremaCount] = t - h + frac * h;
        this.extremaQ[this.extremaCount] = q;
        this.extremaCount++;
      }
    }
    this.prevI = i;

    const dev = q - this.qRef;
    if ((this.prevDev > 0 && dev <= 0) || (this.prevDev < 0 && dev >= 0)) this.crossings++;
    this.prevDev = dev;
    if (Math.abs(dev) > this.band) this.lastOutsideBand = t;
  }
}
