/**
 * Gráficas estáticas del informe (se dibujan al crearse, al cambiar de tamaño y
 * al cambiar de tema). Trabajan sobre las series copiadas en la captura.
 */
import type { Series } from '../analysis/Snapshot';
import { fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from '../visualization/CanvasPlot';

export type ReportChartKind = 'time' | 'energy' | 'phase';

export class ReportChart extends CanvasPlot {
  private series: Series | null = null;
  private qEq = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly kind: ReportChartKind,
  ) {
    super(canvas);
  }

  setData(series: Series, qEq: number): void {
    this.series = series;
    this.qEq = qEq;
    this.draw();
  }

  protected override resize(): void {
    super.resize();
    if (this.series) this.draw();
  }

  draw(): void {
    const s = this.series;
    if (!s || s.t.length < 2 || this.w < 10) return;
    this.clear();
    if (this.kind === 'time') this.drawTime(s);
    else if (this.kind === 'energy') this.drawEnergy(s);
    else this.drawPhase(s);
  }

  private frame() {
    const padL = 10;
    const padR = 10;
    const padT = 24;
    const padB = 20;
    return { x0: padL, y0: padT, W: this.w - padL - padR, H: this.h - padT - padB };
  }

  private drawTime(s: Series): void {
    const { x0, y0, W, H } = this.frame();
    this.grid(x0, y0, W, H, 8, 4);
    const t0 = s.t[0];
    const t1 = s.t[s.t.length - 1];
    const X = (t: number) => x0 + ((t - t0) / (t1 - t0 || 1)) * W;
    const plot = (arr: number[], color: string, dashed = false) => {
      let m = 1e-300;
      for (const v of arr) m = Math.max(m, Math.abs(v));
      const c = this.ctx;
      c.strokeStyle = color;
      c.lineWidth = 1.8;
      c.setLineDash(dashed ? [5, 4] : []);
      c.beginPath();
      arr.forEach((v, k) => {
        const x = X(s.t[k]);
        const y = y0 + H / 2 - (v / (m * 1.1)) * (H / 2);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.stroke();
      c.setLineDash([]);
      return m;
    };
    const mq = plot(s.q, COLORS.q);
    const mi = plot(s.i, COLORS.i);
    if (this.qEq !== 0) {
      const y = y0 + H / 2 - (this.qEq / (mq * 1.1)) * (H / 2);
      this.ctx.strokeStyle = COLORS.cursor;
      this.ctx.setLineDash([3, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(x0, y);
      this.ctx.lineTo(x0 + W, y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.label('C·E₀', x0 + W - 2, y - 8, COLORS.textDim, 'right');
    }
    this.label(`q(t) ±${fmtSI(mq * 1.1, 'C')}`, x0, 10, COLORS.q);
    this.label(`i(t) ±${fmtSI(mi * 1.1, 'A')}`, x0 + W, 10, COLORS.i, 'right');
    this.label(`${t0.toFixed(2)} s`, x0, this.h - 8);
    this.label(`${t1.toFixed(2)} s`, x0 + W, this.h - 8, COLORS.textDim, 'right');
  }

  private drawEnergy(s: Series): void {
    const { x0, y0, W, H } = this.frame();
    this.grid(x0, y0, W, H, 8, 4);
    const n = s.t.length;
    let m = 1e-300;
    for (let k = 0; k < n; k++) m = Math.max(m, s.EC[k] + s.EL[k]);
    const t0 = s.t[0];
    const t1 = s.t[n - 1];
    const X = (t: number) => x0 + ((t - t0) / (t1 - t0 || 1)) * W;
    const Y = (v: number) => y0 + H - (v / (m * 1.08)) * H;
    const c = this.ctx;
    const area = (lower: (k: number) => number, upper: (k: number) => number, color: string) => {
      c.beginPath();
      for (let k = 0; k < n; k++) c.lineTo(X(s.t[k]), Y(upper(k)));
      for (let k = n - 1; k >= 0; k--) c.lineTo(X(s.t[k]), Y(lower(k)));
      c.closePath();
      c.globalAlpha = 0.55;
      c.fillStyle = color;
      c.fill();
      c.globalAlpha = 1;
    };
    area(() => 0, (k) => s.EC[k], COLORS.VC);
    area((k) => s.EC[k], (k) => s.EC[k] + s.EL[k], COLORS.VL);
    this.label('E_C', x0, 10, COLORS.VC);
    this.label('E_L', x0 + 40, 10, COLORS.VL);
    this.label(`máx ${fmtSI(m, 'J')}`, x0 + W, 10, COLORS.textDim, 'right');
    this.label(`${t0.toFixed(2)} s`, x0, this.h - 8);
    this.label(`${t1.toFixed(2)} s`, x0 + W, this.h - 8, COLORS.textDim, 'right');
  }

  private drawPhase(s: Series): void {
    const { x0, y0, W, H } = this.frame();
    this.grid(x0, y0, W, H, 6, 6);
    let mq = 1e-300;
    let mi = 1e-300;
    for (let k = 0; k < s.q.length; k++) {
      mq = Math.max(mq, Math.abs(s.q[k]));
      mi = Math.max(mi, Math.abs(s.i[k]));
    }
    const X = (q: number) => x0 + W / 2 + (q / (mq * 1.1)) * (W / 2);
    const Y = (i: number) => y0 + H / 2 - (i / (mi * 1.1)) * (H / 2);
    const c = this.ctx;
    const n = s.q.length;
    const chunks = 8;
    const per = Math.ceil(n / chunks);
    c.lineWidth = 1.6;
    for (let k = 0; k < chunks; k++) {
      const a = k * per;
      const b = Math.min(n, a + per + 1);
      if (b - a < 2) continue;
      c.strokeStyle = `rgba(${COLORS.trailRGB}, ${0.2 + (0.8 * (k + 1)) / chunks})`;
      c.beginPath();
      for (let m = a; m < b; m++) (m === a ? c.moveTo : c.lineTo).call(c, X(s.q[m]), Y(s.i[m]));
      c.stroke();
    }
    c.fillStyle = COLORS.i;
    c.beginPath();
    c.arc(X(s.q[n - 1]), Y(s.i[n - 1]), 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = COLORS.cursor;
    c.beginPath();
    c.arc(X(this.qEq), Y(0), 5, 0, Math.PI * 2);
    c.stroke();
    this.label('q →', x0 + W, y0 + H / 2 - 9, COLORS.q, 'right');
    this.label('↑ i', x0 + W / 2 + 6, 10, COLORS.i);
  }
}

/** Esquema SVG del circuito con los valores de la captura. */
export function circuitDiagram(R: string, L: string, C: string, E: string, kind: string): string {
  const src =
    kind === 'sine'
      ? '<circle cx="40" cy="80" r="16" class="sym"/><path d="M30 80q5-9 10 0t10 0" class="sym"/>'
      : kind === 'step'
        ? '<line x1="28" y1="72" x2="52" y2="72" class="sym"/><line x1="33" y1="86" x2="47" y2="86" class="sym"/><text x="56" y="70" class="sgn">+</text>'
        : '<line x1="30" y1="80" x2="50" y2="80" class="sym dim"/>';
  return `<svg viewBox="0 0 320 170" class="circuit-svg" role="img" aria-label="Esquema del circuito RLC en serie">
    <path d="M40 64V20h60M140 20h40M236 20h44v52M280 112v38H210M150 150H40V96" class="wire"/>
    ${src}
    <path d="M100 20l5-8 10 16 10-16 10 16 5-8" class="sym r"/>
    <path d="M180 20c0-12 14-12 14 0c0-12 14-12 14 0c0-12 14-12 14 0c0-12 14-12 14 0" class="sym l"/>
    <line x1="266" y1="72" x2="294" y2="72" class="sym c"/><line x1="266" y1="82" x2="294" y2="82" class="sym c"/><path d="M280 82v30" class="wire"/>
    <path d="M150 150l20-12M190 150h20" class="sym"/><circle cx="150" cy="150" r="2.5" class="dot"/><circle cx="190" cy="150" r="2.5" class="dot"/>
    <text x="120" y="48" class="val r">R = ${R}</text>
    <text x="207" y="48" class="val l">L = ${L}</text>
    <text x="234" y="100" class="val c" text-anchor="end">C = ${C}</text>
    <text x="62" y="112" class="val e">E = ${E}</text>
    <text x="170" y="134" class="val s" text-anchor="middle">S</text>
    <path d="M70 34h18l-5-4m5 4l-5 4" class="arrow"/><text x="66" y="46" class="val i">i</text>
  </svg>`;
}
