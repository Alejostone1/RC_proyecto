/**
 * FASE 3 — Validación ampliada: motor completo vs. solución exacta, historial,
 * escalas físicas, resonancia y presets.
 */
import { describe, expect, it } from 'vitest';
import { solveAnalytically } from '../src/physics/AnalyticalSolver';
import { classifyDamping } from '../src/physics/DampingClassifier';
import { analyzeResonance, currentAmplitude } from '../src/physics/Resonance';
import { computeScales } from '../src/physics/Scales';
import { History } from '../src/simulation/History';
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { PRESETS } from '../src/ui/Presets';

describe('Motor completo vs. solución exacta (pasos y FPS reales)', () => {
  for (const preset of Object.values(PRESETS)) {
    it(`${preset.label}: SimulationEngine coincide con la analítica tras 3 s simulados`, () => {
      const cfg = preset.build();
      const e = new SimulationEngine(cfg);
      e.start();
      for (let k = 0; k < 180; k++) e.update(1 / 60, 1);
      const exact = solveAnalytically(cfg.params, cfg.excitation, cfg.initial).evaluate(e.state.t);
      expect(Math.abs(e.state.q - exact.q)).toBeLessThan(1e-8 * Math.max(1, e.scales.q));
      expect(Math.abs(e.state.i - exact.i)).toBeLessThan(1e-7 * Math.max(1, e.scales.i));
    });
  }
});

describe('Presets', () => {
  it('cada preset produce el régimen anunciado', () => {
    expect(classifyDamping(PRESETS.underdamped.build().params).regime).toBe('underdamped');
    expect(classifyDamping(PRESETS.critical.build().params).regime).toBe('critical');
    expect(classifyDamping(PRESETS.overdamped.build().params).regime).toBe('overdamped');
    const r = PRESETS.resonance.build();
    expect(r.excitation.kind).toBe('sine');
    expect(analyzeResonance(r.params, r.excitation.E0, r.excitation.omega).near).toBe(true);
  });
});

describe('Historial circular', () => {
  it('mantiene orden cronológico al desbordar y busca por tiempo', () => {
    const h = new History(5);
    for (let k = 0; k < 8; k++) h.push(k, k * 10, 0, 0, 0, 0);
    expect(h.length).toBe(5);
    expect(h.get('t', 0)).toBe(3);
    expect(h.get('q', 4)).toBe(70);
    expect(h.indexAtTime(5.5)).toBe(3);
    expect(h.latestTime()).toBe(7);
  });

  it('el motor muestrea a sampleDt y registra V_L + V_C + R·i = E', () => {
    const cfg = PRESETS.underdamped.build();
    const e = new SimulationEngine(cfg);
    e.stepN(Math.round(1 / e.h));
    const n = e.history.length;
    expect(n).toBeGreaterThan(100);
    const dt = e.history.get('t', 1) - e.history.get('t', 0);
    expect(dt).toBeCloseTo(e.sampleDt, 12);
    for (const k of [0, 10, n - 1]) {
      const sum = e.history.get('VL', k) + e.history.get('VC', k) + cfg.params.R * e.history.get('i', k);
      expect(sum).toBeCloseTo(e.history.get('E', k), 9);
    }
  });
});

describe('Escalas físicas', () => {
  it('escalón subamortiguado: máx q ≈ 2·C·E₀·(1 − sobrepico)', () => {
    const cfg = PRESETS.underdamped.build();
    const a = classifyDamping(cfg.params);
    const s = computeScales(cfg.params, cfg.excitation, cfg.initial, a);
    // primer pico en t = π/ω_d: q = C·E₀·(1 + e^{−απ/ω_d})
    const peak = cfg.params.C * 10 * (1 + Math.exp((-a.alpha * Math.PI) / a.omegaD));
    expect(s.q).toBeCloseTo(peak, 4);
    expect(s.PR).toBeCloseTo(s.i ** 2 * cfg.params.R, 10);
  });
});

describe('Resonancia', () => {
  const p = { R: 1, L: 0.5, C: 0.02 };
  it('|I(ω₀)| = E₀/R y decrece al alejarse', () => {
    expect(currentAmplitude(p, 10, 10)).toBeCloseTo(10, 12);
    expect(currentAmplitude(p, 10, 5)).toBeLessThan(10);
    expect(currentAmplitude(p, 10, 20)).toBeLessThan(10);
  });
  it('el criterio "cerca" usa el semiancho de banda α', () => {
    expect(analyzeResonance(p, 10, 10.9).near).toBe(true); // α = 1
    expect(analyzeResonance(p, 10, 11.5).near).toBe(false);
  });
  it('R = 0: el pico teórico es infinito, pero no se afirma para R > 0', () => {
    expect(analyzeResonance({ ...p, R: 0 }, 10, 10).peakCurrent).toBe(Infinity);
    expect(Number.isFinite(analyzeResonance(p, 10, 10).peakCurrent)).toBe(true);
  });
});
