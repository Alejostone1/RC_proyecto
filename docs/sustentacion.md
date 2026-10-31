# Sustentación: RLC Laboratory

Duración sugerida: **15–18 minutos** de exposición y 5 de preguntas.
Antes de empezar: abrir la demo en pantalla completa (F11), activar el **Modo sustentación** (tecla `P`) y cargar el preset **Subamortiguado**.

---

## Reparto propuesto

Tomamos como base la propuesta original, con un ajuste: **Daniel presenta también la comparación RK4 vs. analítica y la resonancia**. Es la evidencia numérica más fuerte del proyecto y debe exponerla quien explica el método. Sebastián cierra con la demostración en vivo, que conecta todo lo anterior.

| Bloque | Responsable | Tiempo |
|---|---|---|
| 1. Introducción y problema | Alejandro | 2 min |
| 2. Kirchhoff y ecuación diferencial | Alejandro | 3 min |
| 3. Solución analítica y regímenes | Daniel | 3 min |
| 4. RK4 y validación numérica | Daniel | 3 min |
| 5. Resonancia y energía | Daniel | 2 min |
| 6. Arquitectura, Three.js y visualización | Sebastián | 3 min |
| 7. Demostración en vivo y cierre | Sebastián (con todos) | 2 min |

---

## 1. Introducción y problema (Alejandro)

- Un circuito RLC en serie es el sistema físico más simple que **oscila y se amortigua**. Aparece en filtros, sintonizadores de radio, fuentes de alimentación y telecomunicaciones, que es nuestra carrera.
- Pregunta del proyecto: *¿cómo se comporta la carga q(t) y la corriente i(t) cuando cerramos el interruptor?*
- Respuesta: con una **ecuación diferencial ordinaria lineal de segundo orden con coeficientes constantes**, que es el tema central de Matemáticas IV.
- Lo que construimos es un laboratorio virtual en el que la ecuación es el motor de todo lo que se ve.

## 2. Kirchhoff y la ecuación diferencial (Alejandro)

Pestaña **Modelo matemático**, secciones 1 a 3.

1. Segunda ley de Kirchhoff: en un lazo cerrado, E(t) = V_L + V_R + V_C.
2. Caídas de tensión: V_L = L di/dt, V_R = R i, V_C = q/C (Zill, sec. 1.3).
3. Como i = dq/dt, entonces di/dt = d²q/dt², y queda **L q'' + R q' + q/C = E(t)**.
4. Mostrar la misma ecuación con los números del preset: 0.5 q'' + 2 q' + 50 q = 10.
5. Analogía mecánica, que siempre ayuda: L ↔ masa, R ↔ fricción, 1/C ↔ constante del resorte, q ↔ posición.

## 3. Solución analítica y regímenes (Daniel)

Pestaña **Modelo matemático**, secciones 6 y 7.

- Ecuación característica: s² + (R/L)s + 1/(LC) = 0, con α = R/2L, ω₀ = 1/√(LC) y Δ = α² − ω₀².
- El signo de Δ decide el régimen:
  - Δ < 0 → raíces complejas → **subamortiguado**: e^(−αt)[A cos ω_d t + B sin ω_d t].
  - Δ = 0 → raíz doble → **crítico**: (A + Bt)e^(−αt).
  - Δ > 0 → dos raíces reales → **sobreamortiguado**: A e^(s₁t) + B e^(s₂t).
- La frontera es R_c = 2√(L/C), que en nuestro circuito vale 10 Ω.
- Solución completa = respuesta natural (transitoria) + respuesta forzada (permanente). Las constantes A y B se ajustan con las condiciones iniciales **de la solución total**, no solo de la homogénea.
- Pulsar **Demostrar amortiguamiento**: la aplicación recorre los tres regímenes de forma automática.

## 4. RK4 y validación (Daniel)

Pestañas **Modelo matemático** (secciones 4 y 5) y **Comparación**.

- RK4 resuelve sistemas de primer orden. Por eso transformamos la ecuación de segundo orden: x = [q, i], con q' = i e i' = (E − Ri − q/C)/L.
- RK4 evalúa la pendiente cuatro veces por paso (k₁ a k₄) y las promedia con pesos 1-2-2-1. Su error global es O(h⁴).
- **Paso fijo:** h no depende del FPS de la pantalla. El render puede ir a 30 o 144 FPS y la matemática da exactamente el mismo resultado (lo verifica una prueba automática).
- Pestaña **Comparación**: RK4 y la solución exacta se superponen. El error máximo es del orden de 10⁻¹⁰ a 10⁻⁹ relativo.
- Validación adicional: el ejemplo del libro de Zill (L = ¼ H, R = 10 Ω, C = 1/1000 F) se reproduce exactamente; al dividir h entre 2, el error baja 16 veces (orden 4); con R = 0, la energía se conserva con una deriva menor que 10⁻⁹.

## 5. Resonancia y energía (Daniel)

Pestaña **Resonancia** y botón **Demostrar resonancia**.

- Con E(t) = E₀ sin ωt, la amplitud permanente de la corriente es |I| = E₀/√(R² + (ωL − 1/ωC)²).
- Es máxima cuando ωL = 1/(ωC), es decir, cuando **ω = ω₀**, y entonces |I| = E₀/R.
- **Aclaración importante:** con R > 0 la amplitud en resonancia es **finita**. Solo el caso ideal R = 0 crece sin límite, y lo hace linealmente con el tiempo (término t·cos ω₀t).
- La demostración muestra ω = 0.5ω₀ (corriente pequeña), ω = ω₀ (máxima) y ω = 1.6ω₀ (pequeña otra vez).
- Energía: E_C = q²/2C, E_L = Li²/2 y P_R = i²R. La barra de la telemetría muestra cómo la energía pasa del capacitor al inductor y se disipa en el resistor.

## 6. Arquitectura y visualización (Sebastián)

- Stack: TypeScript, Vite, Three.js y Canvas 2D. Sin backend.
- Arquitectura en capas: **física pura → motor de simulación → estado → visualización**. La visualización nunca modifica la matemática.
- Componentes 3D, cada uno ligado a una magnitud:
  - Partículas (InstancedMesh, 220 instancias) → i(t): velocidad, sentido y brillo. **No pasan por el dieléctrico** del capacitor, porque ahí no hay conducción.
  - Resistor → P_R = i²R: color de cuerpo caliente. Las bandas de color codifican el valor de R.
  - Inductor → líneas de campo con opacidad ∝ |i|, sentido según el signo de i, brillo ∝ |V_L|.
  - Capacitor → cargas ∝ |q|, rojo/azul según el signo; campo ∝ V_C.
- Normalización: cada efecto se divide por el máximo que alcanza la **solución exacta**, así que lo visual es proporcional a lo físico.
- Rendimiento: geometrías y materiales reutilizados, sin crear objetos en el bucle de render, gráficas con búfer circular y DOM actualizado a 10 Hz.

## 7. Demostración en vivo y cierre (Sebastián, con todos)

Guion sugerido (3 acciones):

1. Preset **Subamortiguado** → ▶ Iniciar. Señalar la espiral del retrato de fase y la oscilación del osciloscopio.
2. Subir R con el slider hasta R_c (botón **R = R_c**) → el badge cambia a «Crítico» y la oscilación desaparece.
3. Preset **Resonancia** → las partículas se aceleran, el resistor se calienta y la curva de resonancia muestra el punto en el pico.

**Cierre:** «Una sola ecuación diferencial de segundo orden predice todo lo que vieron. La resolvimos de forma analítica y numérica, comprobamos que ambas coinciden y la convertimos en algo que se puede ver y manipular».

---

## Lista de verificación antes de exponer

- [ ] La demo abre en el computador de la sala (WebGL activado; probar en Chrome o Edge).
- [ ] `npm run dev` funciona como respaldo sin internet. Llevar el repositorio clonado y `npm install` hecho.
- [ ] Modo sustentación probado en el proyector (resolución 1920×1080 o 1366×768).
- [ ] Cada integrante sabe responder al menos 3 preguntas de [`preguntas-profesor.md`](preguntas-profesor.md).
