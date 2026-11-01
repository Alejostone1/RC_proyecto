/**
 * Osciloscopio digital de 4 canales sobre el historial de la simulación.
 *   A: q(t)   B: i(t)   C: V_L(t)   D: V_C(t)
 * Cada canal se escala con su máximo físico (PhysicalScales) para ocupar
 * ±4 divisiones; el zoom vertical multiplica esa ganancia.
 */
import type { HistoryChannel } from '../simulation/History';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI } from '../utils/Format';
import { COLORS } from '../utils/Theme';
import { CanvasPlot } from './CanvasPlot';

export interface ScopeChannel {
  id: 'A' | 'B' | 'C' | 'D';
  key: HistoryChannel & ('q' | 'i' | 'VL' | 'VC');
  label: string;
  unit: string;
  color: string;
  enabled: boolean;
}

export const TIME_DIVS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];
const NX = 10;
const NY = 8;

export class Oscilloscope extends CanvasPlot {
  readonly channels: ScopeChannel[] = [
    { id: 'A', key: 'q', label: 'q(t)', unit: 'C', get color() { return COLORS.q; }, enabled: true },
    { id: 'B', key: 'i', label: 'i(t)', unit: 'A', get color() { return COLORS.i; }, enabled: true },
    { id: 'C', key: 'VL', label: 'V_L(t)', unit: 'V', get color() { return COLORS.VL; }, enabled: false },
    { id: 'D', key: 'VC', label: 'V_C(t)', unit: 'V', get color() { return COLORS.VC; }, enabled: false },
  ];
  timeDiv = 0.5;
  zoom = 1;
  held = false;
  private heldEnd = 0;
  /** Inicio visible tras "reiniciar pantalla" (no borra datos de la simulación). */
  private clearedAt = -Infinity;
  private cursorX: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: SimulationEngine,
  ) {
    super(canvas);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.cursorX = e.clientX - r.left;
    });
    canvas.addEventListener('pointerleave', () => (this.cursorX = null));
  }

  setHeld(held: boolean): void {
    this.held = held;
    this.heldEnd = this.engine.state.t;
  }

  clearScreen(): void {
    this.clearedAt = this.engine.state.t;
  }

  resetView(): void {
    this.clearedAt = -Infinity;
  }

  /** Elige s/div para que la ventana cubra ~ el horizonte representativo. */
  autoTimeDiv(horizon: number): void {
    const target = Math.min(horizon, this.engine.historySpan) / NX;
    this.timeDiv = TIME_DIVS.reduce((best, d) => (Math.abs(Math.log(d / target)) < Math.abs(Math.log(best / target)) ? d : best), TIME_DIVS[0]);
  }

  draw(): void {
    if (!this.visible) return;
    const c = this.ctx;
    const padL = 8;
    const padR = 8;
    const padT = 22;
    const padB = 18;
    const W = this.w - padL - padR;
    const H = this.h - padT - padB;
    this.clear();
    this.grid(padL, padT, W, H, NX, NY);

    const hist = this.engine.history;
    const span = this.timeDiv * NX;
    const tEnd = Math.max(this.held ? this.heldEnd : this.engine.state.t, span);
    const tStart = tEnd - span;
    const from = hist.indexAtTime(Math.max(tStart, this.clearedAt));
    const to = hist.length;
    const stride = Math.max(1, Math.floor((to - from) / (W * 1.5)));
    const scales = this.engine.scales;
    const xOf = (t: number) => padL + ((t - tStart) / span) * W;

    c.save();
    c.beginPath();
    c.rect(padL, padT, W, H);
    c.clip();
    c.lineWidth = 1.6;
    c.lineJoin = 'round';
    for (const ch of this.channels) {
      if (!ch.enabled || to - from < 2) continue;
      const gain = ((H / 2) * this.zoom) / (scales[ch.key] * 1.05);
      const y0 = padT + H / 2;
      c.strokeStyle = ch.color;
      c.shadowColor = ch.color;
      c.shadowBlur = COLORS.glow;
      c.beginPath();
      for (let n = from; n < to; n += stride) {
        const x = xOf(hist.get('t', n));
        const y = y0 - hist.get(ch.key, n) * gain;
        if (n === from) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
    c.shadowBlur = 0;

    // Etiquetas de canal y escala por división
    let lx = padL + 4;
    for (const ch of this.channels) {
      const perDiv = (scales[ch.key] * 1.05) / (NY / 2) / this.zoom;
      const text = `${ch.id} ${ch.label} ${fmtSI(perDiv, ch.unit)}/div`;
      this.label(text, lx, 10, ch.enabled ? ch.color : COLORS.textDim);
      lx += c.measureText(text).width + 14;
    }
    this.label(`${fmtSI(this.timeDiv, 's')}/div${this.held ? '  ■ HOLD' : ''}`, this.w - padR - 4, this.h - 8, COLORS.textDim, 'right');
    this.label(`t = ${tEnd.toFixed(3)} s`, padL + 4, this.h - 8, COLORS.textDim);

    // Cursor de medición
    if (this.cursorX !== null && this.cursorX > padL && this.cursorX < padL + W && to > from) {
      const tc = tStart + ((this.cursorX - padL) / W) * span;
      const n = Math.min(to - 1, Math.max(from, hist.indexAtTime(tc)));
      const x = xOf(hist.get('t', n));
      c.strokeStyle = COLORS.cursor;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(x + 0.5, padT);
      c.lineTo(x + 0.5, padT + H);
      c.stroke();
      c.setLineDash([]);
      const lines = [`t = ${hist.get('t', n).toFixed(4)} s`];
      for (const ch of this.channels) if (ch.enabled) lines.push(`${ch.label} = ${fmtSI(hist.get(ch.key, n), ch.unit)}`);
      const bx = x + 150 > this.w ? x - 150 : x + 8;
      c.fillStyle = COLORS.tooltip;
      c.fillRect(bx, padT + 4, 142, 16 * lines.length + 6);
      lines.forEach((l, k) => this.label(l, bx + 6, padT + 14 + k * 16, k === 0 ? COLORS.text : this.channels.filter((ch) => ch.enabled)[k - 1].color));
    }
  }
}
