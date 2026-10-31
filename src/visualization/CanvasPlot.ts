/**
 * Base mínima para gráficas Canvas 2D: alta densidad de píxeles, redimensionado
 * automático y utilidades de rejilla. Las subclases implementan `draw()`.
 */
import { COLORS } from '../utils/Theme';

export abstract class CanvasPlot {
  readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected w = 1;
  protected h = 1;
  private readonly observer: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  protected resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Solo dibuja si el canvas está visible (ahorra trabajo con pestañas ocultas). */
  get visible(): boolean {
    return this.canvas.offsetParent !== null && this.w > 2 && this.h > 2;
  }

  protected clear(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  protected grid(x0: number, y0: number, w: number, h: number, nx: number, ny: number): void {
    const c = this.ctx;
    c.lineWidth = 1;
    c.strokeStyle = COLORS.grid;
    c.beginPath();
    for (let k = 0; k <= nx; k++) {
      const x = Math.round(x0 + (w * k) / nx) + 0.5;
      c.moveTo(x, y0);
      c.lineTo(x, y0 + h);
    }
    for (let k = 0; k <= ny; k++) {
      const y = Math.round(y0 + (h * k) / ny) + 0.5;
      c.moveTo(x0, y);
      c.lineTo(x0 + w, y);
    }
    c.stroke();
    c.strokeStyle = COLORS.gridStrong;
    c.beginPath();
    const xm = Math.round(x0 + w / 2) + 0.5;
    const ym = Math.round(y0 + h / 2) + 0.5;
    c.moveTo(x0, ym);
    c.lineTo(x0 + w, ym);
    c.moveTo(xm, y0);
    c.lineTo(xm, y0 + h);
    c.stroke();
  }

  protected label(text: string, x: number, y: number, color: string = COLORS.textDim, align: CanvasTextAlign = 'left', size = 11): void {
    const c = this.ctx;
    c.font = `${size}px "JetBrains Mono", ui-monospace, Consolas, monospace`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(text, x, y);
  }

  dispose(): void {
    this.observer.disconnect();
  }

  abstract draw(): void;
}
