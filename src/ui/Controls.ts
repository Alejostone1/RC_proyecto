/**
 * Panel de control: parámetros (slider + campo numérico validado), excitación,
 * condiciones iniciales, presets, control temporal, velocidad, cámaras y render.
 * No toca la simulación directamente: emite eventos que la App aplica.
 */
import type { ExcitationKind } from '../physics/Excitation';
import { criticalResistance, naturalFrequency, validateInitialConditions, validateParams } from '../physics/RLCModel';
import { CAMERA_VIEWS, type CameraView } from '../scene/CameraManager';
import { PARAM_LIMITS } from '../utils/Constants';
import { fmtNum } from '../utils/Format';
import { PRESETS, type LabConfig, type PresetId } from './Presets';

type FieldKey = 'R' | 'L' | 'C' | 'E0' | 'omega' | 'q0' | 'i0';

interface FieldSpec {
  key: FieldKey;
  label: string;
  name: string;
  unit: string;
  slider: { min: number; max: number; log?: boolean; step?: number };
  limits: { min: number; max: number };
}

const FIELDS: FieldSpec[] = [
  { key: 'R', label: 'R', name: 'resistencia', unit: 'Ω', slider: { min: 0, max: 60, step: 0.01 }, limits: PARAM_LIMITS.R },
  { key: 'L', label: 'L', name: 'inductancia', unit: 'H', slider: { min: 0.01, max: 5, log: true }, limits: PARAM_LIMITS.L },
  { key: 'C', label: 'C', name: 'capacitancia', unit: 'F', slider: { min: 5e-4, max: 0.5, log: true }, limits: PARAM_LIMITS.C },
  { key: 'E0', label: 'E₀', name: 'voltaje', unit: 'V', slider: { min: -50, max: 50, step: 0.1 }, limits: PARAM_LIMITS.E0 },
  { key: 'omega', label: 'ω', name: 'frecuencia', unit: 'rad/s', slider: { min: 0, max: 40, step: 0.01 }, limits: PARAM_LIMITS.omega },
  { key: 'q0', label: 'q₀', name: 'carga inicial', unit: 'C', slider: { min: -0.5, max: 0.5, step: 0.001 }, limits: PARAM_LIMITS.q0 },
  { key: 'i0', label: 'i₀', name: 'corriente inicial', unit: 'A', slider: { min: -10, max: 10, step: 0.01 }, limits: PARAM_LIMITS.i0 },
];

export interface ControlEvents {
  onConfig(cfg: LabConfig): void;
  onPreset(id: PresetId): void;
  onStart(): void;
  onPause(): void;
  onReset(): void;
  onSwitch(): void;
  onSpeed(speed: number): void;
  onView(view: CameraView): void;
  onBloom(on: boolean): void;
  onLabels(on: boolean): void;
}

interface FieldEls {
  root: HTMLDivElement;
  range: HTMLInputElement;
  num: HTMLInputElement;
  err: HTMLDivElement;
  spec: FieldSpec;
}

export class Controls {
  private cfg!: LabConfig;
  private readonly fields = new Map<FieldKey, FieldEls>();
  private readonly excSelect: HTMLSelectElement;
  private readonly rcInfo: HTMLSpanElement;
  private readonly w0Info: HTMLSpanElement;
  private readonly presetDesc: HTMLDivElement;
  private readonly switchBtn: HTMLButtonElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedRange: HTMLInputElement;
  private readonly speedLabel: HTMLSpanElement;
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly presetBtns = new Map<PresetId, HTMLButtonElement>();
  private readonly viewBtns = new Map<CameraView, HTMLButtonElement>();

  constructor(
    root: HTMLElement,
    viewRoot: HTMLElement,
    private readonly ev: ControlEvents,
  ) {
    root.innerHTML = '';
    // --- Simulación ---
    const sim = this.group(root, 'Simulación');
    this.switchBtn = this.button(sim, 'Interruptor: ABIERTO', () => ev.onSwitch(), 'btn');
    this.switchBtn.style.width = '100%';
    this.switchBtn.style.marginBottom = '6px';
    const r1 = this.row(sim);
    this.startBtn = this.button(r1, '▶ Iniciar', () => ev.onStart(), 'btn');
    this.pauseBtn = this.button(r1, '❚❚ Pausar', () => ev.onPause(), 'btn');
    this.button(r1, '↺ Reiniciar', () => ev.onReset(), 'btn');
    const kb = document.createElement('div');
    kb.className = 'kbd';
    kb.textContent = 'Espacio: iniciar/pausar · R: reiniciar · P: sustentación · 1–5: cámaras';
    kb.style.marginTop = '6px';
    sim.appendChild(kb);

    // --- Velocidad ---
    const vel = this.group(root, 'Velocidad de simulación');
    const r2 = this.row(vel);
    for (const [label, s] of [
      ['Cámara lenta', 0.2],
      ['Normal', 1],
      ['Rápida', 3],
    ] as const) {
      const b = this.button(r2, label, () => ev.onSpeed(s), 'btn small');
      b.dataset.speed = String(s);
      this.speedBtns.push(b);
    }
    const sp = document.createElement('div');
    sp.className = 'ctrl';
    sp.innerHTML = `<div class="ctrl-head"><span class="dim">tiempo simulado / tiempo real</span><span class="mono"></span></div><input type="range" min="0" max="1000">`;
    vel.appendChild(sp);
    this.speedLabel = sp.querySelector('.mono')!;
    this.speedRange = sp.querySelector('input')!;
    this.speedRange.addEventListener('input', () => ev.onSpeed(this.fromLog(+this.speedRange.value, 0.05, 5)));
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'La velocidad cambia cuántos pasos RK4 se ejecutan por segundo real; el paso h no cambia.';
    vel.appendChild(note);

    // --- Presets ---
    const pre = this.group(root, 'Presets');
    const r3 = this.row(pre);
    for (const p of Object.values(PRESETS)) {
      this.presetBtns.set(p.id, this.button(r3, p.label, () => ev.onPreset(p.id), 'btn small'));
    }
    r3.style.display = 'grid';
    r3.style.gridTemplateColumns = '1fr 1fr';
    this.presetDesc = document.createElement('div');
    this.presetDesc.className = 'preset-desc';
    pre.appendChild(this.presetDesc);

    // --- Circuito ---
    const circ = this.group(root, 'Parámetros del circuito');
    for (const key of ['R', 'L', 'C'] as const) this.field(circ, key);
    const rcRow = document.createElement('div');
    rcRow.className = 'row';
    rcRow.style.alignItems = 'center';
    this.rcInfo = document.createElement('span');
    this.rcInfo.className = 'mono dim';
    this.rcInfo.style.flex = '2';
    rcRow.appendChild(this.rcInfo);
    this.button(rcRow, 'R = R_c', () => this.patch({ R: criticalResistance(this.cfg.params) }), 'btn small');
    circ.appendChild(rcRow);

    // --- Fuente ---
    const src = this.group(root, 'Fuente E(t)');
    this.excSelect = document.createElement('select');
    this.excSelect.innerHTML = `<option value="step">Escalón · E(t) = E₀</option><option value="sine">Senoidal · E(t) = E₀ sin(ωt)</option><option value="free">Descarga libre · E(t) = 0</option>`;
    this.excSelect.addEventListener('change', () => this.patch({ kind: this.excSelect.value as ExcitationKind }));
    src.appendChild(this.excSelect);
    this.field(src, 'E0');
    this.field(src, 'omega');
    const wRow = document.createElement('div');
    wRow.className = 'row';
    wRow.style.alignItems = 'center';
    this.w0Info = document.createElement('span');
    this.w0Info.className = 'mono dim';
    this.w0Info.style.flex = '2';
    wRow.appendChild(this.w0Info);
    this.button(wRow, 'ω = ω₀', () => this.patch({ omega: naturalFrequency(this.cfg.params) }), 'btn small');
    src.appendChild(wRow);

    // --- Condiciones iniciales ---
    const ic = this.group(root, 'Condiciones iniciales');
    this.field(ic, 'q0');
    this.field(ic, 'i0');

    // --- Render ---
    const rend = this.group(root, 'Visualización');
    rend.appendChild(this.checkbox('Bloom (resplandor)', true, (on) => ev.onBloom(on)));
    rend.appendChild(this.checkbox('Etiquetas de componentes', true, (on) => ev.onLabels(on)));

    // --- Cámaras (sobre el visor) ---
    viewRoot.innerHTML = '';
    (Object.keys(CAMERA_VIEWS) as CameraView[]).forEach((v, k) => {
      const b = this.button(viewRoot, `${k + 1} · ${CAMERA_VIEWS[v].label}`, () => ev.onView(v), 'ghost small');
      this.viewBtns.set(v, b);
    });
  }

  // ---------- construcción ----------
  private group(root: HTMLElement, title: string): HTMLDivElement {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h2>${title}</h2>`;
    root.appendChild(g);
    return g;
  }

  private row(parent: HTMLElement): HTMLDivElement {
    const r = document.createElement('div');
    r.className = 'row';
    parent.appendChild(r);
    return r;
  }

  private button(parent: HTMLElement, label: string, fn: () => void, cls: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  }

  private checkbox(label: string, checked: boolean, fn: (on: boolean) => void): HTMLLabelElement {
    const l = document.createElement('label');
    l.style.display = 'flex';
    l.style.gap = '8px';
    l.style.alignItems = 'center';
    l.style.margin = '6px 0';
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.addEventListener('change', () => fn(i.checked));
    l.append(i, label);
    return l;
  }

  private field(parent: HTMLElement, key: FieldKey): void {
    const spec = FIELDS.find((f) => f.key === key)!;
    const root = document.createElement('div');
    root.className = 'ctrl';
    root.innerHTML = `<div class="ctrl-head"><label>${spec.label}<small>${spec.name} [${spec.unit}]</small></label><input type="number" step="any"></div><input type="range" min="0" max="1000"><div class="err" hidden></div>`;
    parent.appendChild(root);
    const els: FieldEls = {
      root,
      range: root.querySelector('input[type=range]')!,
      num: root.querySelector('input[type=number]')!,
      err: root.querySelector('.err')!,
      spec,
    };
    els.range.addEventListener('input', () => {
      const v = this.sliderToValue(spec, +els.range.value);
      this.patch({ [key]: v } as Partial<Flat>);
    });
    els.num.addEventListener('change', () => {
      const v = Number(els.num.value.replace(',', '.'));
      if (!Number.isFinite(v) || els.num.value.trim() === '') return this.showError(key, 'Ingrese un número válido.');
      if (v < spec.limits.min || v > spec.limits.max) return this.showError(key, `Fuera de rango [${spec.limits.min}, ${spec.limits.max}] ${spec.unit}.`);
      this.patch({ [key]: v } as Partial<Flat>);
    });
    this.fields.set(key, els);
  }

  // ---------- conversiones ----------
  private fromLog(s: number, min: number, max: number): number {
    return min * (max / min) ** (s / 1000);
  }

  private toLog(v: number, min: number, max: number): number {
    return (1000 * Math.log(Math.max(min, Math.min(max, v)) / min)) / Math.log(max / min);
  }

  private sliderMax(spec: FieldSpec): number {
    if (spec.key === 'omega' && this.cfg) return Math.max(spec.slider.max, 3 * naturalFrequency(this.cfg.params));
    return spec.slider.max;
  }

  private sliderToValue(spec: FieldSpec, s: number): number {
    const max = this.sliderMax(spec);
    if (spec.slider.log) return this.fromLog(s, spec.slider.min, max);
    const v = spec.slider.min + (s / 1000) * (max - spec.slider.min);
    const step = spec.slider.step ?? 0;
    return step ? Math.round(v / step) * step : v;
  }

  private valueToSlider(spec: FieldSpec, v: number): number {
    const max = this.sliderMax(spec);
    if (spec.slider.log) return this.toLog(v, spec.slider.min, max);
    return (1000 * (Math.max(spec.slider.min, Math.min(max, v)) - spec.slider.min)) / (max - spec.slider.min);
  }

  // ---------- validación y emisión ----------
  private showError(key: FieldKey, msg: string): void {
    const f = this.fields.get(key)!;
    f.root.classList.add('invalid');
    f.err.hidden = false;
    f.err.textContent = msg;
  }

  private patch(p: Partial<Flat>): void {
    const flat: Flat = { ...toFlat(this.cfg), ...p };
    const cfg = fromFlat(flat);
    const issues = [...validateParams(cfg.params, true), ...validateInitialConditions(cfg.initial)];
    for (const f of this.fields.values()) {
      f.root.classList.remove('invalid');
      f.err.hidden = true;
    }
    if (issues.length) {
      for (const is of issues) if (this.fields.has(is.field as FieldKey)) this.showError(is.field as FieldKey, is.message);
      return;
    }
    this.ev.onConfig(cfg);
  }

  // ---------- sincronización desde la App ----------
  sync(cfg: LabConfig, presetId: PresetId | null): void {
    this.cfg = cfg;
    const flat = toFlat(cfg);
    for (const [key, f] of this.fields) {
      const v = flat[key];
      if (document.activeElement !== f.num) f.num.value = fmtNum(v, 5).replace('−', '-');
      if (document.activeElement !== f.range) f.range.value = String(this.valueToSlider(f.spec, v));
      f.root.classList.remove('invalid');
      f.err.hidden = true;
    }
    this.excSelect.value = cfg.excitation.kind;
    this.fields.get('E0')!.root.classList.toggle('disabled', cfg.excitation.kind === 'free');
    this.fields.get('omega')!.root.classList.toggle('disabled', cfg.excitation.kind !== 'sine');
    this.rcInfo.textContent = `R_c = 2√(L/C) = ${fmtNum(criticalResistance(cfg.params), 4)} Ω`;
    this.w0Info.textContent = `ω₀ = 1/√(LC) = ${fmtNum(naturalFrequency(cfg.params), 4)} rad/s`;
    for (const [id, b] of this.presetBtns) b.classList.toggle('on', id === presetId);
    if (presetId) {
      const p = PRESETS[presetId];
      this.presetDesc.innerHTML = `<b>${p.label}.</b> ${p.description}<br><span class="mono">R=${fmtNum(cfg.params.R, 4)} Ω · L=${fmtNum(cfg.params.L, 4)} H · C=${fmtNum(cfg.params.C, 4)} F${cfg.excitation.kind === 'sine' ? ` · ω=${fmtNum(cfg.excitation.omega, 4)}` : ''} · E₀=${fmtNum(cfg.excitation.E0, 3)} V</span>`;
    } else {
      this.presetDesc.textContent = 'Configuración personalizada.';
    }
  }

  syncRun(switchClosed: boolean, status: string, speed: number, view: CameraView): void {
    this.switchBtn.textContent = switchClosed ? 'Interruptor: CERRADO (clic para abrir)' : 'Interruptor: ABIERTO (clic para cerrar)';
    this.switchBtn.classList.toggle('on', switchClosed);
    this.startBtn.disabled = status === 'running' || status === 'error';
    this.pauseBtn.disabled = status !== 'running';
    if (document.activeElement !== this.speedRange) this.speedRange.value = String(this.toLog(speed, 0.05, 5));
    this.speedLabel.textContent = `${fmtNum(speed, 3)}×`;
    for (const b of this.speedBtns) b.classList.toggle('on', Math.abs(+b.dataset.speed! - speed) < 1e-9);
    for (const [v, b] of this.viewBtns) b.classList.toggle('on', v === view);
  }
}

interface Flat {
  R: number;
  L: number;
  C: number;
  E0: number;
  omega: number;
  q0: number;
  i0: number;
  kind: ExcitationKind;
}

function toFlat(c: LabConfig): Flat {
  return { ...c.params, E0: c.excitation.E0, omega: c.excitation.omega, kind: c.excitation.kind, ...c.initial };
}

function fromFlat(f: Flat): LabConfig {
  return {
    params: { R: f.R, L: f.L, C: f.C },
    excitation: { kind: f.kind, E0: f.E0, omega: f.omega },
    initial: { q0: f.q0, i0: f.i0 },
  };
}
