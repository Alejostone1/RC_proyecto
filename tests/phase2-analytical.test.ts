/**
 * FASE 2 — Solución analítica y validación cruzada con RK4.
 */
import { describe, expect, it } from 'vitest';
import {
  chargeResonanceFrequency,
  solveAnalytically,
  steadyStateAmplitudes,
} from '../src/physics/AnalyticalSolver';
import { evaluateExcitation, freeExcitation, sineExcitation, stepExcitation, type Excitation } from '../src/physics/Excitation';
import type { InitialConditions, RLCParams } from '../src/physics/RLCModel';
import { compareSolutions } from '../src/physics/SolutionComparison';

const BASE = { L: 0.5, C: 0.02 }; // ω₀ = 10 rad/s, R_c = 10 Ω
const RC = 2 * Math.sqrt(BASE.L / BASE.C);
const REGIMES: Array<[string, RLCParams]> = [
  ['sin amortiguamiento', { R: 0, ...BASE }],
  ['subamortiguado', { R: 2, ...BASE }],
  ['crítico', { R: RC, ...BASE }],
  ['sobreamortiguado', { R: 30, ...BASE }],
];
const EXCITATIONS: Array<[string, Excitation]> = [
  ['libre', freeExcitation()],
  ['escalón', stepExcitation(12)],
  ['senoidal', sineExcitation(10, 7)],
];
const IC: InitialConditions = { q0: 0.05, i0: -0.3 };

describe('Ejemplo del libro (Zill, sec. 5.1): L = 1/4 H, R = 10 Ω, C = 1/1000 F, E = 0, q(0) = q₀, i(0) = 0', () => {
  it('q(t) = q₀ e^(−20t)(cos 60t + ⅓ sin 60t)', () => {
    const q0 = 1;
    const sol = solveAnalytically({ L: 0.25, R: 10, C: 0.001 }, freeExcitation(), { q0, i0: 0 });
    expect(sol.analysis.regime).toBe('underdamped');
    expect(sol.analysis.alpha).toBeCloseTo(20, 12);
    expect(sol.analysis.omegaD).toBeCloseTo(60, 10);
    for (const t of [0, 0.01, 0.037, 0.1, 0.25]) {
      const book = q0 * Math.exp(-20 * t) * (Math.cos(60 * t) + Math.sin(60 * t) / 3);
      expect(sol.evaluate(t).q).toBeCloseTo(book, 13);
    }
  });
});

describe('La solución analítica cumple condiciones iniciales y la EDO', () => {
  for (const [rName, params] of REGIMES) {
    for (const [eName, exc] of EXCITATIONS) {
      it(`${rName} · ${eName}`, () => {
        const sol = solveAnalytically(params, exc, IC);
        const s0 = sol.evaluate(0);
        expect(s0.q).toBeCloseTo(IC.q0, 13);
        expect(s0.i).toBeCloseTo(IC.i0, 12);
        // Residuo de L q'' + R q' + q/C − E(t), con q'' por diferencia central de i(t)
        const d = 1e-6;
        for (const t of [0.05, 0.3, 1.1]) {
          const s = sol.evaluate(t);
          const ip = sol.evaluate(t + d).i;
          const im = sol.evaluate(t - d).i;
          const qpp = (ip - im) / (2 * d);
          const residual = params.L * qpp + params.R * s.i + s.q / params.C - evaluateExcitation(exc, t);
          expect(Math.abs(residual)).toBeLessThan(1e-5);
          // i(t) analítica = derivada de q(t)
          const dq = (sol.evaluate(t + d).q - sol.evaluate(t - d).q) / (2 * d);
          expect(s.i).toBeCloseTo(dq, 6);
        }
      });
    }
  }
});

describe('Prueba 7 — Comparación RK4 vs analítica', () => {
  for (const [rName, params] of REGIMES) {
    for (const [eName, exc] of EXCITATIONS) {
      it(`${rName} · ${eName}: error relativo máximo < 1e-8`, () => {
        const cmp = compareSolutions(params, exc, IC, 5, 1e-3);
        expect(Number.isFinite(cmp.maxError)).toBe(true);
        expect(cmp.maxRelativeError).toBeLessThan(1e-8);
      });
    }
  }

  it('el error de RK4 converge con orden 4 frente a la solución exacta', () => {
    const params = REGIMES[1][1];
    const e1 = compareSolutions(params, sineExcitation(10, 7), IC, 2, 0.01).maxError;
    const e2 = compareSolutions(params, sineExcitation(10, 7), IC, 2, 0.005).maxError;
    expect(e1 / e2).toBeGreaterThan(13);
    expect(e1 / e2).toBeLessThan(19);
  });
});

describe('Prueba 5 — Excitación senoidal y resonancia', () => {
  const params: RLCParams = { R: 1, ...BASE };

  it('respuesta total = transitoria (→ 0) + permanente', () => {
    const sol = solveAnalytically(params, sineExcitation(10, 7), { q0: 0, i0: 0 });
    // α = 1 s⁻¹: para t = 20 s la transitoria vale ~e^{−20} ≈ 2e-9 de su escala
    expect(Math.abs(sol.natural.evaluate(20, { q: 0, i: 0 }).q)).toBeLessThan(1e-9);
    expect(sol.forced.kind).toBe('sinusoidal');
    expect(sol.forced.chargeAmplitude).toBeCloseTo(steadyStateAmplitudes(params, 10, 7).charge, 14);
  });

  it('en ω = ω₀ la amplitud de corriente es exactamente E₀/R (finita con R > 0)', () => {
    const amp = steadyStateAmplitudes(params, 10, 10);
    expect(amp.current).toBeCloseTo(10 / params.R, 12);
    // y es el máximo de |i| en ω
    for (const w of [5, 9, 9.9, 10.1, 11, 20]) {
      expect(steadyStateAmplitudes(params, 10, w).current).toBeLessThan(amp.current);
    }
  });

  it('la amplitud de carga es máxima en ω_r = √(ω₀² − 2α²), no en ω₀', () => {
    const wr = chargeResonanceFrequency({ R: 4, ...BASE });
    expect(wr).toBeCloseTo(Math.sqrt(100 - 2 * 16), 12);
    const f = (w: number) => steadyStateAmplitudes({ R: 4, ...BASE }, 1, w).charge;
    expect(f(wr)).toBeGreaterThan(f(wr - 0.05));
    expect(f(wr)).toBeGreaterThan(f(wr + 0.05));
    expect(f(wr)).toBeGreaterThan(f(10));
  });

  it('R = 0 y ω = ω₀: resonancia pura, amplitud crece linealmente y RK4 coincide', () => {
    const p0: RLCParams = { R: 0, ...BASE };
    const sol = solveAnalytically(p0, sineExcitation(10, 10), { q0: 0, i0: 0 });
    expect(sol.forced.kind).toBe('pure-resonance');
    // envolvente E₀/(2Lω₀)·t = t: en t = 10 s la carga llega a ~10 C
    const peak = (t0: number) => {
      let m = 0;
      for (let t = t0; t < t0 + 0.7; t += 1e-3) m = Math.max(m, Math.abs(sol.evaluate(t).q));
      return m;
    };
    expect(peak(10) / peak(5)).toBeGreaterThan(1.8);
    const cmp = compareSolutions(p0, sineExcitation(10, 10), { q0: 0, i0: 0 }, 10, 1e-3);
    expect(cmp.maxRelativeError).toBeLessThan(1e-8);
  });
});

describe('Robustez cerca del punto crítico', () => {
  it('R ligeramente por debajo y por encima de R_c da curvas continuas con el caso crítico', () => {
    const at = (R: number) => solveAnalytically({ R, ...BASE }, stepExcitation(5), IC).evaluate(0.4).q;
    const crit = at(RC);
    expect(Math.abs(at(RC * (1 - 1e-6)) - crit)).toBeLessThan(1e-6);
    expect(Math.abs(at(RC * (1 + 1e-6)) - crit)).toBeLessThan(1e-6);
  });
});
