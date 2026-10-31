/**
 * Código de colores de 4 bandas (2 dígitos significativos + multiplicador + tolerancia)
 * para mostrar el valor de R sobre el resistor 3D.
 */
export const BAND_COLORS = [
  '#111111', // 0 negro
  '#6b3b1f', // 1 marrón
  '#d12b2b', // 2 rojo
  '#ff7a1a', // 3 naranja
  '#f2d21b', // 4 amarillo
  '#2e9e44', // 5 verde
  '#2563eb', // 6 azul
  '#7c3aed', // 7 violeta
  '#8a8a8a', // 8 gris
  '#f4f4f4', // 9 blanco
] as const;
export const GOLD = '#c9a227';
export const SILVER = '#c0c0c0';

export interface ResistorBands {
  digits: [number, number];
  /** exponente del multiplicador: −2 (plata), −1 (oro), 0…9 */
  exponent: number;
  colors: [string, string, string, string];
  /** valor nominal representado por las bandas */
  nominal: number;
}

export function resistorBands(R: number): ResistorBands {
  if (!(R > 0)) {
    // R = 0: resistor de "cero ohmios" (una sola banda negra en la práctica)
    return { digits: [0, 0], exponent: 0, colors: [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD], nominal: 0 };
  }
  let exponent = Math.floor(Math.log10(R)) - 1;
  let two = Math.round(R / 10 ** exponent);
  if (two >= 100) {
    two = Math.round(two / 10);
    exponent++;
  }
  exponent = Math.max(-2, Math.min(9, exponent));
  two = Math.max(0, Math.min(99, Math.round(R / 10 ** exponent)));
  const d1 = Math.floor(two / 10);
  const d2 = two % 10;
  const mult = exponent === -1 ? GOLD : exponent === -2 ? SILVER : BAND_COLORS[exponent];
  return { digits: [d1, d2], exponent, colors: [BAND_COLORS[d1], BAND_COLORS[d2], mult, GOLD], nominal: two * 10 ** exponent };
}
