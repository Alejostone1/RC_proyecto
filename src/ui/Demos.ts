/**
 * Demostraciones guiadas. Cada paso aplica una configuración, reinicia, cierra
 * el interruptor y deja correr la simulación durante un tiempo SIMULADO fijo
 * mostrando una explicación. Luego pasa al siguiente.
 */
import { analyzeResonance } from '../physics/Resonance';
import { criticalResistance } from '../physics/RLCModel';
import { fmtNum, fmtSI } from '../utils/Format';
import { PRESETS, type LabConfig } from './Presets';

export interface DemoStep {
  title: string;
  text: string;
  duration: number;
  config: LabConfig;
}

export function dampingDemo(): DemoStep[] {
  const under = PRESETS.underdamped.build();
  const crit = PRESETS.critical.build();
  const over = PRESETS.overdamped.build();
  const Rc = criticalResistance(under.params);
  return [
    {
      title: '1 · Subamortiguado (R < R_c)',
      text: `R = ${fmtNum(under.params.R)} Ω < R_c = ${fmtNum(Rc)} Ω. Δ < 0: raíces complejas. La carga sobrepasa el valor final C·E₀ y oscila con frecuencia ω_d dentro de una envolvente e^(−αt). En el retrato de fase se ve una espiral.`,
      duration: 4,
      config: under,
    },
    {
      title: '2 · Críticamente amortiguado (R = R_c)',
      text: `R = R_c = 2√(L/C) = ${fmtNum(Rc)} Ω. Δ = 0: raíz doble s = −α. La carga llega a C·E₀ lo más rápido posible sin sobrepasarlo: q(t) = (A + Bt)e^(−αt) + C·E₀.`,
      duration: 4,
      config: crit,
    },
    {
      title: '3 · Sobreamortiguado (R > R_c)',
      text: `R = ${fmtNum(over.params.R)} Ω > R_c. Δ > 0: dos raíces reales negativas. La aproximación al equilibrio es lenta y monótona, dominada por la raíz más lenta s₁.`,
      duration: 5,
      config: over,
    },
  ];
}

export function resonanceDemo(): DemoStep[] {
  const base = PRESETS.resonance.build();
  const w0 = base.excitation.omega;
  const mk = (w: number, title: string, extra: string): DemoStep => {
    const cfg: LabConfig = { ...base, excitation: { ...base.excitation, omega: w } };
    const r = analyzeResonance(cfg.params, cfg.excitation.E0, w);
    return {
      title,
      text: `ω = ${fmtNum(w)} rad/s, ω₀ = ${fmtNum(w0)} rad/s. Amplitud permanente |I| = ${fmtSI(r.currentAmplitude, 'A')} (${fmtNum((100 * r.currentAmplitude) / r.peakCurrent, 3)}% del máximo E₀/R = ${fmtSI(r.peakCurrent, 'A')}). ${extra}`,
      duration: 7,
      config: cfg,
    };
  };
  return [
    mk(0.5 * w0, '1 · ω < ω₀ (frecuencia baja)', 'Predomina la reactancia del capacitor 1/(ωC): la corriente es pequeña.'),
    mk(w0, '2 · ω ≈ ω₀ (resonancia)', 'Las reactancias de L y C se cancelan y solo limita R: la corriente es máxima, pero FINITA porque R > 0.'),
    mk(1.6 * w0, '3 · ω > ω₀ (frecuencia alta)', 'Predomina la reactancia del inductor ωL: la corriente vuelve a ser pequeña.'),
  ];
}

export class DemoRunner {
  private steps: DemoStep[] = [];
  private index = -1;
  private startT = 0;
  private readonly box = document.getElementById('demo-caption')!;
  private readonly stepEl = document.getElementById('demo-step')!;
  private readonly titleEl = document.getElementById('demo-title')!;
  private readonly textEl = document.getElementById('demo-text')!;
  private readonly bar = document.querySelector('#demo-progress i') as HTMLElement;
  private name = '';

  constructor(private readonly apply: (cfg: LabConfig) => void) {
    document.getElementById('demo-next')!.addEventListener('click', () => this.next());
    document.getElementById('demo-stop')!.addEventListener('click', () => this.stop());
  }

  get running(): boolean {
    return this.index >= 0;
  }

  start(name: string, steps: DemoStep[]): void {
    this.name = name;
    this.steps = steps;
    this.index = -1;
    this.box.hidden = false;
    this.next();
  }

  next(): void {
    this.index++;
    if (this.index >= this.steps.length) return this.stop();
    const s = this.steps[this.index];
    this.apply(s.config);
    this.startT = 0;
    this.stepEl.textContent = `${this.name} · paso ${this.index + 1} de ${this.steps.length}`;
    this.titleEl.textContent = s.title;
    this.textEl.textContent = s.text;
    (document.getElementById('demo-next') as HTMLButtonElement).textContent = this.index === this.steps.length - 1 ? 'Finalizar ›' : 'Siguiente ›';
  }

  stop(): void {
    this.index = -1;
    this.box.hidden = true;
  }

  /** Avanza según el tiempo SIMULADO (respeta pausa y velocidad). */
  update(simT: number): void {
    if (!this.running) return;
    const s = this.steps[this.index];
    this.startT = simT;
    const p = Math.min(1, this.startT / s.duration);
    this.bar.style.width = `${p * 100}%`;
    if (p >= 1 && this.index < this.steps.length - 1) this.next();
  }
}
