/**
 * FASES 6–10 — Lógica no gráfica de la visualización: trayectoria del circuito,
 * código de colores, demostraciones y normalización física de los efectos.
 */
import { describe, expect, it } from 'vitest';
import { norm } from '../src/components/types';
import { classifyDamping } from '../src/physics/DampingClassifier';
import { analyzeResonance } from '../src/physics/Resonance';
import { CAP, CircuitPath, NODES } from '../src/scene/CircuitPath';
import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { dampingDemo, resonanceDemo } from '../src/ui/Demos';
import { PRESETS } from '../src/ui/Presets';
import { fmtNum, fmtSI } from '../src/utils/Format';
import { resistorBands } from '../src/utils/ResistorCode';
import * as THREE from 'three';

describe('Trayectoria del circuito (partículas)', () => {
  const path = new CircuitPath();
  it('es un lazo cerrado que pasa por todos los nodos', () => {
    expect(path.points[0].equals(path.points[path.points.length - 1])).toBe(true);
    for (const n of Object.values(NODES)) expect(path.points.some((p) => p.equals(n))).toBe(true);
    expect(path.length).toBeGreaterThan(20);
  });
  it('pointAt es periódico y continuo', () => {
    const a = path.pointAt(1.234, new THREE.Vector3());
    const b = path.pointAt(1.234 + path.length, new THREE.Vector3());
    const c = path.pointAt(1.234 - 3 * path.length, new THREE.Vector3());
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
    expect(a.distanceTo(c)).toBeLessThan(1e-9);
    const d = path.pointAt(1.235, new THREE.Vector3());
    expect(a.distanceTo(d)).toBeLessThanOrEqual(0.001 + 1e-9);
  });
  it('oculta las partículas solo dentro del dieléctrico del capacitor', () => {
    const [s0, s1] = path.hidden[0];
    const mid = path.pointAt((s0 + s1) / 2, new THREE.Vector3());
    expect(mid.z).toBeCloseTo(CAP.z, 9);
    expect(Math.abs(mid.x)).toBeLessThan(CAP.gap / 2);
    expect(path.isHidden((s0 + s1) / 2)).toBe(true);
    expect(path.isHidden(s0 - 0.01)).toBe(false);
    expect(path.isHidden(s1 + 0.01)).toBe(false);
  });
});

describe('Código de colores del resistor', () => {
  it('valores típicos', () => {
    expect(resistorBands(10).nominal).toBe(10); // marrón-negro-negro
    expect(resistorBands(4.7).nominal).toBeCloseTo(4.7, 12); // amarillo-violeta-oro
    expect(resistorBands(220).digits).toEqual([2, 2]);
    expect(resistorBands(220).exponent).toBe(1);
    expect(resistorBands(999.6).nominal).toBe(1000);
    expect(resistorBands(0).nominal).toBe(0);
  });
  it('representa R con 2 cifras significativas', () => {
    for (const R of [0.33, 1, 2, 6.8, 10, 30, 47.5, 330, 1000]) {
      const b = resistorBands(R);
      expect(Math.abs(b.nominal - R) / R).toBeLessThan(0.06);
    }
  });
});

describe('Demostraciones', () => {
  it('amortiguamiento: sub → crítico → sobre', () => {
    const regimes = dampingDemo().map((s) => classifyDamping(s.config.params).regime);
    expect(regimes).toEqual(['underdamped', 'critical', 'overdamped']);
  });
  it('resonancia: ω < ω₀, ω ≈ ω₀, ω > ω₀ con amplitud máxima en el centro', () => {
    const steps = resonanceDemo();
    const amps = steps.map((s) => analyzeResonance(s.config.params, s.config.excitation.E0, s.config.excitation.omega));
    expect(amps[0].omega).toBeLessThan(amps[0].omega0);
    expect(amps[1].near).toBe(true);
    expect(amps[2].omega).toBeGreaterThan(amps[2].omega0);
    expect(amps[1].currentAmplitude).toBeGreaterThan(amps[0].currentAmplitude);
    expect(amps[1].currentAmplitude).toBeGreaterThan(amps[2].currentAmplitude);
  });
});

describe('Normalización de efectos visuales', () => {
  it('las magnitudes instantáneas nunca superan su escala de referencia (salvo redondeo)', () => {
    for (const p of Object.values(PRESETS)) {
      const e = new SimulationEngine(p.build());
      for (let k = 0; k < 40; k++) {
        e.stepN(Math.round(0.1 / e.h));
        expect(Math.abs(e.state.i)).toBeLessThanOrEqual(e.scales.i * 1.01);
        expect(Math.abs(e.state.q)).toBeLessThanOrEqual(e.scales.q * 1.01);
        expect(e.state.PR).toBeLessThanOrEqual(e.scales.PR * 1.02);
      }
    }
  });
  it('norm() está acotada a [0, 1] y es par', () => {
    expect(norm(5, 10)).toBe(0.5);
    expect(norm(-5, 10)).toBe(0.5);
    expect(norm(50, 10)).toBe(1);
    expect(norm(1, 0)).toBe(1);
  });
});

describe('Formato de magnitudes', () => {
  it('prefijos de ingeniería', () => {
    expect(fmtSI(0.02, 'F')).toBe('20 mF');
    expect(fmtSI(1500, 'Ω')).toBe('1.5 kΩ');
    expect(fmtSI(-0.00316, 'C')).toBe('−3.16 mC');
    expect(fmtSI(Infinity, 'A')).toBe('∞ A');
    expect(fmtNum(-96)).toBe('−96');
  });
});
