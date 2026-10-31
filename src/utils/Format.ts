/** Formato de magnitudes con prefijos de ingeniería (p, n, µ, m, k, M). */
const PREFIXES: Array<[number, string]> = [
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

export function fmtSI(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return value > 0 ? `∞ ${unit}` : value < 0 ? `−∞ ${unit}` : `— ${unit}`;
  const abs = Math.abs(value);
  if (abs < 1e-15) return `0 ${unit}`;
  for (const [f, p] of PREFIXES) {
    if (abs >= f * 0.9995) return `${fmtNum(value / f, digits)} ${p}${unit}`;
  }
  return `${value.toExponential(digits - 1)} ${unit}`;
}

export function fmtNum(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : value < 0 ? '−∞' : '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const s = abs >= 1e5 || abs < 1e-3 ? value.toExponential(digits - 1) : value.toPrecision(digits);
  // quita ceros sobrantes y usa el signo menos tipográfico
  return s.replace(/(\.\d*?[1-9])0+(e|$)/, '$1$2').replace(/\.0+(e|$)/, '$1').replace('-', '−');
}
