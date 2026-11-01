/**
 * MODO SUSTENTACIÓN: oculta los paneles laterales y deja el circuito 3D, la
 * ecuación, los parámetros, el régimen, el osciloscopio, el retrato de fase y
 * los datos clave en tipografía grande para proyectar en clase.
 */
import { REGIME_LABELS } from '../physics/DampingClassifier';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { fmtNum, fmtSI } from '../utils/Format';

export class PresentationMode {
  active = false;
  private readonly card = document.getElementById('presentation-card')!;
  private live: HTMLElement | null = null;

  constructor(
    private readonly engine: SimulationEngine,
    private readonly button: HTMLButtonElement,
    private readonly onToggle: () => void,
  ) {
    button.addEventListener('click', () => this.toggle());
  }

  toggle(): void {
    this.active = !this.active;
    document.body.classList.toggle('projector', this.active);
    this.button.textContent = this.active ? 'Salir del modo proyector' : 'Modo proyector';
    this.rebuild();
    this.onToggle();
  }

  rebuild(): void {
    if (!this.active) return;
    const e = this.engine;
    const { R, L, C } = e.params;
    const a = e.analysis;
    const exc = e.excitation;
    const E = exc.kind === 'step' ? `${fmtNum(exc.E0, 3)} V` : exc.kind === 'sine' ? `${fmtNum(exc.E0, 3)} sin(${fmtNum(exc.omega, 4)}t)` : '0';
    this.card.innerHTML = `
      <div class="eq big" style="margin-top:0"><var>L</var><var>q</var>″ + <var>R</var><var>q</var>′ + <var>q</var>/<var>C</var> = <var>E</var>(<var>t</var>)</div>
      <div class="pc-grid">
        <div><span>R</span> ${fmtSI(R, 'Ω')}</div><div><span>L</span> ${fmtSI(L, 'H')}</div><div><span>C</span> ${fmtSI(C, 'F')}</div>
        <div><span>α</span> ${fmtNum(a.alpha, 4)}</div><div><span>ω₀</span> ${fmtNum(a.omega0, 4)}</div><div><span>R_c</span> ${fmtSI(a.Rc, 'Ω')}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="badge ${a.regime}">${REGIME_LABELS[a.regime]}</span><span class="mono">E(t) = ${E}</span>
      </div>
      <div class="pc-live"></div>`;
    this.live = this.card.querySelector('.pc-live');
  }

  update(): void {
    if (!this.active || !this.live) return;
    const s = this.engine.state;
    this.live.innerHTML = `
      <div>t = ${s.t.toFixed(2)} s</div><div style="color:var(--dim)">${s.status === 'running' ? '● simulando' : s.status === 'paused' ? '❚❚ pausa' : s.status === 'idle' ? '○ S abierto' : '⚠ error'}</div>
      <div style="color:var(--accent)">q = ${fmtSI(s.q, 'C')}</div><div style="color:var(--amber)">i = ${fmtSI(s.i, 'A')}</div>
      <div style="color:var(--violet)">V_L = ${fmtSI(s.VL, 'V')}</div><div style="color:var(--green)">V_C = ${fmtSI(s.VC, 'V')}</div>`;
  }
}
