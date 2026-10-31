# RLC LABORATORY

Laboratorio virtual 3D para la ecuación diferencial de un circuito RLC en serie:

```
L q''(t) + R q'(t) + q(t)/C = E(t),     i(t) = q'(t)
```

Proyecto final de **Matemáticas IV**. Ingeniería de Sistemas y Telecomunicaciones, 8.º semestre, Universidad Católica de Pereira.
Integrantes: Alejandro Piedrahita, Daniel Colorado y Sebastián Patiño.

> Estado: **Fases 1 y 2 completadas** (motor matemático, solución analítica y validación). La escena Three.js llega en la Fase 5.

## Instalación y ejecución

```bash
npm install
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm test           # pruebas matemáticas (Vitest)
npm run build      # typecheck + build de producción
```

## Estructura actual

```
src/
├── main.ts                    página de diagnóstico provisional
├── physics/
│   ├── RLCModel.ts            parámetros, validación, sistema de 1.er orden, caídas de tensión
│   ├── Excitation.ts          escalón, senoidal, descarga libre
│   ├── RK4Solver.ts           RK4 vectorial sin asignaciones por paso
│   ├── DampingClassifier.ts   α, ω₀, ω_d, Δ, R_c, raíces, ζ, Q
│   ├── EnergyCalculator.ts    E_C, E_L, P_R
│   ├── AnalyticalSolver.ts    solución exacta = natural + forzada
│   └── SolutionComparison.ts  RK4 vs analítica, error máximo
├── simulation/
│   ├── SimulationEngine.ts    integra a paso fijo, detecta NaN/overflow
│   ├── SimulationState.ts     estado que leerá la visualización
│   └── FixedTimestep.ts       acumulador de paso fijo
└── utils/                     constantes y utilidades
tests/                         pruebas de las Fases 1 y 2
```

## Modelo matemático

**Kirchhoff:** V_L + V_R + V_C = E(t), con V_L = L di/dt, V_R = R i, V_C = q/C. Como i = dq/dt, se tiene di/dt = d²q/dt².

**Sistema de primer orden** (x₁ = q, x₂ = i), integrado con RK4:

```
x₁' = x₂
x₂' = (E(t) − R x₂ − x₁/C) / L
```

**Ecuación característica:** s² + (R/L)s + 1/(LC) = 0, con α = R/(2L), ω₀ = 1/√(LC) y Δ = α² − ω₀².

| Régimen          | Condición       | q_h(t)                                  |
|------------------|-----------------|-----------------------------------------|
| Subamortiguado   | Δ < 0 (R < R_c) | e^(−αt)[A cos ω_d t + B sin ω_d t]      |
| Crítico          | Δ ≈ 0 (R = R_c) | (A + Bt) e^(−αt)                        |
| Sobreamortiguado | Δ > 0 (R > R_c) | A e^(s₁t) + B e^(s₂t)                   |

Aquí R_c = 2√(L/C). Δ ≈ 0 se decide con la tolerancia relativa |Δ| ≤ 10⁻⁹·ω₀², nunca con igualdad exacta.

**Solución completa:** q = q_h + q_p. Las constantes de q_h se ajustan con q_h(0) = q₀ − q_p(0) y q_h'(0) = i₀ − q_p'(0).

| Excitación        | Respuesta forzada q_p(t)                                                   |
|-------------------|----------------------------------------------------------------------------|
| Libre, E = 0      | 0                                                                          |
| Escalón, E₀       | C·E₀                                                                       |
| Senoidal E₀ sin ωt | E₀(K sin ωt − Rω cos ωt)/D, con K = 1/C − Lω² y D = K² + (Rω)²            |
| R = 0 y ω = ω₀    | −E₀/(2Lω₀)·t·cos ω₀t (resonancia pura: la amplitud crece linealmente)      |

Todas las soluciones son exactas. No se necesitó ninguna "solución analítica aproximada".

### Precisiones físicas incorporadas

- Con R > 0, en ω = ω₀ la amplitud **no** es infinita: la corriente alcanza su máximo exacto, E₀/R. Solo con R = 0 la amplitud crece sin límite, y lo hace linealmente en t, no de forma instantánea.
- La amplitud de la **carga** (y de V_C) es máxima en ω_r = √(ω₀² − 2α²), no en ω₀. La de la **corriente** sí es máxima en ω₀.
- El paso de RK4 se elige según la dinámica más rápida (ω₀, |s₂| ≈ R/L y ω): h = 0.02/tasa, acotado a [10⁻⁷, 10⁻³] s. La velocidad de simulación cambia cuántos pasos se ejecutan por segundo real, nunca el valor de h.

## Validación (Vitest: 53 pruebas)

- Ejemplo de Zill (sec. 5.1): L = ¼ H, R = 10 Ω, C = 10⁻³ F. Se reproduce q(t) = q₀e^(−20t)(cos 60t + ⅓ sin 60t).
- RK4 frente a la solución analítica en 4 regímenes × 3 excitaciones: el error relativo máximo está entre 2·10⁻¹¹ y 4·10⁻⁹ (h = 1 ms, 5 s).
- Orden de convergencia de RK4: al dividir h entre 2, el error baja ≈ 16 veces (orden 4).
- Con R = 0, la deriva de E_C + E_L es menor que 10⁻⁹ en 50 períodos. El balance ΔE = ∫(E·i − R i²)dt se verifica.
- La solución analítica cumple las condiciones iniciales y la EDO (residuo < 10⁻⁵).
- Paso fijo: el estado es idéntico con cualquier FPS o velocidad.
- Errores: se rechazan L = 0, C = 0, R < 0, NaN e ∞, y el desbordamiento detiene la simulación con un mensaje.
