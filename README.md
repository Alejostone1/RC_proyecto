# RLC LABORATORY

**Laboratorio virtual 3D de un circuito RLC en serie.** Muestra cómo la ecuación diferencial

```
L q''(t) + R q'(t) + q(t)/C = E(t),      i(t) = q'(t)
```

describe, predice y explica el comportamiento de un sistema físico real.

**Demo en línea:** https://alejostone1.github.io/RC_proyecto/

| | |
|---|---|
| Asignatura | Matemáticas IV (Ecuaciones Diferenciales) |
| Programa | Ingeniería de Sistemas y Telecomunicaciones, 8.º semestre |
| Universidad | Universidad Católica de Pereira |
| Integrantes | Alejandro Piedrahita · Daniel Colorado · Sebastián Patiño |

## Objetivo

No es una calculadora. Es un laboratorio en el que cada efecto visual está ligado a una variable matemática:

```
ECUACIÓN DIFERENCIAL → SISTEMA DE 1.er ORDEN → RK4 / SOLUCIÓN ANALÍTICA → ESTADO
   → GRÁFICAS (osciloscopio, retrato de fase, comparación) → ESCENA 3D → INTERPRETACIÓN
```

| Magnitud | Efecto visual |
|---|---|
| i(t) | velocidad y sentido de las partículas, opacidad del campo magnético, brillo de los cables |
| q(t) | cantidad y color (+ rojo / − azul) de las cargas en las placas |
| V_C = q/C | intensidad del campo eléctrico entre placas |
| V_L = L di/dt | brillo de la bobina (fem inducida) |
| P_R = i²R | temperatura visual del resistor (rampa de cuerpo caliente, con retardo térmico) |
| E(t) | pantalla de la fuente (DC / AC / OFF) |

Cada efecto se normaliza con el **máximo físico de la solución exacta** para esa configuración. Por eso lo que se ve es proporcional a la magnitud real, sin una ganancia arbitraria.

## Instalación y ejecución

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 74 pruebas matemáticas y de lógica (Vitest)
npm run build    # typecheck estricto + build de producción en dist/
```

Cada push a `main` ejecuta las pruebas y el build en GitHub Actions y publica `dist/` en la rama `gh-pages` (GitHub Pages).

## Tecnologías

TypeScript (modo estricto) · Vite · Three.js (WebGL, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, CSS2DRenderer) · Canvas 2D · Vitest. No tiene backend, base de datos ni frameworks de UI.

## Arquitectura

```
src/
├── main.ts                     App: une controles → motor → visualización
├── physics/                    MATEMÁTICA PURA (sin DOM ni Three.js)
│   ├── RLCModel.ts             parámetros, validación, sistema x' = f(t,x), caídas de tensión
│   ├── Excitation.ts           escalón, senoidal, descarga libre
│   ├── RK4Solver.ts            Runge–Kutta 4 vectorial sin asignaciones por paso
│   ├── DampingClassifier.ts    α, ω₀, ω_d, Δ, R_c, raíces, ζ, Q
│   ├── AnalyticalSolver.ts     solución exacta = natural + forzada
│   ├── SolutionComparison.ts   RK4 vs analítica, error máximo
│   ├── EnergyCalculator.ts     E_C, E_L, P_R
│   ├── Resonance.ts            |I(ω)|, banda de media potencia
│   └── Scales.ts               máximos físicos para normalizar los efectos
├── simulation/                 MOTOR (independiente del render)
│   ├── SimulationEngine.ts     RK4 a paso fijo, detección de NaN y desbordamiento
│   ├── FixedTimestep.ts        acumulador: el FPS no altera la matemática
│   ├── SimulationState.ts      estado de solo lectura para la visualización
│   └── History.ts              búfer circular para las gráficas
├── scene/                      Three.js: escena, cámaras, luces, posprocesado, trayectoria
├── components/                 Resistor, Inductor, Capacitor, VoltageSource, Switch, Wires
├── particles/CurrentFlow.ts    corriente conceptual con InstancedMesh
├── visualization/              Osciloscopio, retrato de fase, comparación, curva de resonancia
├── ui/                         Controles, HUD, paneles, presets, demostraciones, modo sustentación
└── utils/                      constantes, formato, código de colores
```

La simulación nunca depende del render: **SIMULACIÓN → ESTADO → VISUALIZACIÓN**. Los componentes 3D solo leen el estado.

## Modelo matemático

**Kirchhoff:** V_L + V_R + V_C = E(t), con V_L = L di/dt, V_R = R i y V_C = q/C. Como i = dq/dt, entonces di/dt = d²q/dt², y se obtiene L q'' + R q' + q/C = E(t).

**Sistema de primer orden** (x₁ = q, x₂ = i):

```
x₁' = x₂
x₂' = (E(t) − R x₂ − x₁/C) / L
```

**RK4** con paso fijo h = 0.02 / (tasa más rápida del sistema), acotado a [10⁻⁷, 10⁻³] s. Las tasas consideradas son ω₀, |s₂| (la raíz rápida, ≈ R/L en el sobreamortiguado) y ω de la fuente. La velocidad de simulación cambia cuántos pasos se ejecutan por segundo real, nunca h.

**Ecuación característica:** s² + (R/L)s + 1/(LC) = 0, con α = R/(2L), ω₀ = 1/√(LC) y Δ = α² − ω₀².

| Régimen | Condición | Respuesta natural q_h(t) | Constantes (Q = q_h(0), I = q_h'(0)) |
|---|---|---|---|
| Subamortiguado | Δ < 0 ⇔ R < R_c | e^(−αt)[A cos ω_d t + B sin ω_d t] | A = Q, B = (I + αQ)/ω_d |
| Crítico | Δ ≈ 0 ⇔ R = R_c | (A + Bt) e^(−αt) | A = Q, B = I + αQ |
| Sobreamortiguado | Δ > 0 ⇔ R > R_c | A e^(s₁t) + B e^(s₂t) | A = (I − s₂Q)/(s₁ − s₂), B = (s₁Q − I)/(s₁ − s₂) |

Aquí R_c = 2√(L/C) y ω_d = √(ω₀² − α²). El régimen crítico se decide con la tolerancia relativa |Δ| ≤ 10⁻⁹·ω₀², nunca con igualdad exacta entre flotantes.

**Solución completa:** q = q_h + q_p, con las constantes de q_h ajustadas a q_h(0) = q₀ − q_p(0) y q_h'(0) = i₀ − q_p'(0).

| Excitación | Respuesta forzada q_p(t) |
|---|---|
| Libre | 0 |
| Escalón E₀ | C·E₀ |
| E₀ sin ωt | E₀(K sin ωt − Rω cos ωt)/D, con K = 1/C − Lω² y D = K² + (Rω)² |
| R = 0 y ω = ω₀ | −E₀/(2Lω₀)·t·cos ω₀t (resonancia pura) |

Todos los casos tienen solución analítica exacta. No hizo falta usar RK4 como sustituto en ninguno.

## Resonancia

Para E(t) = E₀ sin ωt, la amplitud permanente de la corriente es |I(ω)| = E₀/√(R² + (ωL − 1/(ωC))²).

- |I| es máxima en ω = ω₀ y vale **E₀/R, que es finita si R > 0**. Solo con R = 0 la amplitud crece sin límite, y lo hace linealmente en t.
- La amplitud de la **carga** (y de V_C) es máxima en ω_r = √(ω₀² − 2α²), no en ω₀.
- «Cerca de resonancia» significa dentro de la banda de media potencia: |ω − ω₀| ≤ α.

## Energía

E_C = q²/(2C), E_L = L i²/2 y P_R = i²R. Al multiplicar la EDO por i se obtiene el balance d(E_C + E_L)/dt = E(t)·i − R i². Con R = 0 y E = 0, la energía se conserva. Usamos esa conservación para validar el integrador.

## Pruebas (74, todas pasan)

| # | Prueba | Resultado |
|---|---|---|
| 1 | R = 0 | q = q₀ cos ω₀t, error relativo < 10⁻⁸ |
| 2–4 | Clasificación del régimen | sub / crítico (incluso con redondeo) / sobre; R = 9.99 y 10.01 no se confunden con el crítico |
| 5 | Excitación senoidal | régimen permanente, \|I(ω₀)\| = E₀/R, pico de carga en ω_r |
| 6 | Descarga libre | energía monótonamente decreciente, q → 0 |
| 7 | RK4 vs analítica | 4 regímenes × 3 excitaciones: error relativo entre 2·10⁻¹¹ y 4·10⁻⁹ |
| 8 | Energía con R = 0 | deriva < 10⁻⁹ en 50 períodos; balance ΔE = ∫(E·i − R i²)dt |
| — | Ejemplo de Zill (sec. 5.1) | L = ¼ H, R = 10 Ω, C = 10⁻³ F: q = q₀e^(−20t)(cos 60t + ⅓ sin 60t) |
| — | Orden de RK4 | al dividir h entre 2, el error baja ≈ 16 veces |
| — | Paso fijo | estado idéntico a cualquier FPS o velocidad |
| — | Errores | se rechazan L = 0, C = 0, R < 0, NaN e ∞; el desbordamiento detiene la simulación con un mensaje |

Las pruebas están en [`tests/`](tests).

## Documentación de la sustentación

- [`docs/sustentacion.md`](docs/sustentacion.md): guion completo y reparto entre los integrantes.
- [`docs/preguntas-profesor.md`](docs/preguntas-profesor.md): preguntas probables con sus respuestas.

## Notas sobre la representación física

Las partículas son una representación **conceptual** de la corriente convencional, no electrones. Los campos magnético y eléctrico también son conceptuales, con intensidad proporcional a i y a V_C. No se modelan la variación de R con la temperatura ni el arco al abrir un circuito inductivo: abrir el interruptor devuelve el sistema a sus condiciones iniciales.
