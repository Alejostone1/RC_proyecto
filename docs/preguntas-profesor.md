# Preguntas probables del profesor (con respuestas)

## Ecuación diferencial

**1. ¿De dónde sale la ecuación L q'' + R q' + q/C = E(t)?**
De la segunda ley de Kirchhoff: la suma de las caídas de tensión en un lazo cerrado es igual al voltaje aplicado. Las caídas son L di/dt, Ri y q/C. Como i = dq/dt, se tiene di/dt = q'', y al sustituir queda la ecuación en función de q.

**2. ¿Qué tipo de ecuación es?**
Es una EDO lineal de segundo orden con coeficientes constantes. Es homogénea si E = 0 y no homogénea si E ≠ 0.

**3. ¿Por qué se plantea en función de q y no de i?**
Porque así aparecen las tres caídas sin integrales: V_C = q/C. Si se plantea en i, el capacitor introduce ∫i dt, y habría que derivar toda la ecuación, lo que da L i'' + R i' + i/C = E'(t).

**4. ¿Qué condiciones iniciales se necesitan y por qué dos?**
Se necesitan q(0) e i(0) = q'(0). Una EDO de segundo orden tiene dos constantes arbitrarias en su solución general. Físicamente, el capacitor «recuerda» su carga y el inductor «recuerda» su corriente.

## Solución analítica

**5. ¿Cómo se determina el régimen?**
Con la ecuación característica s² + (R/L)s + 1/(LC) = 0. Su discriminante, reescrito como Δ = α² − ω₀² con α = R/2L y ω₀ = 1/√(LC), decide el caso: Δ < 0 da subamortiguado, Δ = 0 crítico y Δ > 0 sobreamortiguado.

**6. ¿Qué significa R_c = 2√(L/C)?**
Es la resistencia que hace Δ = 0. Por debajo de ella el circuito oscila; por encima, no.

**7. ¿Por qué en el caso crítico aparece t·e^(−αt)?**
Porque la raíz es doble. e^(−αt) solo aporta una solución, y la segunda linealmente independiente es t·e^(−αt) (por reducción de orden).

**8. ¿Cómo calcularon las constantes A y B?**
Imponiendo q(0) = q₀ e i(0) = i₀ sobre la solución **total** q_h + q_p. Eso da q_h(0) = q₀ − q_p(0) y q_h'(0) = i₀ − q_p'(0), y de ahí salen las fórmulas cerradas de A y B que están en el README. Un error común es imponer las condiciones solo sobre q_h.

**9. ¿Qué es la respuesta transitoria y qué es la permanente?**
La transitoria es la respuesta natural q_h, que decae como e^(−αt) cuando R > 0. La permanente es la forzada q_p, que queda cuando t → ∞: C·E₀ para el escalón y una senoidal de la misma frecuencia ω para la fuente AC.

**10. ¿Cómo obtuvieron la solución particular para la fuente senoidal?**
Por coeficientes indeterminados, con q_p = a sin ωt + b cos ωt. Al sustituir se obtiene q_p = E₀(K sin ωt − Rω cos ωt)/D, con K = 1/C − Lω² y D = K² + (Rω)².

## Método numérico

**11. Si tienen la solución exacta, ¿para qué RK4?**
Por tres razones. (a) RK4 sirve para cualquier E(t), incluso cuando no hay solución cerrada. (b) Permite simular en tiempo real paso a paso. (c) Tener las dos soluciones nos deja **validar** una con la otra: el error relativo máximo está entre 10⁻¹¹ y 10⁻⁹.

**12. ¿Por qué convirtieron la ecuación en un sistema?**
Porque RK4, como la mayoría de los métodos numéricos, resuelve x' = f(t, x) de primer orden. Con x₁ = q y x₂ = i, la ecuación de segundo orden se convierte en dos de primer orden.

**13. ¿Cuál es el orden de RK4 y cómo lo comprobaron?**
Es de orden 4: el error global es O(h⁴). Lo comprobamos empíricamente: al reducir h a la mitad, el error baja un factor de ≈ 16 = 2⁴ (hay una prueba automática).

**14. ¿Cómo eligieron h?**
Como h = 0.02 / (tasa más rápida del sistema). Las tasas que miramos son ω₀, la raíz rápida |s₂| y ω de la fuente. Eso da unos 300 pasos por período, lejos del límite de estabilidad de RK4 (|h·s| ≲ 2.78). Para el preset, h = 1 ms.

**15. ¿Qué pasa si la computadora va más lenta? ¿Cambia el resultado?**
No. Usamos un paso fijo con acumulador: el tiempo real de cada frame se convierte en un número entero de pasos de tamaño h. Una prueba verifica que a 60 FPS y a 144 FPS el estado es idéntico.

**16. ¿Por qué el error no es cero?**
Porque RK4 aproxima la solución con una serie de Taylor truncada (error de truncamiento) y porque los números de punto flotante tienen precisión finita (unos 16 dígitos). Un error del orden de 10⁻⁹ es despreciable.

## Física

**17. ¿La amplitud se vuelve infinita en resonancia?**
No, salvo en el caso ideal R = 0. Con R > 0, la amplitud de la corriente en ω = ω₀ es E₀/R, que es finita. Con R = 0 la amplitud crece linealmente, como t·cos ω₀t, pero no salta a infinito de forma instantánea.

**18. ¿La carga también es máxima en ω₀?**
No exactamente. La amplitud de la corriente es máxima en ω₀, mientras que la de la carga (y la de V_C) es máxima en ω_r = √(ω₀² − 2α²), un poco por debajo. Coinciden solo cuando R → 0.

**19. ¿Cómo comprueban que la energía es correcta?**
Multiplicando la EDO por i se obtiene d(E_C + E_L)/dt = E·i − R i². Con R = 0 y E = 0 la energía debe conservarse, y en 50 períodos deriva menos de 10⁻⁹. Con R > 0 y fuente senoidal verificamos el balance integral ΔE = ∫(E·i − R i²)dt.

**20. ¿Las partículas son electrones?**
No. Representan de forma conceptual la corriente convencional. Su velocidad y su sentido siguen a i(t), y no atraviesan el dieléctrico del capacitor porque ahí no hay corriente de conducción. Los electrones reales se mueven en sentido contrario y a una velocidad de deriva de milímetros por segundo.

**21. ¿Qué pasa físicamente al abrir el interruptor con corriente?**
En un circuito real, el inductor se opone al cambio brusco de i y genera un pico de voltaje (un arco). Eso no se modela. En la aplicación, abrir el interruptor devuelve el sistema a sus condiciones iniciales, y lo dejamos documentado como una simplificación.

## Software

**22. ¿Por qué Three.js y no otro motor?**
Es la biblioteca WebGL estándar del navegador. No necesita instalación, funciona en cualquier computador con un enlace y es ligera comparada con un motor de juegos.

**23. ¿Cómo evitan que la visualización altere los cálculos?**
Con una arquitectura en una sola dirección: el motor produce un SimulationState y los componentes 3D solo lo leen (reciben un VisualFrame de solo lectura). La física vive en `src/physics` sin ninguna dependencia de Three.js.

**24. ¿Cómo validaron el software?**
Con 74 pruebas automáticas (Vitest) que corren en cada push en GitHub Actions antes de desplegar. Cubren los regímenes, las excitaciones, RK4 vs. la solución analítica, la energía, el paso fijo, los errores numéricos y la lógica visual.
