/**
 * "Fotografía matemática" de la simulación: copia inmutable de la configuración,
 * el estado inicial y final, las estadísticas de la corrida, las mediciones
 * (RK4) y sus valores teóricos (solución exacta) y las series para graficar.
 */
import { solveAnalytically } from '../physics/AnalyticalSolver';
import type { DampingAnalysis } from '../physics/DampingClassifier';
import { evaluateExcitation } from '../physics/Excitation';
import { analyzeResonance, type ResonanceInfo } from '../physics/Resonance';
import type { PhysicalScales } from '../physics/Scales';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { LabConfig } from '../ui/Presets';
import { deriveMeasurements, exactStatistics, type Measurements } from './Measurements';

export interface CircuitState {
  t: number;
  q: number;
  i: number;
  E: number;
  VR: number;
  VL: number;
  VC: number;
  EC: number;
  EL: number;
  total: number;
  PR: number;
}

export interface Series {
  t: number[];
  q: number[];
  i: number[];
  VL: number[];
  VC: number[];
  EC: number[];
  EL: number[];
}

export interface Snapshot {
  id: number;
  takenAt: string;
  config: LabConfig;
  analysis: DampingAnalysis;
  scales: PhysicalScales;
  h: number;
  initial: CircuitState;
  final: CircuitState;
  measured: Measurements;
  theoretical: Measurements;
  /** Amplitud permanente de i medida en las últimas oscilaciones (solo senoidal). */
  steadyCurrentMeasured: number | null;
  resonance: ResonanceInfo | null;
  /** Fracción media de la energía almacenada que estuvo en el capacitor (0–1). */
  capacitorShare: number;
  series: Series;
  status: string;
}

let nextId = 1;

function stateAt(cfg: LabConfig, t: number, q: number, i: number): CircuitState {
  const { R, L, C } = cfg.params;
  const E = evaluateExcitation(cfg.excitation, t);
  const VR = R * i;
  const VC = q / C;
  const EC = (q * q) / (2 * C);
  const EL = 0.5 * L * i * i;
  return { t, q, i, E, VR, VC, VL: E - VR - VC, EC, EL, total: EC + EL, PR: i * i * R };
}

export function captureSnapshot(engine: SimulationEngine, maxPoints = 600): Snapshot {
  const cfg: LabConfig = {
    params: { ...engine.params },
    excitation: { ...engine.excitation },
    initial: { ...engine.initial },
  };
  const s = engine.state;
  const initial = stateAt(cfg, 0, cfg.initial.q0, cfg.initial.i0);
  const final = stateAt(cfg, s.t, s.q, s.i);
  const measured = deriveMeasurements(engine.stats, cfg.excitation, cfg.initial, engine.analysis);

  // Mismas mediciones sobre la solución exacta en el mismo intervalo
  const tEnd = Math.max(s.t, engine.h);
  const dt = Math.max(engine.h, tEnd / 400_000);
  const exact = exactStatistics(cfg.params, cfg.excitation, cfg.initial, tEnd, dt, engine.scales.q);
  const theoretical = deriveMeasurements(exact, cfg.excitation, cfg.initial, engine.analysis);

  // Series del historial (submuestreadas) para las mini-gráficas del informe
  const hist = engine.history;
  const n = hist.length;
  const stride = Math.max(1, Math.ceil(n / maxPoints));
  const series: Series = { t: [], q: [], i: [], VL: [], VC: [], EC: [], EL: [] };
  let shareSum = 0;
  let shareCnt = 0;
  for (let k = 0; k < n; k += stride) {
    const q = hist.get('q', k);
    const i = hist.get('i', k);
    const EC = (q * q) / (2 * cfg.params.C);
    const EL = 0.5 * cfg.params.L * i * i;
    series.t.push(hist.get('t', k));
    series.q.push(q);
    series.i.push(i);
    series.VL.push(hist.get('VL', k));
    series.VC.push(hist.get('VC', k));
    series.EC.push(EC);
    series.EL.push(EL);
    if (EC + EL > 0) {
      shareSum += EC / (EC + EL);
      shareCnt++;
    }
  }

  // Senoidal: amplitud de i en las dos últimas oscilaciones forzadas
  let steadyCurrentMeasured: number | null = null;
  let resonance: ResonanceInfo | null = null;
  if (cfg.excitation.kind === 'sine' && cfg.excitation.omega > 0) {
    resonance = analyzeResonance(cfg.params, cfg.excitation.E0, cfg.excitation.omega);
    const window = (2 * 2 * Math.PI) / cfg.excitation.omega;
    if (n > 1 && s.t > window) {
      let m = 0;
      for (let k = hist.indexAtTime(s.t - window); k < n; k++) m = Math.max(m, Math.abs(hist.get('i', k)));
      steadyCurrentMeasured = m;
    }
  }

  return {
    id: nextId++,
    takenAt: new Date().toISOString(),
    config: cfg,
    analysis: { ...engine.analysis },
    scales: { ...engine.scales },
    h: engine.h,
    initial,
    final,
    measured,
    theoretical,
    steadyCurrentMeasured,
    resonance,
    capacitorShare: shareCnt ? shareSum / shareCnt : 0.5,
    series,
    status: s.status,
  };
}

/** Tiempo a partir del cual el transitorio es despreciable (≈ 5 constantes de tiempo). */
export function transientTime(a: DampingAnalysis): number {
  const slow = Math.min(Math.abs(a.roots[0].re), Math.abs(a.roots[1].re));
  return slow > 0 ? 5 / slow : Infinity;
}

/** Valor exacto de q(t) e i(t) en t (útil para comprobar el estado final). */
export function exactAt(cfg: LabConfig, t: number): { q: number; i: number } {
  return solveAnalytically(cfg.params, cfg.excitation, cfg.initial).evaluate(t);
}
