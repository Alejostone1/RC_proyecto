/**
 * FASE 1 — Motor matemático: modelo, RK4, excitaciones, clasificación, energía,
 * paso fijo y manejo de errores. Las referencias exactas usadas aquí son
 * soluciones cerradas elementales (no dependen de AnalyticalSolver).
 */
import { describe, expect, it } from 'vitest';
import { classifyDamping } from '../src/physics/DampingClassifier';
import { computeEnergy } from '../src/physics/EnergyCalculator';
import { evaluateExcitation, freeExcitation, sineExcitation, stepExcitation } from '../src/physics/Excitation';
import { createRLCDerivative, validateParams, voltageDrops, type RLCParams } from '../src/physics/RLCModel';
import { RK4Solver, integrate } from '../src/physics/RK4Solver';
import { FixedTimestep } from '../src/simulation/FixedTimestep';
import { SimulationEngine } from '../src/simulation/SimulationEngine';

// Circuito de referencia: ω₀ = 1/√(0.5·0.02) = 10 rad/s, R_c = 2√(0.5/0.02) = 10 Ω
const BASE: Omit<RLCParams, 'R'> = { L: 0.5, C: 0.02 };
const p = (R: number): RLCParams => ({ R, ...BASE });

describe('Excitaciones E(t)', () => {
  it('escalón, senoidal y libre', () => {
    expect(evaluateExcitation(stepExcitation(12), 3.7)).toBe(12);
    expect(evaluateExcitation(sineExcitation(5, 2), Math.PI / 4)).toBeCloseTo(5, 12);
    expect(evaluateExcitation(freeExcitation(), 1)).toBe(0);
  });
});

describe('Validación de parámetros', () => {
  it('rechaza L = 0, C = 0, R < 0, NaN e Infinity', () => {
    expect(validateParams({ R: 1, L: 0, C: 1 })).toHaveLength(1);
    expect(validateParams({ R: 1, L: 1, C: 0 })).toHaveLength(1);
    expect(validateParams({ R: -1, L: 1, C: 1 })).toHaveLength(1);
    expect(validateParams({ R: NaN, L: 1, C: 1 })).toHaveLength(1);
    expect(validateParams({ R: 1, L: Infinity, C: 1 })).toHaveLength(1);
    expect(validateParams({ R: 0, L: 1, C: 1 })).toHaveLength(0);
    expect(() => createRLCDerivative({ R: 1, L: 0, C: 1 }, freeExcitation())).toThrow(RangeError);
  });
  it('detecta valores fuera de rango cuando se pide', () => {
    expect(validateParams({ R: 5000, L: 1, C: 0.1 }, true).length).toBeGreaterThan(0);
  });
});

describe('Sistema de primer orden f(t, x)', () => {
  it('x₁\' = i  y  x₂\' = (E − R i − q/C)/L', () => {
    const f = createRLCDerivative({ R: 3, L: 2, C: 0.5 }, stepExcitation(10));
    const out = new Float64Array(2);
    f(0, Float64Array.of(1.5, -2), out);
    expect(out[0]).toBe(-2);
    expect(out[1]).toBeCloseTo((10 - 3 * -2 - 1.5 / 0.5) / 2, 14); // = 6.5
  });
  it('las caídas de tensión suman E(t) (Kirchhoff)', () => {
    const exc = sineExcitation(7, 3);
    const v = voltageDrops({ R: 4, L: 0.3, C: 0.1 }, exc, 0.42, 0.13, -0.8);
    expect(v.VR + v.VL + v.VC).toBeCloseTo(evaluateExcitation(exc, 0.42), 13);
  });
});

describe('RK4', () => {
  it('es de cuarto orden: reducir h a la mitad divide el error ≈ 16', () => {
    // x' = −x, x(0)=1 → e^{−t}
    const f = (_t: number, x: Float64Array, o: Float64Array) => {
      o[0] = -x[0];
    };
    const err = (h: number) => {
      const r = integrate(f, [1], 1, h);
      return Math.abs(r.x[0][r.x[0].length - 1] - Math.exp(-1));
    };
    const ratio = err(0.1) / err(0.05);
    expect(ratio).toBeGreaterThan(14);
    expect(ratio).toBeLessThan(18);
  });

  it('funciona con estado vectorial [q, i] y es exacto en un paso para un sistema lineal en t', () => {
    // x₁' = x₂, x₂' = 1 → x₁ = t²/2 (polinomio de grado 2: RK4 exacto)
    const f = (_t: number, x: Float64Array, o: Float64Array) => {
      o[0] = x[1];
      o[1] = 1;
    };
    const x = Float64Array.of(0, 0);
    new RK4Solver(2).step(f, 0, x, 0.7);
    expect(x[0]).toBeCloseTo(0.245, 14);
    expect(x[1]).toBeCloseTo(0.7, 14);
  });
});

describe('Prueba 1 — R = 0 (LC ideal)', () => {
  it('q(t) = q₀ cos(ω₀ t) con descarga libre', () => {
    const params = p(0);
    const f = createRLCDerivative(params, freeExcitation());
    const h = 1e-3;
    const r = integrate(f, [1e-3, 0], 2, h);
    let maxErr = 0;
    for (let n = 0; n < r.t.length; n++) {
      maxErr = Math.max(maxErr, Math.abs(r.x[0][n] - 1e-3 * Math.cos(10 * r.t[n])));
    }
    expect(classifyDamping(params).regime).toBe('undamped');
    // error relativo a la amplitud q₀ = 1e-3 C; teórico O((hω₀)⁴·ω₀t) ≈ 1e-9
    expect(maxErr / 1e-3).toBeLessThan(1e-8);
  });
});

describe('Pruebas 2–4 — Clasificación del régimen', () => {
  it('R < R_c → subamortiguado', () => {
    const a = classifyDamping(p(2));
    expect(a.regime).toBe('underdamped');
    expect(a.alpha).toBeCloseTo(2, 14);
    expect(a.omega0).toBeCloseTo(10, 12);
    expect(a.omegaD).toBeCloseTo(Math.sqrt(96), 12);
    expect(a.Rc).toBeCloseTo(10, 12);
  });
  it('R = R_c (calculado) → crítico, aun con redondeo', () => {
    const Rc = 2 * Math.sqrt(BASE.L / BASE.C);
    expect(classifyDamping(p(Rc)).regime).toBe('critical');
    expect(classifyDamping(p(Rc * (1 + 1e-12))).regime).toBe('critical');
    // un caso "feo": L y C sin representación exacta
    const q: RLCParams = { L: 0.3, C: 0.07, R: 2 * Math.sqrt(0.3 / 0.07) };
    expect(classifyDamping(q).regime).toBe('critical');
  });
  it('R > R_c → sobreamortiguado, raíces reales negativas', () => {
    const a = classifyDamping(p(30));
    expect(a.regime).toBe('overdamped');
    expect(a.roots[0].re).toBeLessThan(0);
    expect(a.roots[1].re).toBeLessThan(a.roots[0].re);
    // s₁ s₂ = 1/(LC) y s₁ + s₂ = −R/L (Vieta)
    expect(a.roots[0].re * a.roots[1].re).toBeCloseTo(100, 9);
    expect(a.roots[0].re + a.roots[1].re).toBeCloseTo(-60, 12);
  });
  it('desviaciones pequeñas pero reales NO se clasifican como críticas', () => {
    expect(classifyDamping(p(9.99)).regime).toBe('underdamped');
    expect(classifyDamping(p(10.01)).regime).toBe('overdamped');
  });
});

describe('Respuesta al escalón', () => {
  it('q(t) → C·E₀ e i(t) → 0', () => {
    const f = createRLCDerivative(p(4), stepExcitation(12));
    const r = integrate(f, [0, 0], 10, 1e-3);
    const last = r.t.length - 1;
    expect(r.x[0][last]).toBeCloseTo(0.02 * 12, 9);
    expect(r.x[1][last]).toBeCloseTo(0, 9);
  });
});

describe('Prueba 6 — Descarga libre', () => {
  it('la energía total decrece monótonamente con R > 0 y q → 0', () => {
    const params = p(3);
    const r = integrate(createRLCDerivative(params, freeExcitation()), [5e-3, 0], 5, 1e-3);
    let prev = Infinity;
    for (let n = 0; n < r.t.length; n++) {
      const e = computeEnergy(params, r.x[0][n], r.x[1][n]).total;
      expect(e).toBeLessThanOrEqual(prev + 1e-18);
      prev = e;
    }
    expect(Math.abs(r.x[0][r.t.length - 1])).toBeLessThan(1e-8);
  });
});

describe('Prueba 8 — Conservación de energía con R = 0', () => {
  it('E_C + E_L se conserva (deriva relativa < 1e-9 en 50 períodos)', () => {
    const params = p(0);
    const r = integrate(createRLCDerivative(params, freeExcitation()), [2e-3, 0.05], 50 * (2 * Math.PI) / 10, 1e-3);
    const e0 = computeEnergy(params, r.x[0][0], r.x[1][0]).total;
    let maxDrift = 0;
    for (let n = 0; n < r.t.length; n++) {
      const e = computeEnergy(params, r.x[0][n], r.x[1][n]).total;
      maxDrift = Math.max(maxDrift, Math.abs(e - e0) / e0);
    }
    expect(maxDrift).toBeLessThan(1e-9);
  });

  it('balance general: ΔE = ∫(E·i − R i²) dt', () => {
    const params = p(1.5);
    const exc = sineExcitation(10, 8);
    const h = 1e-3;
    const r = integrate(createRLCDerivative(params, exc), [0, 0], 3, h);
    // trapecio sobre la potencia neta
    let work = 0;
    const power = (n: number) => evaluateExcitation(exc, r.t[n]) * r.x[1][n] - params.R * r.x[1][n] ** 2;
    for (let n = 1; n < r.t.length; n++) work += 0.5 * h * (power(n - 1) + power(n));
    const last = r.t.length - 1;
    const dE = computeEnergy(params, r.x[0][last], r.x[1][last]).total;
    expect(Math.abs(dE - work)).toBeLessThan(1e-5 * Math.max(1, Math.abs(dE)));
  });
});

describe('Paso fijo y motor de simulación', () => {
  it('el resultado no depende del FPS ni de la velocidad', () => {
    const cfg = { params: p(2), excitation: sineExcitation(10, 7), initial: { q0: 0, i0: 0 } };
    const a = new SimulationEngine(cfg);
    const b = new SimulationEngine(cfg);
    a.start();
    b.start();
    // a: 60 FPS a velocidad 1 durante ~1 s; b: 144 FPS a velocidad 0.5 durante ~2 s
    for (let k = 0; k < 60; k++) a.update(1 / 60, 1);
    for (let k = 0; k < 288; k++) b.update(1 / 144, 0.5);
    // ambos consumieron el mismo número de pasos fijos (± 1 por redondeo del acumulador)
    const stepsA = Math.round(a.state.t / a.h);
    const stepsB = Math.round(b.state.t / b.h);
    expect(Math.abs(stepsA - stepsB)).toBeLessThanOrEqual(1);
    // y en el mismo t el estado es idéntico
    const c = new SimulationEngine(cfg);
    c.stepN(stepsA);
    expect(c.state.q).toBe(a.state.q);
    expect(c.state.i).toBe(a.state.i);
  });

  it('FixedTimestep respeta el tope de subpasos', () => {
    const clock = new FixedTimestep(1e-3, 100);
    let n = 0;
    clock.advance(10, 1, () => (n++, true));
    expect(n).toBe(100);
    expect(clock.saturated).toBe(true);
  });

  it('pausar detiene el avance; reiniciar vuelve a las condiciones iniciales', () => {
    const e = new SimulationEngine({ params: p(2), excitation: freeExcitation(), initial: { q0: 1e-3, i0: 0 } });
    e.start();
    e.update(0.1);
    e.pause();
    const t = e.state.t;
    e.update(0.1);
    expect(e.state.t).toBe(t);
    e.reset();
    expect(e.state.t).toBe(0);
    expect(e.state.q).toBe(1e-3);
    expect(e.state.status).toBe('idle');
  });

  it('el estado expone V_R + V_L + V_C = E(t) y energías coherentes', () => {
    const e = new SimulationEngine({ params: p(2), excitation: stepExcitation(9), initial: { q0: 0, i0: 0 } });
    e.stepN(437);
    const s = e.state;
    expect(s.VR + s.VL + s.VC).toBeCloseTo(s.E, 12);
    expect(s.EC).toBeCloseTo(s.q ** 2 / (2 * 0.02), 15);
    expect(s.PR).toBeCloseTo(s.i ** 2 * 2, 15);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => new SimulationEngine({ params: { R: 1, L: 0, C: 1 }, excitation: freeExcitation(), initial: { q0: 0, i0: 0 } })).toThrow(RangeError);
    expect(() => new SimulationEngine({ params: p(1), excitation: freeExcitation(), initial: { q0: NaN, i0: 0 } })).toThrow(RangeError);
  });

  it('detecta desbordamiento, se detiene y conserva el último estado finito', () => {
    const e = new SimulationEngine({ params: p(1), excitation: stepExcitation(1e300), initial: { q0: 0, i0: 0 } });
    e.start();
    e.update(1);
    expect(e.state.status).toBe('error');
    expect(e.state.error).toMatch(/desbordamiento|NaN/);
    expect(Number.isFinite(e.state.q)).toBe(true);
    expect(Number.isFinite(e.state.i)).toBe(true);
  });
});
