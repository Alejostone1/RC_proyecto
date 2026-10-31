/**
 * Punto de entrada provisional (Fases 1–2): muestra la validación del motor
 * matemático en el navegador. La escena Three.js se incorpora en la Fase 5.
 */
import { REGIME_LABELS, classifyDamping } from './physics/DampingClassifier';
import { describeExcitation, freeExcitation, sineExcitation, stepExcitation } from './physics/Excitation';
import { compareSolutions } from './physics/SolutionComparison';
import { solveAnalytically } from './physics/AnalyticalSolver';
import type { RLCParams } from './physics/RLCModel';

const BASE = { L: 0.5, C: 0.02 };
const cases: RLCParams[] = [0, 2, 2 * Math.sqrt(BASE.L / BASE.C), 30].map((R) => ({ R, ...BASE }));
const excitations = [freeExcitation(), stepExcitation(12), sineExcitation(10, 7)];
const ic = { q0: 0.05, i0: -0.3 };

const rows: string[] = [];
for (const p of cases) {
  const a = classifyDamping(p);
  for (const exc of excitations) {
    const cmp = compareSolutions(p, exc, ic, 5, 1e-3, 10);
    const sol = solveAnalytically(p, exc, ic);
    rows.push(
      `<tr><td>${p.R.toFixed(2)}</td><td>${REGIME_LABELS[a.regime]}</td><td>${describeExcitation(exc)}</td>` +
        `<td>${cmp.maxError.toExponential(2)}</td><td>${cmp.maxRelativeError.toExponential(2)}</td>` +
        `<td>${sol.natural.formula}</td></tr>`,
    );
  }
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <p>L = ${BASE.L} H, C = ${BASE.C} F → ω₀ = 10 rad/s, R_c = 10 Ω. q₀ = ${ic.q0} C, i₀ = ${ic.i0} A, h = 1 ms, t ∈ [0, 5] s.</p>
  <table>
    <tr><th>R [Ω]</th><th>Régimen</th><th>Excitación</th><th>error máx |q_RK4 − q_exacta|</th><th>error relativo</th><th>respuesta natural</th></tr>
    ${rows.join('')}
  </table>`;
