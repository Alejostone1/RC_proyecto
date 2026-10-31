/**
 * Energía del circuito:
 *   E_C = q²/(2C)   energía eléctrica en el capacitor [J]
 *   E_L = L i²/2    energía magnética en el inductor  [J]
 *   P_R = i² R      potencia disipada en el resistor  [W]
 *
 * Balance (multiplicando la EDO por i):
 *   d/dt (E_C + E_L) = E(t)·i − R i²
 * Con R = 0 y E = 0, E_C + E_L es constante: sirve para validar el integrador.
 */
import type { RLCParams } from './RLCModel';

export interface EnergySnapshot {
  EC: number;
  EL: number;
  total: number;
  PR: number;
}

export function computeEnergy(p: RLCParams, q: number, i: number): EnergySnapshot {
  const EC = (q * q) / (2 * p.C);
  const EL = 0.5 * p.L * i * i;
  return { EC, EL, total: EC + EL, PR: i * i * p.R };
}

/** Escritura sin asignación de memoria (para el bucle de simulación). */
export function computeEnergyInto(p: RLCParams, q: number, i: number, out: EnergySnapshot): EnergySnapshot {
  out.EC = (q * q) / (2 * p.C);
  out.EL = 0.5 * p.L * i * i;
  out.total = out.EC + out.EL;
  out.PR = i * i * p.R;
  return out;
}
