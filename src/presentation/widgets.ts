/**
 * Widgets animados de la presentación. Todos leen datos reales: el estado del
 * motor de simulación o la solución exacta de la ecuación.
 */
import { solveAnalytically } from '../physics/AnalyticalSolver';
import { classifyDamping } from '../physics/DampingClassifier';
import { analyzeResonance, currentAmplitude } from '../physics/Resonance';
import { createRLCDerivative, type RLCParams } from '../physics/RLCModel';
import { stepExcitation } from '../physics/Excitation';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI, fmtNum } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from '../visualization/CanvasPlot';

export interface Widget {
  update(dt: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
/** Barras en vivo (|valor| / escala) con lectura numérica. */
export class LiveMeters implements Widget {
  private readonly rows: Array<{ fill: HTMLElement; val: HTMLElement; get: () => number; scale: () => number; unit: string }> = [];
  private acc = 0;

  constructor(root: HTMLElement, items: Array<{ label: string; color: string; unit: string; get: () => number; scale: () => number }>) {
    root.classList.add('meters');
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'meter';
      row.innerHTML = `<span class="m-label">${it.label}</span><span class="m-bar"><i style="background:${it.color}"></i></span><span class="m-val mono"></span>`;
      root.appendChild(row);
      this.rows.push({ fill: row.querySelector('i')!, val: row.querySelector('.m-val')!, get: it.get, scale: it.scale, unit: it.unit });
    }
  }

  update(dt: number): void {
    this.acc += dt;
    for (const r of this.rows) {
      const v = r.get();
      r.fill.style.width = `${Math.min(100, (100 * Math.abs(v)) / Math.max(r.scale(), 1e-15))}%`;
    }
    if (this.acc > 0.1) {
      this.acc = 0;
      for (const r of this.rows) r.val.textContent = fmtSI(r.get(), r.unit);
    }
  }

  dispose(): void {}
}

// ---------------------------------------------------------------------------
/** Paso de RK4 animado sobre el plano (t, q): pendientes k₁…k₄ y su promedio. */
export class RK4Widget extends CanvasPlot implements Widget {
  private readonly params: RLCParams = { R: 2, L: 0.5, C: 0.02 };
  private readonly f = createRLCDerivative(this.params, stepExcitation(10));
  private readonly exact = solveAnalytically(this.params, stepExcitation(10), { q0: 0, i0: 0 });
  private readonly hs = 0.11;
  private readonly tMax = 1.25;
  private clock = 0;
  private stepIndex = 0;
  private x = [0, 0];
  private pts: Array<[number, number]> = [[0, 0]];

  update(dt: number): void {
    this.clock += dt;
    const PHASE = 3.4;
    if (this.clock > PHASE) {
      this.clock = 0;
      const s = this.stages(this.stepIndex * this.hs, this.x);
      this.x = s.next;
      this.stepIndex++;
      this.pts.push([this.stepIndex * this.hs, this.x[0]]);
      if ((this.stepIndex + 1) * this.hs > this.tMax) {
        this.stepIndex = 0;
        this.x = [0, 0];
        this.pts = [[0, 0]];
      }
    }
    this.draw();
  }

  private stages(t: number, x: number[]) {
    const ev = (tt: number, xx: number[]) => {
      const o = new Float64Array(2);
      this.f(tt, Float64Array.from(xx), o);
      return [o[0], o[1]];
    };
    const h = this.hs;
    const k1 = ev(t, x);
    const x2 = [x[0] + (h / 2) * k1[0], x[1] + (h / 2) * k1[1]];
    const k2 = ev(t + h / 2, x2);
    const x3 = [x[0] + (h / 2) * k2[0], x[1] + (h / 2) * k2[1]];
    const k3 = ev(t + h / 2, x3);
    const x4 = [x[0] + h * k3[0], x[1] + h * k3[1]];
    const k4 = ev(t + h, x4);
    const next = [x[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), x[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
    return { k: [k1, k2, k3, k4], probes: [x, x2, x3, x4], next };
  }

  draw(): void {
    if (!this.visible) return;
    const c = this.ctx;
    this.clear();
    const pad = 14;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 16;
    this.grid(pad, pad, W, H, 10, 6);
    const qMax = 0.36;
    const X = (t: number) => pad + (t / this.tMax) * W;
    const Y = (q: number) => pad + H - (q / qMax) * H;

    // solución exacta
    c.strokeStyle = COLORS.exact;
    c.globalAlpha = 0.45;
    c.setLineDash([5, 4]);
    c.lineWidth = 1.3;
    c.beginPath();
    for (let k = 0; k <= 200; k++) {
      const t = (this.tMax * k) / 200;
      const q = this.exact.evaluate(t).q;
      if (k === 0) c.moveTo(X(t), Y(q));
      else c.lineTo(X(t), Y(q));
    }
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;

    // puntos RK4 ya calculados
    c.strokeStyle = COLORS.q;
    c.lineWidth = 2;
    c.beginPath();
    this.pts.forEach(([t, q], k) => (k ? c.lineTo(X(t), Y(q)) : c.moveTo(X(t), Y(q))));
    c.stroke();
    for (const [t, q] of this.pts) {
      c.fillStyle = COLORS.q;
      c.beginPath();
      c.arc(X(t), Y(q), 3.5, 0, Math.PI * 2);
      c.fill();
    }

    // paso en curso: k1..k4 aparecen uno tras otro
    const t0 = this.stepIndex * this.hs;
    const st = this.stages(t0, this.x);
    const phase = this.clock / 3.4;
    const colors = [COLORS.i, COLORS.VL, COLORS.VC, COLORS.error];
    const offsets = [0, this.hs / 2, this.hs / 2, this.hs];
    const shown = Math.min(4, Math.floor(phase * 5.2));
    for (let k = 0; k < shown; k++) {
      const tp = t0 + offsets[k];
      const qp = st.probes[k][0];
      const slope = st.k[k][0];
      const dx = this.hs * 0.45;
      c.strokeStyle = colors[k];
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(X(tp - dx), Y(qp - slope * dx));
      c.lineTo(X(tp + dx), Y(qp + slope * dx));
      c.stroke();
      c.fillStyle = colors[k];
      c.beginPath();
      c.arc(X(tp), Y(qp), 3, 0, Math.PI * 2);
      c.fill();
      this.label(`k${'₁₂₃₄'[k]}`, X(tp + dx) + 3, Y(qp + slope * dx) - 6, colors[k]);
    }
    if (phase > 0.8) {
      c.strokeStyle = COLORS.q;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(X(t0), Y(this.x[0]));
      c.lineTo(X(t0 + this.hs), Y(st.next[0]));
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = COLORS.q;
      c.beginPath();
      c.arc(X(t0 + this.hs), Y(st.next[0]), 5, 0, Math.PI * 2);
      c.fill();
      this.label('qₙ₊₁', X(t0 + this.hs) + 7, Y(st.next[0]) + 10, COLORS.q);
    }
    this.label('— RK4 (h grande para verlo)', pad + 4, this.h - 10, COLORS.q);
    this.label('-- solución exacta', pad + 210, this.h - 10, COLORS.textDim);
  }

}

// ---------------------------------------------------------------------------
/** Tres respuestas exactas (sub, crítico, sobre) con la actual resaltada. */
export class DampingWidget extends CanvasPlot implements Widget {
  active = 0;
  showAll = false;
  private readonly base = { L: 0.5, C: 0.02 };
  private readonly Rs = [2, 10, 30];
  private readonly tMax = 3;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  update(): void {
    this.draw();
  }

  draw(): void {
    if (!this.visible) return;
    const c = this.ctx;
    this.clear();
    const pad = 14;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 18;
    this.grid(pad, pad, W, H, 6, 4);
    const X = (t: number) => pad + (t / this.tMax) * W;
    const Y = (q: number) => pad + H - (q / 0.36) * H;
    const colors = [COLORS.q, COLORS.VC, COLORS.VL];
    const names = ['Subamortiguado', 'Crítico', 'Sobreamortiguado'];
    // valor final C·E₀
    c.strokeStyle = COLORS.cursor;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(pad, Y(0.2));
    c.lineTo(pad + W, Y(0.2));
    c.stroke();
    c.setLineDash([]);
    this.label('C·E₀', pad + W - 2, Y(0.2) - 8, COLORS.textDim, 'right');
    this.Rs.forEach((R, k) => {
      const on = this.showAll || k === this.active;
      const sol = solveAnalytically({ R, ...this.base }, stepExcitation(10), { q0: 0, i0: 0 });
      const tEnd = on && !this.showAll ? Math.min(this.tMax, this.engine.state.t) : this.tMax;
      c.strokeStyle = colors[k];
      c.globalAlpha = on ? 1 : 0.15;
      c.lineWidth = on ? 2.4 : 1.2;
      c.beginPath();
      for (let n = 0; n <= 240; n++) {
        const t = (this.tMax * n) / 240;
        if (t > tEnd) break;
        const q = sol.evaluate(t).q;
        if (n === 0) c.moveTo(X(t), Y(q));
        else c.lineTo(X(t), Y(q));
      }
      c.stroke();
      c.globalAlpha = 1;
      if (on) this.label(`${names[k]} · R = ${R} Ω`, pad + 4 + k * Math.min(170, W / 3), this.h - 10, colors[k]);
    });
  }
}

// ---------------------------------------------------------------------------
/** Curva de resonancia con marcador animado hacia la ω actual. */
export class ResonanceWidget extends CanvasPlot implements Widget {
  private shown = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  update(dt: number): void {
    const target = this.engine.excitation.omega;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt * 4));
    this.draw();
  }

  draw(): void {
    if (!this.visible) return;
    const { params, excitation } = this.engine;
    const info = analyzeResonance(params, excitation.E0, excitation.omega);
    const c = this.ctx;
    this.clear();
    const pad = 14;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 16;
    this.grid(pad, pad, W, H, 10, 4);
    const wMax = 2.2 * info.omega0;
    const peak = info.peakCurrent;
    const X = (w: number) => pad + (w / wMax) * W;
    const Y = (v: number) => pad + H - (v / (peak * 1.1)) * H;
    c.fillStyle = COLORS.band;
    c.fillRect(X(info.omega0 - info.halfBandwidth), pad, X(info.omega0 + info.halfBandwidth) - X(info.omega0 - info.halfBandwidth), H);
    c.strokeStyle = COLORS.i;
    c.lineWidth = 2.2;
    c.beginPath();
    for (let k = 1; k <= 300; k++) {
      const w = (wMax * k) / 300;
      const y = Y(currentAmplitude(params, excitation.E0, w));
      if (k === 1) c.moveTo(X(w), y);
      else c.lineTo(X(w), y);
    }
    c.stroke();
    c.strokeStyle = COLORS.cursor;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.moveTo(X(info.omega0), pad);
    c.lineTo(X(info.omega0), pad + H);
    c.stroke();
    c.setLineDash([]);
    const w = this.shown;
    const v = currentAmplitude(params, excitation.E0, w);
    c.fillStyle = COLORS.q;
    c.beginPath();
    c.arc(X(w), Y(v), 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = COLORS.q;
    c.beginPath();
    c.moveTo(X(w), Y(v));
    c.lineTo(X(w), pad + H);
    c.stroke();
    this.label('ω₀', X(info.omega0) + 4, pad + 8, COLORS.text);
    this.label(`ω = ${fmtNum(w, 3)} rad/s`, X(w) + 10, Y(v) - 4, COLORS.q);
    this.label(`|I| = ${fmtSI(v, 'A')} (${fmtNum((100 * v) / peak, 3)} % de E₀/R)`, pad + 4, this.h - 10, COLORS.i);
  }
}

// ---------------------------------------------------------------------------
/** Energías apiladas en vivo desde el historial: E_C, E_L, W_R y el total. */
export class EnergyWidget extends CanvasPlot implements Widget {
  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  update(): void {
    this.draw();
  }

  draw(): void {
    if (!this.visible) return;
    const e = this.engine;
    const hist = e.history;
    const n = hist.length;
    const c = this.ctx;
    this.clear();
    const pad = 14;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 16;
    this.grid(pad, pad, W, H, 8, 4);
    if (n < 2) return;
    const { L, C, R } = e.params;
    const tSpan = Math.max(4, hist.latestTime());
    const X = (t: number) => pad + (t / tSpan) * W;
    const E0 = (e.initial.q0 ** 2) / (2 * C) + 0.5 * L * e.initial.i0 ** 2;
    const total = E0 + e.state.Wsrc;
    const top = Math.max(total, e.scales.energy, 1e-15) * 1.1;
    const Y = (v: number) => pad + H - (v / top) * H;
    const stride = Math.max(1, Math.floor(n / 500));
    const ts: number[] = [];
    const ec: number[] = [];
    const el: number[] = [];
    const wr: number[] = [];
    let w = 0;
    let prevT = hist.get('t', 0);
    let prevP = R * hist.get('i', 0) ** 2;
    for (let k = 0; k < n; k++) {
      const t = hist.get('t', k);
      const i = hist.get('i', k);
      const P = R * i * i;
      w += 0.5 * (t - prevT) * (P + prevP);
      prevT = t;
      prevP = P;
      if (k % stride === 0 || k === n - 1) {
        const q = hist.get('q', k);
        ts.push(t);
        ec.push((q * q) / (2 * C));
        el.push(0.5 * L * i * i);
        wr.push(w);
      }
    }
    const band = (lo: (k: number) => number, hi: (k: number) => number, color: string) => {
      c.beginPath();
      for (let k = 0; k < ts.length; k++) c.lineTo(X(ts[k]), Y(hi(k)));
      for (let k = ts.length - 1; k >= 0; k--) c.lineTo(X(ts[k]), Y(lo(k)));
      c.closePath();
      c.globalAlpha = 0.6;
      c.fillStyle = color;
      c.fill();
      c.globalAlpha = 1;
    };
    band(() => 0, (k) => ec[k], COLORS.VC);
    band((k) => ec[k], (k) => ec[k] + el[k], COLORS.VL);
    band((k) => ec[k] + el[k], (k) => ec[k] + el[k] + wr[k], COLORS.i);
    c.strokeStyle = COLORS.exact;
    c.setLineDash([5, 4]);
    c.beginPath();
    c.moveTo(pad, Y(total));
    c.lineTo(pad + W, Y(total));
    c.stroke();
    c.setLineDash([]);
    this.label('E_C', pad + 4, this.h - 10, COLORS.VC);
    this.label('E_L', pad + 44, this.h - 10, COLORS.VL);
    this.label('W_R (calor)', pad + 84, this.h - 10, COLORS.i);
    this.label(`total = ${fmtSI(total, 'J')}`, pad + W, Y(total) - 8, COLORS.text, 'right');
  }
}

// ---------------------------------------------------------------------------
/** Capacitor: recta V = q/C y energía almacenada como área del triángulo. */
export class CapacitorWidget extends CanvasPlot implements Widget {
  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  update(): void {
    this.draw();
  }

  draw(): void {
    if (!this.visible) return;
    const e = this.engine;
    const c = this.ctx;
    this.clear();
    const pad = 16;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 16;
    this.grid(pad, pad, W, H, 6, 4);
    const qMax = e.scales.q * 1.1;
    const vMax = qMax / e.params.C;
    const X = (q: number) => pad + (q / qMax) * W;
    const Y = (v: number) => pad + H - (v / vMax) * H;
    const q = Math.abs(e.state.q);
    c.fillStyle = COLORS.VC;
    c.globalAlpha = 0.25;
    c.beginPath();
    c.moveTo(X(0), Y(0));
    c.lineTo(X(q), Y(0));
    c.lineTo(X(q), Y(q / e.params.C));
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = COLORS.VC;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(X(0), Y(0));
    c.lineTo(X(qMax), Y(vMax));
    c.stroke();
    c.fillStyle = COLORS.q;
    c.beginPath();
    c.arc(X(q), Y(q / e.params.C), 6, 0, Math.PI * 2);
    c.fill();
    this.label('q →', pad + W, Y(0) - 8, COLORS.q, 'right');
    this.label('↑ V_C = q/C', pad + 4, pad + 8, COLORS.VC);
    this.label(`área = q²/2C = ${fmtSI(e.state.EC, 'J')}`, pad + 4, this.h - 10, COLORS.VC);
  }
}

/** Regímenes del widget de amortiguamiento (para textos coherentes con el widget). */
export function dampingInfo(R: number) {
  return classifyDamping({ R, L: 0.5, C: 0.02 });
}
