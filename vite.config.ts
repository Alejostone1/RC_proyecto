import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rutas relativas: funciona tanto en la raíz como en GitHub Pages (/RC_proyecto/).
  base: './',
  build: {
    target: 'es2022',
    // three.js ocupa ~550 kB minificado; es esperado en esta aplicación.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
