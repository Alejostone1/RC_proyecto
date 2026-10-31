/** Utilidades numéricas pequeñas y sin dependencias. */

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** Comparación con tolerancia relativa respecto a una escala de referencia. */
export function approxZero(x: number, scale: number, relTol: number): boolean {
  return Math.abs(x) <= relTol * Math.abs(scale);
}

/** Error relativo |a − b| / max(|b|, floor). */
export function relativeError(a: number, b: number, floor = 1e-15): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), floor);
}
