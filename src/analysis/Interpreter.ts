/**
 * Intérprete de resultados basado en reglas. Cada frase se construye a partir
 * de valores medidos o calculados (no hay texto genérico ni IA): si los datos
 * cambian, cambia la explicación.
 */
import { REGIME_LABELS, type DampingRegime } from '../physics/DampingClassifier';
import { criticalResistance } from '../physics/RLCModel';
import { fmtNum, fmtSI } from '../utils/Format';
import type { Snapshot } from './Snapshot';
import { exactAt, transientTime } from './Snapshot';
import type { ResponseMetrics, Scenario } from './WhatIf';

export type Tone = 'q' | 'i' | 'vl' | 'vc' | 'accent' | 'ok' | 'warn';

export interface Kpi {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}

export interface Validation {
  label: string;
  measured: string;
  theoretical: string;
  ok: boolean;
  note: string;
}

export interface CompareRow {
  label: string;
  unit: string;
  initial: number;
  final: number;
  tone: Tone;
}

export interface Effect {
  label: string;
  from: string;
  to: string;
  trend: 'up' | 'down' | 'same' | 'change';
}

export interface WhatIfCard {
  id: string;
  title: string;
  change: string;
  effects: Effect[];
  text: string;
  regimeChanged: boolean;
}

export interface ComponentCard {
  id: 'resistor' | 'inductor' | 'capacitor' | 'source';
  title: string;
  symbol: string;
  metrics: Array<{ label: string; value: string }>;
  paragraphs: string[];
}

export interface QA {
  q: string;
  a: string;
}

export interface Report {
  headline: string;
  subhead: string;
  regime: DampingRegime;
  regimeLabel: string;
  kpis: Kpi[];
  configured: string[];
  observed: string[];
  changes: string[];
  comparison: CompareRow[];
  validations: Validation[];
  components: ComponentCard[];
  whatIf: WhatIfCard[];
  conclusion: QA[];
}

const n = (x: number, d = 3) => fmtNum(x, d);
const pct = (x: number) => `${fmtNum(x, 3)} %`;
const lower = (r: DampingRegime) => REGIME_LABELS[r].toLowerCase();

function relOk(a: number | null, b: number | null, tol = 0.02, abs = 0): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= Math.max(tol * Math.max(Math.abs(a), Math.abs(b)), abs);
}

function trend(a: number, b: number, eps = 1e-3): Effect['trend'] {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b ? 'same' : 'change';
  if (Math.abs(b - a) <= eps * Math.max(Math.abs(a), Math.abs(b), 1e-15)) return 'same';
  return b > a ? 'up' : 'down';
}

function word(t: Effect['trend'], up: string, down: string, same = 'no cambia'): string {
  return t === 'up' ? up : t === 'down' ? down : same;
}

// ---------------------------------------------------------------------------
export function buildReport(snap: Snapshot, scenarios: Scenario[]): Report {
  const { params, excitation: exc, initial: ic } = snap.config;
  const { R, L, C } = params;
  const a = snap.analysis;
  const m = snap.measured;
  const th = snap.theoretical;
  const fin = snap.final;
  const ini = snap.initial;
  const Rc = criticalResistance(params);
  const tEnd = fin.t;
  const qEq = exc.kind === 'step' ? C * exc.E0 : 0;
  const oscillated = m.extrema >= 2 && m.crossings >= 2;
  const regimeLabel = REGIME_LABELS[a.regime];
  /** Tasa de decaimiento del modo más lento: min |Re(s)|. */
  const slowRate = Math.min(Math.abs(a.roots[0].re), Math.abs(a.roots[1].re));

  // ---------- encabezado ----------
  const headline = `Régimen ${lower(a.regime)}${exc.kind === 'sine' ? ' con excitación senoidal' : exc.kind === 'step' ? ' ante un escalón' : ' en descarga libre'}`;
  const subhead = `${n(tEnd, 4)} s simulados con RK4 (h = ${fmtSI(snap.h, 's')}, ${Math.round(tEnd / snap.h).toLocaleString('es-CO')} pasos).`;

  // ---------- KPIs ----------
  const kpis: Kpi[] = [
    { label: 'ζ = R / R_c', value: n(a.zeta), hint: a.zeta < 1 ? 'menor que 1: oscila' : a.zeta > 1 ? 'mayor que 1: no oscila' : 'igual a 1: crítico', tone: 'accent' },
    { label: 'ω₀', value: `${n(a.omega0)} rad/s`, hint: `período natural ${fmtSI((2 * Math.PI) / a.omega0, 's')}`, tone: 'accent' },
    { label: '|i| máxima', value: fmtSI(m.maxAbsI, 'A'), hint: `en t = ${n(m.tMaxAbsI)} s`, tone: 'i' },
    { label: '|q| máxima', value: fmtSI(m.maxAbsQ, 'C'), hint: `V_C máx = ${fmtSI(m.maxAbsVC, 'V')}`, tone: 'q' },
    { label: 'Calor en R', value: fmtSI(m.energyDissipated, 'J'), hint: `P_R máx = ${fmtSI(m.maxPR, 'W')}`, tone: 'warn' },
  ];
  if (m.overshootPct !== null) kpis.push({ label: 'Sobrepico', value: pct(m.overshootPct), hint: 'sobre el valor final C·E₀', tone: 'q' });
  else if (snap.resonance) kpis.push({ label: '|ω − ω₀|', value: n(snap.resonance.detuning), hint: snap.resonance.near ? 'dentro de la banda: resonancia' : 'fuera de la banda de resonancia', tone: snap.resonance.near ? 'warn' : 'accent' });

  // ---------- LO QUE CONFIGURAMOS ----------
  const configured: string[] = [];
  configured.push(
    `Circuito RLC en serie con R = ${fmtSI(R, 'Ω')}, L = ${fmtSI(L, 'H')} y C = ${fmtSI(C, 'F')}. Con estos valores, α = R/2L = ${n(a.alpha)} s⁻¹, ω₀ = 1/√(LC) = ${n(a.omega0)} rad/s y la resistencia crítica es R_c = 2√(L/C) = ${fmtSI(Rc, 'Ω')}.`,
  );
  configured.push(
    exc.kind === 'step'
      ? `La fuente aplica un escalón E(t) = ${fmtSI(exc.E0, 'V')} desde t = 0. En equilibrio el capacitor debe quedar con q = C·E₀ = ${fmtSI(qEq, 'C')}.`
      : exc.kind === 'sine'
        ? `La fuente es senoidal: E(t) = ${fmtSI(exc.E0, 'V')}·sin(${n(exc.omega)}t), con ω = ${n(exc.omega)} rad/s frente a ω₀ = ${n(a.omega0)} rad/s.`
        : 'La fuente está apagada (E = 0): el circuito evoluciona solo con la energía que tenía al inicio (descarga libre).',
  );
  configured.push(
    `Condiciones iniciales: q(0) = ${fmtSI(ic.q0, 'C')} e i(0) = ${fmtSI(ic.i0, 'A')}, es decir, ${ini.total > 0 ? `${fmtSI(ini.total, 'J')} almacenados al inicio (${fmtSI(ini.EC, 'J')} en C y ${fmtSI(ini.EL, 'J')} en L)` : 'el circuito parte descargado y sin corriente'}.`,
  );

  // ---------- LO QUE OBSERVAMOS ----------
  const observed: string[] = [];
  observed.push(regimeSentence(a.regime, R, Rc, a.zeta, a.alpha, a.omegaD, a.delta));
  if (exc.kind !== 'sine') {
    if (oscillated) {
      observed.push(
        `La carga osciló: cruzó ${m.crossings} ${m.crossings === 1 ? 'vez' : 'veces'} su valor de equilibrio (${fmtSI(qEq, 'C')})${m.period ? ` con un período medido de ${fmtSI(m.period, 's')} (teórico 2π/ω_d = ${a.omegaD > 0 ? fmtSI((2 * Math.PI) / a.omegaD, 's') : '—'})` : ''}.`,
      );
    } else {
      observed.push(`La carga no oscila: se aproxima al equilibrio (${fmtSI(qEq, 'C')}) sin cruzarlo${m.crossings > 0 ? ` salvo ${m.crossings} cruce(s) iniciales por las condiciones iniciales` : ''}.`);
    }
    if (m.alpha !== null && a.alpha > 0) observed.push(`La amplitud decae exponencialmente: el decremento logarítmico de los picos da α ≈ ${n(m.alpha)} s⁻¹, que coincide con R/2L = ${n(a.alpha)} s⁻¹.`);
    if (m.overshootPct !== null) observed.push(m.overshootPct > 0.05 ? `La carga sobrepasó el valor final en un ${pct(m.overshootPct)} antes de estabilizarse.` : 'No hubo sobrepico: la carga nunca superó su valor final.');
    observed.push(
      m.settlingTime !== null
        ? `Se estableció (quedó dentro del ±2 %) en t ≈ ${fmtSI(m.settlingTime, 's')}.`
        : `Al momento de la captura aún no se había establecido dentro del ±2 % (la estimación exacta para esta configuración es ${th.settlingTime !== null ? fmtSI(th.settlingTime, 's') : 'mayor que el tiempo simulado'}).`,
    );
  } else if (snap.resonance) {
    const r = snap.resonance;
    const Ttr = transientTime(a);
    observed.push(
      `La corriente terminó oscilando a la frecuencia de la fuente${m.period ? ` (período medido ${fmtSI(m.period, 's')}, 2π/ω = ${fmtSI((2 * Math.PI) / exc.omega, 's')})` : ''}: en régimen permanente un sistema lineal responde con la misma ω que lo excita.`,
    );
    observed.push(
      tEnd > Ttr
        ? `El transitorio ya se extinguió (≈ 5/α = ${fmtSI(Ttr, 's')}). Amplitud medida de i: ${snap.steadyCurrentMeasured !== null ? fmtSI(snap.steadyCurrentMeasured, 'A') : '—'}; la fórmula E₀/√(R² + (ωL − 1/ωC)²) da ${fmtSI(r.currentAmplitude, 'A')}.`
        : `Todavía hay transitorio (dura ≈ 5/α = ${fmtSI(Ttr, 's')}): la respuesta mezcla la oscilación natural (ω_d) con la forzada (ω).`,
    );
    observed.push(
      r.near
        ? `ω está dentro de la banda de resonancia (|ω − ω₀| = ${n(r.detuning)} ≤ α = ${n(r.halfBandwidth)}): la corriente se acerca a su máximo posible E₀/R = ${fmtSI(r.peakCurrent, 'A')}.`
        : `ω está fuera de la banda de resonancia (|ω − ω₀| = ${n(r.detuning)}): la amplitud es el ${pct((100 * r.currentAmplitude) / r.peakCurrent)} del máximo E₀/R.`,
    );
  }
  observed.push(energySentence(snap));

  // ---------- configuración inicial vs resultado ----------
  const comparison: CompareRow[] = [
    { label: 'Carga q', unit: 'C', initial: ini.q, final: fin.q, tone: 'q' },
    { label: 'Corriente i', unit: 'A', initial: ini.i, final: fin.i, tone: 'i' },
    { label: 'Voltaje V_C', unit: 'V', initial: ini.VC, final: fin.VC, tone: 'vc' },
    { label: 'Voltaje V_L', unit: 'V', initial: ini.VL, final: fin.VL, tone: 'vl' },
    { label: 'Voltaje V_R', unit: 'V', initial: ini.VR, final: fin.VR, tone: 'i' },
    { label: 'Energía E_C', unit: 'J', initial: ini.EC, final: fin.EC, tone: 'vc' },
    { label: 'Energía E_L', unit: 'J', initial: ini.EL, final: fin.EL, tone: 'vl' },
    { label: 'Calor acumulado W_R', unit: 'J', initial: 0, final: m.energyDissipated, tone: 'warn' },
  ];
  const changes: string[] = [];
  changes.push(`La carga pasó de ${fmtSI(ini.q, 'C')} a ${fmtSI(fin.q, 'C')}${exc.kind === 'step' ? ` (equilibrio C·E₀ = ${fmtSI(qEq, 'C')})` : ''}.`);
  changes.push(`La corriente pasó de ${fmtSI(ini.i, 'A')} a ${fmtSI(fin.i, 'A')}${Math.abs(fin.i) < 0.02 * Math.max(m.maxAbsI, 1e-15) && exc.kind !== 'sine' ? ': prácticamente nula, el sistema llegó al reposo' : ''}.`);
  changes.push(`La energía almacenada pasó de ${fmtSI(ini.total, 'J')} a ${fmtSI(fin.total, 'J')}; mientras tanto la fuente entregó ${fmtSI(m.energyDelivered, 'J')} y el resistor disipó ${fmtSI(m.energyDissipated, 'J')}.`);

  // ---------- validación ----------
  const validations: Validation[] = [];
  const ex = exactAt(snap.config, tEnd);
  validations.push({
    label: 'q(t) final: RK4 vs solución exacta',
    measured: fmtSI(fin.q, 'C'),
    theoretical: fmtSI(ex.q, 'C'),
    ok: Math.abs(fin.q - ex.q) <= 1e-6 * Math.max(snap.scales.q, 1e-12),
    note: `diferencia ${fmtSI(Math.abs(fin.q - ex.q), 'C')}`,
  });
  validations.push({
    label: '|i| máxima',
    measured: fmtSI(m.maxAbsI, 'A'),
    theoretical: fmtSI(th.maxAbsI, 'A'),
    ok: relOk(m.maxAbsI, th.maxAbsI, 0.01),
    note: 'máximo de la corrida RK4 vs máximo de la solución exacta',
  });
  if (m.period !== null && th.period !== null) {
    validations.push({ label: 'Período de oscilación', measured: fmtSI(m.period, 's'), theoretical: fmtSI(th.period, 's'), ok: relOk(m.period, th.period), note: exc.kind === 'sine' ? 'en régimen permanente debe tender a 2π/ω' : 'entre extremos sucesivos de q' });
  }
  if (m.alpha !== null) {
    validations.push({ label: 'α por decremento logarítmico', measured: `${n(m.alpha, 4)} s⁻¹`, theoretical: `R/2L = ${n(a.alpha, 4)} s⁻¹`, ok: relOk(m.alpha, a.alpha, 0.02, 1e-6), note: 'ln(A_k / A_{k+1}) / T_d' });
  }
  if (m.overshootPct !== null && th.overshootPct !== null) {
    validations.push({ label: 'Sobrepico', measured: pct(m.overshootPct), theoretical: pct(th.overshootPct), ok: relOk(m.overshootPct, th.overshootPct, 0.01, 0.05), note: 'medido sobre la misma ventana de tiempo' });
  }
  if (m.settlingTime !== null && th.settlingTime !== null) {
    validations.push({ label: 'Tiempo de establecimiento (2 %)', measured: fmtSI(m.settlingTime, 's'), theoretical: fmtSI(th.settlingTime, 's'), ok: relOk(m.settlingTime, th.settlingTime, 0.02, 3 * snap.h), note: 'última salida de la banda ±2 %' });
  }
  if (snap.resonance && snap.steadyCurrentMeasured !== null && tEnd > transientTime(a)) {
    validations.push({ label: 'Amplitud permanente de i', measured: fmtSI(snap.steadyCurrentMeasured, 'A'), theoretical: fmtSI(snap.resonance.currentAmplitude, 'A'), ok: relOk(snap.steadyCurrentMeasured, snap.resonance.currentAmplitude, 0.02), note: 'E₀ / √(R² + (ωL − 1/ωC)²)' });
  }
  const residual = fin.total - ini.total - (m.energyDelivered - m.energyDissipated);
  const eScale = Math.max(ini.total, Math.abs(m.energyDelivered), m.energyDissipated, snap.scales.energy, 1e-15);
  validations.push({
    label: 'Balance de energía',
    measured: `ΔE = ${fmtSI(fin.total - ini.total, 'J')}`,
    theoretical: `W_fuente − W_R = ${fmtSI(m.energyDelivered - m.energyDissipated, 'J')}`,
    ok: Math.abs(residual) <= 1e-4 * eScale,
    note: `residuo relativo ${(Math.abs(residual) / eScale).toExponential(1)}`,
  });

  // ---------- componentes ----------
  const sc = (id: Scenario['id']) => scenarios.find((s) => s.id === id);
  const components: ComponentCard[] = [
    resistorCard(snap, sc('R_up'), sc('R_down')),
    inductorCard(snap, sc('L_up')),
    capacitorCard(snap, sc('C_up')),
    sourceCard(snap),
  ];

  // ---------- qué pasaría si ----------
  const whatIf = scenarios.map(scenarioCard);

  // ---------- conclusión ----------
  const dominantV = [
    { k: 'el resistor (V_R)', v: R * m.maxAbsI },
    { k: 'el inductor (V_L)', v: m.maxAbsVL },
    { k: 'el capacitor (V_C)', v: m.maxAbsVC },
  ].sort((x, y) => y.v - x.v)[0];
  const dominance =
    a.zeta < 0.5
      ? `Dominó el intercambio de energía entre L y C (inercia y "elasticidad" del circuito): con ζ = ${n(a.zeta)} la resistencia es pequeña y solo frena lentamente la oscilación.`
      : a.zeta <= 1.5
        ? `Hubo un equilibrio entre almacenamiento (L, C) y disipación (R): ζ = ${n(a.zeta)} está cerca de 1.`
        : `Dominó la resistencia: con ζ = ${n(a.zeta)} la disipación es tan fuerte que impide cualquier oscilación.`;
  const conclusion: QA[] = [
    { q: '¿Qué ocurrió durante la simulación?', a: `${observed[0]} ${exc.kind === 'step' ? `La carga evolucionó de ${fmtSI(ini.q, 'C')} hacia C·E₀ = ${fmtSI(qEq, 'C')}.` : exc.kind === 'free' ? 'La energía inicial se fue convirtiendo en calor.' : 'La fuente mantuvo la oscilación entregando energía continuamente.'}` },
    { q: '¿Cuál fue el régimen y por qué?', a: `${regimeLabel}, porque ${a.regime === 'critical' ? `R coincide con R_c = ${fmtSI(Rc, 'Ω')} (Δ = 0)` : a.delta < 0 ? `R = ${fmtSI(R, 'Ω')} < R_c = ${fmtSI(Rc, 'Ω')}, lo que hace Δ = α² − ω₀² = ${n(a.delta)} < 0` : `R = ${fmtSI(R, 'Ω')} > R_c = ${fmtSI(Rc, 'Ω')}, lo que hace Δ = ${n(a.delta)} > 0`}.` },
    { q: '¿Qué variable dominó el comportamiento?', a: `${dominance} La mayor caída de tensión la tuvo ${dominantV.k} (${fmtSI(dominantV.v, 'V')} como máximo).` },
    { q: '¿Cómo se comportó la energía?', a: energySentence(snap) + ` En promedio, el ${pct(100 * snap.capacitorShare)} de la energía almacenada estuvo en el capacitor y el ${pct(100 * (1 - snap.capacitorShare))} en el inductor.` },
    { q: '¿La respuesta fue oscilatoria?', a: exc.kind === 'sine' ? 'Sí: la fuente senoidal impone una oscilación permanente con su propia frecuencia ω.' : oscillated ? `Sí: ${m.crossings} cruces por el equilibrio${m.period ? ` con período ≈ ${fmtSI(m.period, 's')}` : ''}.` : 'No: la carga se acercó al equilibrio de forma monótona.' },
    { q: '¿Hubo amortiguamiento?', a: R > 0 ? `Sí: α = ${n(a.alpha)} s⁻¹. La respuesta natural está dominada por la raíz más lenta, σ = ${n(slowRate)} s⁻¹, así que su ${a.regime === 'overdamped' ? 'término lento' : 'envolvente'} se reduce a la mitad cada ln2/σ ≈ ${fmtSI(Math.LN2 / slowRate, 's')}. El resistor convirtió ${fmtSI(m.energyDissipated, 'J')} en calor.` : 'No: con R = 0 no hay disipación y la energía solo se intercambia entre L y C (circuito ideal).' },
    { q: '¿Existe proximidad a resonancia?', a: snap.resonance ? (snap.resonance.near ? `Sí: |ω − ω₀| = ${n(snap.resonance.detuning)} es menor que el semiancho de banda α = ${n(snap.resonance.halfBandwidth)}.` : `No: |ω − ω₀| = ${n(snap.resonance.detuning)} supera el semiancho de banda α = ${n(snap.resonance.halfBandwidth)}.`) : 'No aplica: la resonancia requiere una fuente periódica (senoidal).' },
    { q: '¿Qué ocurriría si cambiamos R?', a: whatIf.find((w) => w.id === 'R_up')?.text ?? '—' },
    { q: '¿Qué ocurriría si cambiamos L?', a: whatIf.find((w) => w.id === 'L_up')?.text ?? '—' },
    { q: '¿Qué ocurriría si cambiamos C?', a: whatIf.find((w) => w.id === 'C_up')?.text ?? '—' },
  ];

  return { headline, subhead, regime: a.regime, regimeLabel, kpis, configured, observed, changes, comparison, validations, components, whatIf, conclusion };
}

// ---------------------------------------------------------------------------
function regimeSentence(r: DampingRegime, R: number, Rc: number, zeta: number, alpha: number, wd: number, delta: number): string {
  switch (r) {
    case 'undamped':
      return `Con R = 0 no hay amortiguamiento (α = 0): las raíces son ±jω₀ y la carga oscila indefinidamente sin perder amplitud.`;
    case 'underdamped':
      return `El valor de resistencia R = ${fmtSI(R, 'Ω')} es menor que R_c = ${fmtSI(Rc, 'Ω')} (ζ = ${n(zeta)}), así que Δ = ${n(delta)} < 0 y las raíces son complejas: el sistema es subamortiguado y la carga oscila con ω_d = ${n(wd)} rad/s dentro de una envolvente e^(−${n(alpha)}t) que disminuye progresivamente.`;
    case 'critical':
      return `R = ${fmtSI(R, 'Ω')} coincide con R_c = 2√(L/C) (ζ = 1, Δ = 0): raíz doble s = −α = ${n(-alpha)} s⁻¹. Es el retorno al equilibrio más rápido posible sin oscilar.`;
    case 'overdamped':
      return `R = ${fmtSI(R, 'Ω')} supera a R_c = ${fmtSI(Rc, 'Ω')} (ζ = ${n(zeta)}), así que Δ = ${n(delta)} > 0 y hay dos raíces reales negativas: el sistema es sobreamortiguado y vuelve al equilibrio lentamente, sin oscilar.`;
  }
}

function energySentence(snap: Snapshot): string {
  const m = snap.measured;
  const ini = snap.initial;
  const fin = snap.final;
  const supplied = ini.total + m.energyDelivered;
  const frac = supplied > 0 ? (100 * m.energyDissipated) / supplied : 0;
  if (snap.config.params.R === 0) {
    return `Sin resistencia, la energía total E_C + E_L se conservó (${fmtSI(ini.total, 'J')} al inicio y ${fmtSI(fin.total, 'J')} al final${m.energyDelivered !== 0 ? `, más ${fmtSI(m.energyDelivered, 'J')} aportados por la fuente` : ''}).`;
  }
  return `De ${fmtSI(supplied, 'J')} disponibles (energía inicial + fuente), el resistor transformó en calor ${fmtSI(m.energyDissipated, 'J')} (${pct(frac)}) y quedan ${fmtSI(fin.total, 'J')} almacenados.${snap.config.excitation.kind === 'step' && ini.total === 0 ? ' Para un escalón desde el reposo, la teoría predice que al final la mitad de la energía entregada queda en C y la otra mitad se disipa, sin importar R.' : ''}`;
}

function scenarioEffects(base: ResponseMetrics, next: ResponseMetrics, kind: string): Effect[] {
  const e: Effect[] = [];
  const ba = base.analysis;
  const na = next.analysis;
  e.push({ label: 'Régimen', from: REGIME_LABELS[ba.regime], to: REGIME_LABELS[na.regime], trend: ba.regime === na.regime ? 'same' : 'change' });
  e.push({ label: 'ζ', from: n(ba.zeta), to: n(na.zeta), trend: trend(ba.zeta, na.zeta) });
  e.push({ label: 'α = R/2L', from: `${n(ba.alpha)} s⁻¹`, to: `${n(na.alpha)} s⁻¹`, trend: trend(ba.alpha, na.alpha) });
  e.push({ label: 'ω₀', from: `${n(ba.omega0)} rad/s`, to: `${n(na.omega0)} rad/s`, trend: trend(ba.omega0, na.omega0) });
  if (kind !== 'sine') {
    if (base.m.overshootPct !== null && next.m.overshootPct !== null) e.push({ label: 'Sobrepico', from: pct(base.m.overshootPct), to: pct(next.m.overshootPct), trend: trend(base.m.overshootPct, next.m.overshootPct, 0.01) });
    if (base.m.settlingTime !== null && next.m.settlingTime !== null) e.push({ label: 'Establecimiento', from: fmtSI(base.m.settlingTime, 's'), to: fmtSI(next.m.settlingTime, 's'), trend: trend(base.m.settlingTime, next.m.settlingTime, 0.01) });
  } else if (base.steadyCurrent !== null && next.steadyCurrent !== null) {
    e.push({ label: '|I| permanente', from: fmtSI(base.steadyCurrent, 'A'), to: fmtSI(next.steadyCurrent, 'A'), trend: trend(base.steadyCurrent, next.steadyCurrent) });
  }
  e.push({ label: '|i| máxima', from: fmtSI(base.m.maxAbsI, 'A'), to: fmtSI(next.m.maxAbsI, 'A'), trend: trend(base.m.maxAbsI, next.m.maxAbsI, 0.005) });
  return e;
}

function scenarioCard(s: Scenario): WhatIfCard {
  const kind = s.config.excitation.kind;
  const effects = scenarioEffects(s.base, s.next, kind);
  const ba = s.base.analysis;
  const na = s.next.analysis;
  const parts: string[] = [];
  const regimeChanged = ba.regime !== na.regime;
  const get = (label: string) => effects.find((e) => e.label === label);

  switch (s.id) {
    case 'R_up':
    case 'R_down':
    case 'R_crit':
      parts.push(`α = R/2L ${word(trend(ba.alpha, na.alpha), 'aumenta', 'disminuye')} de ${n(ba.alpha)} a ${n(na.alpha)} s⁻¹ y ζ pasa de ${n(ba.zeta)} a ${n(na.zeta)}, mientras ω₀ no cambia (no depende de R).`);
      parts.push(trend(ba.zeta, na.zeta) === 'up' ? 'Habría más amortiguamiento: las oscilaciones se reducirían más rápido.' : 'Habría menos amortiguamiento: las oscilaciones durarían más y serían más pronunciadas.');
      break;
    case 'L_up':
      parts.push(`ω₀ = 1/√(LC) baja de ${n(ba.omega0)} a ${n(na.omega0)} rad/s (se divide por √2): la dinámica se vuelve más lenta. Además α = R/2L baja a ${n(na.alpha)} s⁻¹ y ζ = (R/2)√(C/L) pasa de ${n(ba.zeta)} a ${n(na.zeta)}.`);
      break;
    case 'C_up':
      parts.push(`ω₀ = 1/√(LC) baja de ${n(ba.omega0)} a ${n(na.omega0)} rad/s (oscilación más lenta), α = R/2L no cambia y ζ = (R/2)√(C/L) sube de ${n(ba.zeta)} a ${n(na.zeta)}.`);
      if (kind === 'step') parts.push(`La carga final C·E₀ se duplicaría, porque un capacitor mayor almacena más carga con el mismo voltaje.`);
      break;
    case 'w_res':
      parts.push(`Al igualar ω con ω₀ = ${n(ba.omega0)} rad/s, las reactancias ωL y 1/(ωC) se cancelan y solo R limita la corriente.`);
      break;
    case 'w_away':
      parts.push(`Alejar ω de ω₀ hace que la reactancia neta |ωL − 1/(ωC)| crezca y limite la corriente.`);
      break;
  }
  if (regimeChanged) parts.push(`El régimen cambiaría de ${lower(ba.regime)} a ${lower(na.regime)}.`);
  const os = get('Sobrepico');
  if (os && os.trend !== 'same') parts.push(`El sobrepico ${os.trend === 'up' ? 'subiría' : 'bajaría'} de ${os.from} a ${os.to}.`);
  const st = get('Establecimiento');
  if (st && st.trend !== 'same') parts.push(`El tiempo de establecimiento ${st.trend === 'up' ? 'aumentaría' : 'disminuiría'} de ${st.from} a ${st.to}.`);
  const ip = get('|I| permanente');
  if (ip && ip.trend !== 'same') parts.push(`La amplitud permanente de la corriente ${ip.trend === 'up' ? 'subiría' : 'bajaría'} de ${ip.from} a ${ip.to}.`);
  return { id: s.id, title: s.title, change: s.change, effects, text: parts.join(' '), regimeChanged };
}

function resistorCard(s: Snapshot, up?: Scenario, down?: Scenario): ComponentCard {
  const { R } = s.config.params;
  const m = s.measured;
  const supplied = s.initial.total + m.energyDelivered;
  const p: string[] = [];
  p.push(
    R > 0
      ? `El resistor transformó ${fmtSI(m.energyDissipated, 'J')} en calor (${pct(supplied > 0 ? (100 * m.energyDissipated) / supplied : 0)} de la energía disponible). Su potencia máxima fue P_R = i²R = ${fmtSI(m.maxPR, 'W')}, cuando la corriente alcanzó ${fmtSI(m.maxAbsI, 'A')}.`
      : 'Con R = 0 no hay disipación: es el caso ideal en el que la energía se conserva.',
  );
  p.push(`R controla el amortiguamiento: α = R/2L = ${n(s.analysis.alpha)} s⁻¹ y ζ = R/R_c = ${n(s.analysis.zeta)}.`);
  if (up) p.push(`Si R aumenta: ${scenarioCard(up).text}`);
  if (down) p.push(`Si R disminuye: ${scenarioCard(down).text}`);
  return {
    id: 'resistor',
    title: 'Resistor',
    symbol: 'R',
    metrics: [
      { label: 'R', value: fmtSI(R, 'Ω') },
      { label: '|i| máx', value: fmtSI(m.maxAbsI, 'A') },
      { label: 'P_R máx', value: fmtSI(m.maxPR, 'W') },
      { label: 'Calor W_R', value: fmtSI(m.energyDissipated, 'J') },
    ],
    paragraphs: p,
  };
}

function inductorCard(s: Snapshot, up?: Scenario): ComponentCard {
  const { L } = s.config.params;
  const m = s.measured;
  const maxDidt = m.maxAbsVL / L;
  const maxEL = s.series.EL.reduce((x, y) => Math.max(x, y), s.initial.EL);
  const p: string[] = [];
  p.push(`El inductor se opone a los cambios de corriente: el mayor cambio fue |di/dt| ≈ ${fmtSI(maxDidt, 'A/s')}, que produjo |V_L| = L·|di/dt| = ${fmtSI(m.maxAbsVL, 'V')}. Almacenó como máximo ${fmtSI(maxEL, 'J')} en su campo magnético (E_L = Li²/2).`);
  p.push(`L actúa como la "inercia" del circuito: interviene en ω₀ = 1/√(LC) = ${n(s.analysis.omega0)} rad/s y en α = R/2L.`);
  if (up) p.push(`Si L aumenta: ${scenarioCard(up).text}`);
  return {
    id: 'inductor',
    title: 'Inductor',
    symbol: 'L',
    metrics: [
      { label: 'L', value: fmtSI(L, 'H') },
      { label: '|di/dt| máx', value: fmtSI(maxDidt, 'A/s') },
      { label: '|V_L| máx', value: fmtSI(m.maxAbsVL, 'V') },
      { label: 'E_L máx', value: fmtSI(maxEL, 'J') },
    ],
    paragraphs: p,
  };
}

function capacitorCard(s: Snapshot, up?: Scenario): ComponentCard {
  const { C } = s.config.params;
  const m = s.measured;
  const maxEC = (m.maxAbsQ * m.maxAbsQ) / (2 * C);
  const exc = s.config.excitation;
  const p: string[] = [];
  p.push(`El capacitor llegó a una carga máxima de ${fmtSI(m.maxAbsQ, 'C')}, con V_C = q/C = ${fmtSI(m.maxAbsVC, 'V')} y ${fmtSI(maxEC, 'J')} almacenados en su campo eléctrico (E_C = q²/2C). Al final tenía ${fmtSI(s.final.q, 'C')}${exc.kind === 'step' ? ` (equilibrio C·E₀ = ${fmtSI(C * exc.E0, 'C')})` : ''}.`);
  p.push(`C actúa como el "resorte" del circuito y fija, junto con L, la frecuencia natural ω₀ = 1/√(LC) = ${n(s.analysis.omega0)} rad/s.`);
  if (up) p.push(`Si C aumenta: ${scenarioCard(up).text}`);
  return {
    id: 'capacitor',
    title: 'Capacitor',
    symbol: 'C',
    metrics: [
      { label: 'C', value: fmtSI(C, 'F') },
      { label: '|q| máx', value: fmtSI(m.maxAbsQ, 'C') },
      { label: '|V_C| máx', value: fmtSI(m.maxAbsVC, 'V') },
      { label: 'E_C máx', value: fmtSI(maxEC, 'J') },
    ],
    paragraphs: p,
  };
}

function sourceCard(s: Snapshot): ComponentCard {
  const exc = s.config.excitation;
  const m = s.measured;
  const p: string[] = [];
  if (exc.kind === 'step') p.push(`Fuente DC (escalón) de ${fmtSI(exc.E0, 'V')}: empuja la carga hacia C·E₀. Entregó ${fmtSI(m.energyDelivered, 'J')} durante la corrida.`);
  else if (exc.kind === 'sine') {
    const r = s.resonance!;
    p.push(`Fuente AC: E(t) = ${fmtSI(exc.E0, 'V')}·sin(${n(exc.omega)}t). Entregó ${fmtSI(m.energyDelivered, 'J')} netos.`);
    p.push(`Su frecuencia ω = ${n(exc.omega)} rad/s comparada con ω₀ = ${n(r.omega0)} rad/s decide la amplitud: ${r.near ? 'está en resonancia y la corriente se acerca a E₀/R' : `fuera de resonancia la corriente queda en el ${pct((100 * r.currentAmplitude) / r.peakCurrent)} de su máximo`}.`);
  } else p.push('Fuente apagada (E = 0): no aporta energía; el circuito solo gasta la que tenía al inicio.');
  return {
    id: 'source',
    title: 'Fuente',
    symbol: 'E',
    metrics: [
      { label: 'Tipo', value: exc.kind === 'step' ? 'Escalón (DC)' : exc.kind === 'sine' ? 'Senoidal (AC)' : 'Apagada' },
      { label: 'E₀', value: exc.kind === 'free' ? '—' : fmtSI(exc.E0, 'V') },
      { label: 'ω', value: exc.kind === 'sine' ? `${n(exc.omega)} rad/s` : '—' },
      { label: 'Energía entregada', value: fmtSI(m.energyDelivered, 'J') },
    ],
    paragraphs: p,
  };
}
