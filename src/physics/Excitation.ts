/**
 * Excitaciones E(t) aplicadas al circuito (t ≥ 0, el interruptor se cierra en t = 0).
 *
 *  - step : E(t) = E₀            (fuente DC conectada en t = 0)
 *  - sine : E(t) = E₀ sin(ωt)    (fuente AC)
 *  - free : E(t) = 0             (descarga libre desde q₀, i₀)
 */
export type ExcitationKind = 'step' | 'sine' | 'free';

export interface Excitation {
  kind: ExcitationKind;
  /** Amplitud E₀ [V]. Se ignora en 'free'. */
  E0: number;
  /** Frecuencia angular ω [rad/s]. Solo se usa en 'sine'. */
  omega: number;
}

export function evaluateExcitation(exc: Excitation, t: number): number {
  switch (exc.kind) {
    case 'step':
      return exc.E0;
    case 'sine':
      return exc.E0 * Math.sin(exc.omega * t);
    case 'free':
      return 0;
  }
}

export function stepExcitation(E0: number): Excitation {
  return { kind: 'step', E0, omega: 0 };
}

export function sineExcitation(E0: number, omega: number): Excitation {
  return { kind: 'sine', E0, omega };
}

export function freeExcitation(): Excitation {
  return { kind: 'free', E0: 0, omega: 0 };
}

export function describeExcitation(exc: Excitation): string {
  switch (exc.kind) {
    case 'step':
      return `E(t) = ${exc.E0} V (escalón)`;
    case 'sine':
      return `E(t) = ${exc.E0}·sin(${exc.omega}·t) V (senoidal)`;
    case 'free':
      return 'E(t) = 0 (descarga libre)';
  }
}
