/**
 * Constantes globales del laboratorio. Todas las magnitudes están en el SI:
 * R [Ω], L [H], C [F], q [C], i [A], E [V], t [s], ω [rad/s].
 */

/** Rangos permitidos para los parámetros (validación de entrada y sliders). */
export const PARAM_LIMITS = {
  R: { min: 0, max: 1000 },
  L: { min: 1e-3, max: 10 },
  C: { min: 1e-5, max: 1 },
  E0: { min: -100, max: 100 },
  omega: { min: 0, max: 2000 },
  q0: { min: -10, max: 10 },
  i0: { min: -100, max: 100 },
} as const;

/**
 * Tolerancia relativa para decidir si Δ = α² − ω₀² es "cero" (régimen crítico).
 * Se compara |Δ| ≤ tol · ω₀², nunca con igualdad exacta de flotantes.
 */
export const CRITICAL_RELATIVE_TOLERANCE = 1e-9;

/** Tolerancia relativa para detectar resonancia pura (R = 0 y ω = ω₀). */
export const RESONANCE_RELATIVE_TOLERANCE = 1e-9;

/** Paso máximo de integración RK4 [s]. */
export const MAX_TIMESTEP = 1e-3;

/** Paso mínimo de integración RK4 [s] (protege el rendimiento). */
export const MIN_TIMESTEP = 1e-7;

/**
 * Fracción del tiempo característico más rápido del sistema usada como paso.
 * h = STEPS_FRACTION / tasa_más_rápida. Con 0.02 hay ≈ 314 pasos por período
 * de oscilación, lo que deja el error global de RK4 muy por debajo de 1e-8.
 */
export const TIMESTEP_FRACTION = 0.02;

/** Máximo de subpasos físicos por frame (evita la "espiral de la muerte"). */
export const MAX_SUBSTEPS_PER_FRAME = 20000;

/** Magnitud a partir de la cual el estado se considera desbordado. */
export const OVERFLOW_THRESHOLD = 1e12;
