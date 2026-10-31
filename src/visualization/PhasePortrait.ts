/**
 * Retrato de fase: q en el eje X, i = q' en el eje Y.
 * Subamortiguado → espiral hacia el equilibrio; R = 0 → curva cerrada (elipse);
 * sobreamortiguado/crítico → llegada directa sin girar.
 */
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from './CanvasPlot';

export class PhasePortrait extends CanvasPlot {
  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
  }

  draw(): void {
    if (!this.visible) return;
    const c = this.ctx;
    const pad = 18;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad;
    this.clear();
    this.grid(pad, pad, W, H, 8, 8);
    const { scales, history: hist, excitation, params } = this.engine;
    const sx = W / 2 / (scales.q * 1.1);
    const sy = H / 2 / (scales.i * 1.1);
    const cx = pad + W / 2;
    const cy = pad + H / 2;
    const X = (q: number) => cx + q * sx;
    const Y = (i: number) => cy - i * sy;

    // Punto de equilibrio: q = C·E₀ para el escalón, 0 en los demás casos
    const qEq = excitation.kind === 'step' ? params.C * excitation.E0 : 0;
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(X(qEq), Y(0), 5, 0, Math.PI * 2);
    c.stroke();

    const n = hist.length;
    if (n > 1) {
      const stride = Math.max(1, Math.floor(n / 2500));
      const chunks = 10;
      const per = Math.ceil(n / chunks);
      c.lineWidth = 1.5;
      c.lineJoin = 'round';
      for (let k = 0; k < chunks; k++) {
        const a = k * per;
        const b = Math.min(n, a + per + 1);
        if (b - a < 2) continue;
        c.strokeStyle = `rgba(79, 195, 255, ${0.15 + (0.85 * (k + 1)) / chunks})`;
        c.beginPath();
        for (let m = a; m < b; m += stride) {
          const x = X(hist.get('q', m));
          const y = Y(hist.get('i', m));
          if (m === a) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      const q = hist.get('q', n - 1);
      const i = hist.get('i', n - 1);
      c.fillStyle = COLORS.i;
      c.shadowColor = COLORS.i;
      c.shadowBlur = 10;
      c.beginPath();
      c.arc(X(q), Y(i), 4, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
    this.label('q →', this.w - pad, cy - 8, COLORS.q, 'right');
    this.label('↑ i', cx + 6, pad + 6, COLORS.i);
    this.label(`±${fmtSI(scales.q * 1.1, 'C')}`, this.w - pad, this.h - 8, COLORS.textDim, 'right');
    this.label(`±${fmtSI(scales.i * 1.1, 'A')}`, pad, 8, COLORS.textDim);
  }
}
