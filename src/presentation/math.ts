/**
 * Renderizado de fórmulas con KaTeX. Se permite \htmlClass para colorear cada
 * término con el color de su componente (L violeta, R ámbar, C verde, E acento).
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function tex(src: string, display = true): string {
  return katex.renderToString(src, {
    displayMode: display,
    throwOnError: false,
    strict: 'ignore',
    trust: (ctx) => ctx.command === '\\htmlClass',
  });
}

/** Atajos para los términos coloreados. */
export const T = {
  L: (s: string) => `\\htmlClass{tl}{${s}}`,
  R: (s: string) => `\\htmlClass{tr}{${s}}`,
  C: (s: string) => `\\htmlClass{tc}{${s}}`,
  E: (s: string) => `\\htmlClass{te}{${s}}`,
  /** Término recién transformado (resaltado). */
  N: (s: string) => `\\htmlClass{tn}{${s}}`,
};
