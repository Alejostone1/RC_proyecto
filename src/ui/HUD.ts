/**
 * HUD: barra de estado (régimen, resonancia, t, FPS), tarjeta del componente
 * seleccionado, etiquetas 3D con valores y banner de errores.
 */
import type { ComponentId } from '../components/types';
import { REGIME_LABELS } from '../physics/DampingClassifier';
import { analyzeResonance } from '../physics/Resonance';
import { COMPONENT_NAMES, type SceneManager } from '../scene/SceneManager';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtSI } from '../utils/Format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_TEXT: Record<string, string> = {
  idle: '○ Interruptor abierto',
  running: '● Simulando',
  paused: '❚❚ En pausa',
  error: '⚠ Detenida',
};

export class HUD {
  private readonly regime = $('regime-badge');
  private readonly reson = $('resonance-badge');
  private readonly status = $('sim-status');
  private readonly time = $('sim-time');
  private readonly fps = $('fps');
  private readonly card = $('info-card');
  private readonly error = $('error-banner');
  private shownError: string | null = null;
  selected: ComponentId | null = null;

  constructor(
    private readonly engine: SimulationEngine,
    private readonly scene: SceneManager,
  ) {}

  onConfigure(): void {
    const a = this.engine.analysis;
    this.regime.textContent = REGIME_LABELS[a.regime];
    this.regime.className = `badge ${a.regime}`;
    const exc = this.engine.excitation;
    this.reson.hidden = !(exc.kind === 'sine' && analyzeResonance(this.engine.params, exc.E0, exc.omega).near);
    this.hideError();
  }

  update(fps: number): void {
    const s = this.engine.state;
    this.status.textContent = STATUS_TEXT[s.status];
    this.time.textContent = `t = ${s.t.toFixed(3)} s`;
    this.fps.textContent = `${Math.round(fps)} FPS`;
    if (s.status === 'error' && s.error && s.error !== this.shownError) this.showError(s.error);

    const p = this.engine.params;
    this.scene.setLabelValue('source', `E = ${fmtSI(s.E, 'V')}`);
    this.scene.setLabelValue('resistor', `${fmtSI(p.R, 'Ω')} · P = ${fmtSI(s.PR, 'W')}`);
    this.scene.setLabelValue('inductor', `${fmtSI(p.L, 'H')} · V_L = ${fmtSI(s.VL, 'V')}`);
    this.scene.setLabelValue('capacitor', `${fmtSI(p.C, 'F')} · V_C = ${fmtSI(s.VC, 'V')}`);
    this.scene.setLabelValue('switch', s.status === 'idle' ? 'abierto' : 'cerrado');
    this.updateCard();
  }

  private cardBody: HTMLElement | null = null;

  select(id: ComponentId | null): void {
    this.selected = id;
    if (id) {
      // Estructura fija; updateCard() solo reescribe el cuerpo (el botón no se recrea).
      this.card.innerHTML = `<h3>${COMPONENT_NAMES[id]}<button class="ghost small" id="card-close" aria-label="Cerrar">✕</button></h3><div class="card-body"></div>`;
      this.cardBody = this.card.querySelector('.card-body');
      this.card.querySelector('#card-close')!.addEventListener('click', () => {
        this.select(null);
        this.scene.select(null);
      });
    }
    this.updateCard();
  }

  private updateCard(): void {
    const id = this.selected;
    if (!id) {
      this.card.hidden = true;
      return;
    }
    const s = this.engine.state;
    const p = this.engine.params;
    const row = (k: string, v: string, cls = '') => `<span>${k}</span><span class="${cls}">${v}</span>`;
    let body = '';
    let note = '';
    switch (id) {
      case 'resistor':
        body = row('R', fmtSI(p.R, 'Ω')) + row('i(t)', fmtSI(s.i, 'A')) + row('V_R = R·i', fmtSI(s.VR, 'V')) + row('P_R = i²R', fmtSI(s.PR, 'W'));
        note = 'El brillo y el color térmico son proporcionales a P_R / P_R,máx, con un retardo térmico conceptual.';
        break;
      case 'inductor':
        body = row('L', fmtSI(p.L, 'H')) + row('i(t)', fmtSI(s.i, 'A')) + row('di/dt', fmtSI(s.didt, 'A/s')) + row('V_L = L·di/dt', fmtSI(s.VL, 'V')) + row('E_L = Li²/2', fmtSI(s.EL, 'J'));
        note = 'Líneas de campo conceptuales: opacidad ∝ |i| y sentido según el signo de i. El brillo de la bobina es ∝ |V_L|.';
        break;
      case 'capacitor':
        body = row('C', fmtSI(p.C, 'F')) + row('q(t)', fmtSI(s.q, 'C')) + row('V_C = q/C', fmtSI(s.VC, 'V')) + row('E_C = q²/2C', fmtSI(s.EC, 'J'));
        note = 'Rojo = carga positiva, azul = negativa. La cantidad de puntos es ∝ |q|; los colores se intercambian cuando q cambia de signo.';
        break;
      case 'source':
        body = row('tipo', this.engine.excitation.kind === 'step' ? 'DC (escalón)' : this.engine.excitation.kind === 'sine' ? 'AC (senoidal)' : 'apagada') + row('E(t)', fmtSI(s.E, 'V')) + row('E·i (potencia entregada)', fmtSI(s.E * s.i, 'W'));
        break;
      case 'switch':
        body = row('estado', s.status === 'idle' ? 'abierto' : 'cerrado');
        note = 'Haz clic en el interruptor (o en el botón del panel) para cerrarlo e iniciar la simulación.';
        break;
    }
    this.card.hidden = false;
    if (this.cardBody) this.cardBody.innerHTML = `<div class="stats" style="margin-top:0">${body}</div>${note ? `<p>${note}</p>` : ''}`;
  }

  showError(msg: string): void {
    this.shownError = msg;
    this.error.hidden = false;
    this.error.innerHTML = `<b>Error numérico.</b> ${msg} <button class="ghost small" id="err-close">Cerrar</button>`;
    this.error.querySelector('#err-close')!.addEventListener('click', () => this.hideError());
  }

  hideError(): void {
    this.error.hidden = true;
    this.shownError = null;
  }
}
