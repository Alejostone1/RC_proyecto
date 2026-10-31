/**
 * Acumulador de paso fijo ("fix your timestep").
 *
 * El render entrega un deltaTime variable; aquí se convierte en un número entero
 * de pasos físicos de tamaño h constante. La velocidad de simulación solo cambia
 * cuánto tiempo simulado se consume por segundo real, nunca el paso h, por lo que
 * el resultado matemático es idéntico a cualquier FPS o velocidad.
 */
import { MAX_SUBSTEPS_PER_FRAME } from '../utils/Constants';

export class FixedTimestep {
  private accumulator = 0;
  /** true si en el último frame se alcanzó el tope de subpasos (simulación más lenta que tiempo real). */
  saturated = false;

  constructor(
    public h: number,
    public maxSubsteps = MAX_SUBSTEPS_PER_FRAME,
  ) {
    if (!(h > 0)) throw new RangeError('El paso h debe ser > 0.');
  }

  /**
   * @param realDt  tiempo real transcurrido desde el frame anterior [s]
   * @param speed   factor de velocidad (1 = tiempo real, 0.1 = cámara lenta)
   * @param stepFn  ejecuta UN paso físico de tamaño h; si devuelve false se detiene
   * @returns número de pasos ejecutados
   */
  advance(realDt: number, speed: number, stepFn: () => boolean): number {
    if (!(realDt > 0) || !(speed > 0)) return 0;
    this.accumulator += realDt * speed;
    let n = 0;
    while (this.accumulator >= this.h && n < this.maxSubsteps) {
      this.accumulator -= this.h;
      n++;
      if (!stepFn()) {
        this.accumulator = 0;
        break;
      }
    }
    this.saturated = n >= this.maxSubsteps;
    // Si estamos saturados descartamos el retraso: la simulación se ralentiza
    // de forma controlada en lugar de acumular deuda infinita.
    if (this.saturated) this.accumulator = 0;
    return n;
  }

  /** Fracción [0,1) del siguiente paso pendiente (para interpolar visualmente). */
  get alpha(): number {
    return this.accumulator / this.h;
  }

  reset(): void {
    this.accumulator = 0;
    this.saturated = false;
  }
}
