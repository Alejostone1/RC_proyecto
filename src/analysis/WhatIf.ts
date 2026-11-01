/**
 * Escenarios "¿qué pasaría si…?" calculados, no supuestos: para cada cambio de
 * parámetro se vuelve a clasificar el sistema y se mide la respuesta EXACTA
 * (mismo algoritmo de medición que en la corrida real).
 */
import { classifyDamping, type DampingAnalysis } from '../physics/DampingClassifier';
import { currentAmplitude } from '../physics/Resonance';
import { criticalResistance } from '../physics/RLCModel';
import { computeScales, representativeHorizon } from '../physics/Scales';
import type { LabConfig } from '../ui/Presets';
import { deriveMeasurements, exactStatistics, type Measurements } from './Measurements';

export interface ResponseMetrics {
  analysis: DampingAnalysis;
  m: Measurements;
  /** Amplitud permanente de corriente (senoidal), en A. */
  steadyCurrent: number | null;
  horizon: number;
}

export type ScenarioId = 'R_up' | 'R_down' | 'R_crit' | 'L_up' | 'C_up' | 'w_res' | 'w_away';

export interface Scenario {
  id: ScenarioId;
  title: string;
  /** Parámetro que cambia, con valores antes → después (texto). */
  change: string;
  base: ResponseMetrics;
  next: ResponseMetrics;
  config: LabConfig;
}

export function responseMetrics(cfg: LabConfig): ResponseMetrics {
  const analysis = classifyDamping(cfg.params);
  const horizon = Math.min(60, 1.5 * representativeHorizon(analysis, cfg.excitation));
  const scales = computeScales(cfg.params, cfg.excitation, cfg.initial, analysis);
  const fastest = Math.max(analysis.omega0, Math.abs(analysis.roots[1].re), cfg.excitation.kind === 'sine' ? cfg.excitation.omega : 0);
  const dt = Math.min(horizon / 2000, 0.05 / fastest);
  const st = exactStatistics(cfg.params, cfg.excitation, cfg.initial, horizon, dt, scales.q);
  const steadyCurrent = cfg.excitation.kind === 'sine' ? currentAmplitude(cfg.params, cfg.excitation.E0, cfg.excitation.omega) : null;
  return { analysis, m: deriveMeasurements(st, cfg.excitation, cfg.initial, analysis), steadyCurrent, horizon };
}

const f = (x: number, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '∞');

export function buildScenarios(cfg: LabConfig): Scenario[] {
  const base = responseMetrics(cfg);
  const { R, L, C } = cfg.params;
  const Rc = criticalResistance(cfg.params);
  const out: Scenario[] = [];
  const add = (id: ScenarioId, title: string, change: string, next: LabConfig) => {
    out.push({ id, title, change, base, next: responseMetrics(next), config: next });
  };
  const withParams = (p: Partial<LabConfig['params']>): LabConfig => ({ ...cfg, params: { ...cfg.params, ...p } });

  const Rup = R > 0 ? 2 * R : 0.2 * Rc;
  add('R_up', 'Si aumentamos R', `R: ${f(R)} → ${f(Rup)} Ω`, withParams({ R: Rup }));
  if (R > 0) add('R_down', 'Si disminuimos R', `R: ${f(R)} → ${f(R / 2)} Ω`, withParams({ R: R / 2 }));
  if (base.analysis.regime !== 'critical') add('R_crit', 'Si usamos la resistencia crítica', `R: ${f(R)} → R_c = ${f(Rc)} Ω`, withParams({ R: Rc }));
  add('L_up', 'Si aumentamos L', `L: ${f(L)} → ${f(2 * L)} H`, withParams({ L: 2 * L }));
  add('C_up', 'Si aumentamos C', `C: ${f(C)} → ${f(2 * C)} F`, withParams({ C: 2 * C }));
  if (cfg.excitation.kind === 'sine') {
    const w0 = base.analysis.omega0;
    const near = Math.abs(cfg.excitation.omega - w0) <= Math.max(base.analysis.alpha, 0.02 * w0);
    const w = near ? 1.6 * w0 : w0;
    add(
      near ? 'w_away' : 'w_res',
      near ? 'Si nos alejamos de la resonancia' : 'Si sintonizamos la resonancia',
      `ω: ${f(cfg.excitation.omega)} → ${f(w)} rad/s`,
      { ...cfg, excitation: { ...cfg.excitation, omega: w } },
    );
  }
  return out;
}
