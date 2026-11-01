/**
 * Potencial eléctrico de cada tramo de cable respecto al borne − de la fuente (0 V).
 *
 *   A: borne + → interruptor            V_A = E(t)
 *   B: interruptor → resistor           V_B = V_A (cerrado)
 *   C: resistor → inductor              V_C' = E − V_R
 *   D: inductor → placa A del capacitor V_D = E − V_R − V_L = V_C   (Kirchhoff)
 *   G: placa B → borne −                V_G = 0
 *
 * Con el interruptor abierto no circula corriente: no hay caídas en R ni en L,
 * así que B, C y D quedan al potencial de la placa A del capacitor (q/C).
 */
export interface NodePotentials {
  A: number;
  B: number;
  C: number;
  D: number;
  G: number;
}

export function nodePotentials(E: number, VR: number, VL: number, VC: number, switchClosed: boolean, out?: NodePotentials): NodePotentials {
  const o = out ?? { A: 0, B: 0, C: 0, D: 0, G: 0 };
  o.A = E;
  o.G = 0;
  if (switchClosed) {
    o.B = E;
    o.C = E - VR;
    o.D = E - VR - VL;
  } else {
    o.B = VC;
    o.C = VC;
    o.D = VC;
  }
  return o;
}
