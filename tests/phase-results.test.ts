/**
 * Etapa 2 — Captura de resultados, mediciones, escenarios "qué pasaría si",
 * intérprete, potenciales de nodo y balance de energía acumulado.
 */
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/analysis/Interpreter';
import { captureSnapshot } from '../src/analysis/Snapshot';
import { buildScenarios, responseMetrics } from '../src/analysis/WhatIf';
import { classifyDamping } from '../src/physics/DampingClassifier';
import { nodePotentials } from '../src/physics/NodePotentials';
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { PRESETS, type LabConfig } from '../src/ui/Presets';
import { PALETTES } from '../src/utils/Theme';
import { SCENE_THEMES } from '../src/scene/SceneTheme';

function run(cfg: LabConfig, seconds: number): SimulationEngine {
  const e = new SimulationEngine(cfg);
  e.start();
  e.stepN(Math.round(seconds / e.h));
  return e;
}

describe('Estadísticas acumuladas del motor', () => {
  it('conservación: E_C + E_L + W_R = E(0) + W_fuente en todo momento', () => {
    for (const p of Object.values(PRESETS)) {
      const e = new SimulationEngine(p.build());
      const E0 = e.state.EC + e.state.EL;
      for (let k = 0; k < 10; k++) {
        e.stepN(Math.round(0.37 / e.h));
        const s = e.state;
        const lhs = s.EC + s.EL + s.Wdiss;
        const rhs = E0 + s.Wsrc;
        expect(Math.abs(lhs - rhs)).toBeLessThan(1e-6 * Math.max(1, rhs));
      }
    }
  });

  it('escalón desde el reposo: la fuente entrega C·E₀² y la mitad se disipa', () => {
    const cfg = PRESETS.underdamped.build();
    const e = run(cfg, 12);
    const CE2 = cfg.params.C * cfg.excitation.E0 ** 2;
    expect(e.state.Wsrc).toBeCloseTo(CE2, 6);
    expect(e.state.Wdiss).toBeCloseTo(CE2 / 2, 6);
  });
});

describe('Mediciones vs teoría', () => {
  it('subamortiguado: período 2π/ω_d, α por decremento = R/2L y sobrepico e^(−απ/ω_d)', () => {
    const cfg = PRESETS.underdamped.build();
    const snap = captureSnapshot(run(cfg, 6));
    const a = classifyDamping(cfg.params);
    expect(snap.measured.period!).toBeCloseTo((2 * Math.PI) / a.omegaD, 3);
    expect(snap.measured.alpha!).toBeCloseTo(a.alpha, 3);
    expect(snap.measured.overshootPct!).toBeCloseTo(100 * Math.exp((-a.alpha * Math.PI) / a.omegaD), 2);
    expect(snap.measured.settlingTime).not.toBeNull();
  });

  it('crítico y sobreamortiguado: sin oscilación ni sobrepico', () => {
    for (const id of ['critical', 'overdamped'] as const) {
      const snap = captureSnapshot(run(PRESETS[id].build(), 6));
      expect(snap.measured.overshootPct!).toBeLessThan(0.01);
      expect(snap.measured.crossings).toBe(0);
    }
  });

  it('resonancia: amplitud permanente medida ≈ E₀/R', () => {
    const cfg = PRESETS.resonance.build();
    const snap = captureSnapshot(run(cfg, 12));
    expect(snap.steadyCurrentMeasured!).toBeCloseTo(cfg.excitation.E0 / cfg.params.R, 2);
    expect(snap.measured.period!).toBeCloseTo((2 * Math.PI) / cfg.excitation.omega, 3);
  });
});

describe('Informe interpretativo', () => {
  for (const p of Object.values(PRESETS)) {
    it(`${p.label}: todas las validaciones pasan y el texto refleja el régimen`, () => {
      const snap = captureSnapshot(run(p.build(), 8));
      const report = buildReport(snap, buildScenarios(snap.config));
      for (const v of report.validations) expect(v.ok, `${v.label}: ${v.measured} vs ${v.theoretical}`).toBe(true);
      expect(report.regime).toBe(snap.analysis.regime);
      expect(report.configured.length).toBeGreaterThanOrEqual(3);
      expect(report.observed.length).toBeGreaterThanOrEqual(3);
      expect(report.components.map((c) => c.id)).toEqual(['resistor', 'inductor', 'capacitor', 'source']);
      expect(report.conclusion.length).toBe(10);
      expect(report.whatIf.length).toBeGreaterThanOrEqual(4);
      for (const text of [...report.observed, ...report.conclusion.map((c) => c.a)]) {
        expect(text).not.toMatch(/NaN|undefined/);
      }
    });
  }

  it('el texto del subamortiguado explica la oscilación decreciente', () => {
    const snap = captureSnapshot(run(PRESETS.underdamped.build(), 6));
    const r = buildReport(snap, buildScenarios(snap.config));
    expect(r.observed[0]).toMatch(/subamortiguado/);
    expect(r.observed[0]).toMatch(/disminuye progresivamente/);
  });
});

describe('Qué pasaría si… (calculado)', () => {
  const cfg = PRESETS.underdamped.build();
  const sc = buildScenarios(cfg);
  const get = (id: string) => sc.find((s) => s.id === id)!;
  it('subir R aumenta ζ y reduce el sobrepico; ω₀ no cambia', () => {
    const s = get('R_up');
    expect(s.next.analysis.zeta).toBeGreaterThan(s.base.analysis.zeta);
    expect(s.next.m.overshootPct!).toBeLessThan(s.base.m.overshootPct!);
    expect(s.next.analysis.omega0).toBeCloseTo(s.base.analysis.omega0, 12);
  });
  it('subir L o C reduce ω₀ en un factor √2', () => {
    for (const id of ['L_up', 'C_up']) {
      const s = get(id);
      expect(s.next.analysis.omega0).toBeCloseTo(s.base.analysis.omega0 / Math.SQRT2, 10);
    }
  });
  it('R = R_c lleva al régimen crítico', () => {
    expect(get('R_crit').next.analysis.regime).toBe('critical');
  });
  it('sintonizar ω = ω₀ maximiza la corriente permanente', () => {
    const c: LabConfig = { ...PRESETS.resonance.build() };
    c.excitation = { ...c.excitation, omega: 6 };
    const s = buildScenarios(c).find((x) => x.id === 'w_res')!;
    expect(s.next.steadyCurrent!).toBeGreaterThan(s.base.steadyCurrent!);
    expect(responseMetrics(s.config).steadyCurrent!).toBeCloseTo(c.excitation.E0 / c.params.R, 9);
  });
});

describe('Potenciales de nodo (cables coloreados)', () => {
  it('cerrado: saltos iguales a las caídas y V_D = V_C', () => {
    const p = nodePotentials(10, 3, 2, 5, true);
    expect(p.A - p.C).toBe(3);
    expect(p.C - p.D).toBe(2);
    expect(p.D - p.G).toBe(5);
  });
  it('abierto: sin corriente, todo el tramo derecho al potencial del capacitor', () => {
    const p = nodePotentials(10, 0, 0, 4, false);
    expect([p.B, p.C, p.D]).toEqual([4, 4, 4]);
    expect(p.A).toBe(10);
  });
});

describe('Sistema de temas', () => {
  it('ambas paletas definen las mismas claves', () => {
    expect(Object.keys(PALETTES.light).sort()).toEqual(Object.keys(PALETTES.dark).sort());
    expect(Object.keys(SCENE_THEMES.light).sort()).toEqual(Object.keys(SCENE_THEMES.dark).sort());
  });
  it('el tema claro no usa mezcla aditiva ni brillo de trazas', () => {
    expect(SCENE_THEMES.light.additive).toBe(0);
    expect(PALETTES.light.glow).toBe(0);
    expect(SCENE_THEMES.light.bloomStrength).toBeLessThan(0.2);
  });
});
