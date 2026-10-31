/**
 * Gráfica "COMPARACIÓN DE SOLUCIONES": q_RK4(t) y q_analítico(t) superpuestas,
 * y debajo error(t) = |q_RK4 − q_analítico| con su máximo.
 * Se recalcula solo cuando cambia la configuración (no en cada frame).
 */
import { compareSolutions, type ComparisonResult } from '../physics/SolutionComparison';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from './CanvasPlot';

/** Tope de pasos RK4 para la comparación (protege la interfaz con h muy pequeño). */
const MAX_STEPS = 200_000;
const MAX_POINTS = 1500;

export class SolutionComparisonChart extends CanvasPlot {
  result: ComparisonResult | null = null;
  tEnd = 0;
  private dirty = true;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
    private readonly onResult: (r: ComparisonResult, tEnd: number, h: number) => void,
  ) {
    super(canvas);
  }

  invalidate(): void {
    this.dirty = true;
  }

  protected override resize(): void {
    super.resize();
    this.dirty = true;
  }

  private compute(): void {
    const e = this.engine;
    const h = e.h;
    this.tEnd = Math.min(e.scales.horizon, MAX_STEPS * h);
    const steps = Math.round(this.tEnd / h);
    const every = Math.max(1, Math.ceil(steps / MAX_POINTS));
    this.result = compareSolutions(e.params, e.excitation, e.initial, this.tEnd, h, every);
    this.onResult(this.result, this.tEnd, h);
  }

  draw(): void {
    if (!this.dirty || !this.visible) return;
    this.dirty = false;
    this.compute();
    const r = this.result!;
    const c = this.ctx;
    this.clear();
    const pad = 10;
    const W = this.w - 2 * pad;
    const H1 = (this.h - 3 * pad) * 0.66;
    const H2 = this.h - 3 * pad - H1;
    const y1 = pad;
    const y2 = 2 * pad + H1;
    this.grid(pad, y1, W, H1, 10, 6);
    this.grid(pad, y2, W, H2, 10, 3);
    const n = r.t.length;
    const X = (k: number) => pad + (r.t[k] / this.tEnd) * W;
    let qMax = 1e-15;
    for (let k = 0; k < n; k++) qMax = Math.max(qMax, Math.abs(r.qExact[k]), Math.abs(r.qRK4[k]));
    const Yq = (v: number) => y1 + H1 / 2 - (v / (qMax * 1.1)) * (H1 / 2);

    c.lineWidth = 3;
    c.strokeStyle = COLORS.q;
    c.globalAlpha = 0.85;
    c.beginPath();
    for (let k = 0; k < n; k++) (k ? c.lineTo : c.moveTo).call(c, X(k), Yq(r.qRK4[k]));
    c.stroke();
    c.globalAlpha = 1;
    c.lineWidth = 1.3;
    c.strokeStyle = COLORS.exact;
    c.setLineDash([5, 4]);
    c.beginPath();
    for (let k = 0; k < n; k++) (k ? c.lineTo : c.moveTo).call(c, X(k), Yq(r.qExact[k]));
    c.stroke();
    c.setLineDash([]);

    const eMax = Math.max(r.maxError, 1e-300);
    const Ye = (v: number) => y2 + H2 - (v / eMax) * H2 * 0.9;
    c.strokeStyle = COLORS.error;
    c.lineWidth = 1.2;
    c.beginPath();
    for (let k = 0; k < n; k++) (k ? c.lineTo : c.moveTo).call(c, X(k), Ye(r.error[k]));
    c.stroke();

    this.label('— q RK4', pad + 6, y1 + 10, COLORS.q);
    this.label('-- q analítica', pad + 80, y1 + 10, COLORS.exact);
    this.label(`error(t) · máx ${fmtSI(r.maxError, 'C')}`, pad + 6, y2 + 10, COLORS.error);
    this.label(`${this.tEnd.toFixed(2)} s`, this.w - pad - 4, y2 + H2 - 8, COLORS.textDim, 'right');
  }
}
