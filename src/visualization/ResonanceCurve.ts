/**
 * Curva de resonancia |I(ω)| = E₀/√(R² + (ωL − 1/(ωC))²) con la banda de
 * media potencia [ω₀ − α, ω₀ + α] y marcadores en ω₀ y en la ω actual.
 */
import { analyzeResonance, currentAmplitude } from '../physics/Resonance';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from './CanvasPlot';

export class ResonanceCurve extends CanvasPlot {
  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  draw(): void {
    if (!this.visible) return;
    const { params, excitation } = this.engine;
    const E0 = excitation.E0 || 1;
    const info = analyzeResonance(params, E0, excitation.omega);
    const wMax = Math.max(2.5 * info.omega0, 1.2 * excitation.omega);
    const pad = 14;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad - 10;
    const c = this.ctx;
    this.clear();
    this.grid(pad, pad, W, H, 10, 4);
    const N = 400;
    // Para R = 0 el pico es infinito: se recorta al máximo de la ventana visible.
    let iMax = 0;
    for (let k = 1; k <= N; k++) {
      const v = currentAmplitude(params, E0, (wMax * k) / N);
      if (Number.isFinite(v)) iMax = Math.max(iMax, v);
    }
    if (Number.isFinite(info.peakCurrent)) iMax = Math.max(iMax, info.peakCurrent);
    const X = (w: number) => pad + (w / wMax) * W;
    const Y = (v: number) => pad + H - Math.min(1.05, v / (iMax * 1.1)) * H;

    c.fillStyle = 'rgba(255, 179, 71, 0.08)';
    c.fillRect(X(info.omega0 - info.halfBandwidth), pad, X(info.omega0 + info.halfBandwidth) - X(info.omega0 - info.halfBandwidth), H);

    c.strokeStyle = COLORS.i;
    c.lineWidth = 1.8;
    c.beginPath();
    for (let k = 1; k <= N; k++) {
      const w = (wMax * k) / N;
      const y = Y(currentAmplitude(params, E0, w));
      if (k === 1) c.moveTo(X(w), y);
      else c.lineTo(X(w), y);
    }
    c.stroke();

    const vline = (w: number, color: string, dash: number[]) => {
      c.strokeStyle = color;
      c.setLineDash(dash);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X(w) + 0.5, pad);
      c.lineTo(X(w) + 0.5, pad + H);
      c.stroke();
      c.setLineDash([]);
    };
    vline(info.omega0, 'rgba(255,255,255,0.45)', [4, 4]);
    if (excitation.kind === 'sine') {
      vline(excitation.omega, info.near ? COLORS.error : COLORS.q, []);
      const v = currentAmplitude(params, E0, excitation.omega);
      c.fillStyle = info.near ? COLORS.error : COLORS.q;
      c.beginPath();
      c.arc(X(excitation.omega), Y(Number.isFinite(v) ? v : iMax * 1.1), 4, 0, Math.PI * 2);
      c.fill();
    }
    this.label('ω₀', X(info.omega0) + 4, pad + 8, COLORS.text);
    this.label(`|I(ω)| máx ${fmtSI(info.peakCurrent, 'A')}`, pad + 4, this.h - 10, COLORS.i);
    this.label(`ω → ${wMax.toFixed(0)} rad/s`, this.w - pad, this.h - 10, COLORS.textDim, 'right');
  }
}
