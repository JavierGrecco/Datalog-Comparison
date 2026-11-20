# Componentes y proyectos de código abierto evaluados

Revisión inicial: 20 de noviembre de 2026.

## Criterio

No incorporamos código solo porque sea libre o tenga funciones atractivas. Antes de copiar o adaptar un componente hay que revisar su licencia exacta, dependencias transitivas, avisos de copyright, formato de origen, pruebas, seguridad, mantenimiento y compatibilidad con el modelo físico del proyecto.

## Candidatos

| Proyecto | Licencia identificada | Aporte potencial | Decisión |
| --- | --- | --- | --- |
| [uPlot](https://github.com/leeoniya/uPlot) | MIT | Gráficas Canvas ligeras, series temporales densas, cursor y zoom. | **Integrado localmente** en la inspección de curvas de dinamómetro. Se conserva la tabla numérica y se valida el eje X antes de graficar. Versión 1.6.32; licencia y archivos de distribución en `vendor/uplot/`. |
| [Chart.js](https://www.chartjs.org/) | MIT | Biblioteca generalista con decimación LTTB y min/max para líneas densas. | Alternativa evaluada; no se agrega junto con uPlot para evitar dos motores de gráfica con funciones solapadas. |
| [Apache ECharts](https://echarts.apache.org/) | Apache-2.0 | Visualizaciones amplias, múltiples tipos y componentes avanzados. | No integrar por ahora: excede las necesidades actuales y aumenta el peso y la superficie de mantenimiento. |
| [Log2Dyno](https://github.com/nshobe/Log2Dyno) | MIT (LICENSE inspeccionado) | Cálculo de curvas virtuales desde registros de velocidad/RPM y parámetros del vehículo. | Referencia técnica, no importar todavía. Sus resultados son estimaciones dependientes de masa, resistencia, aerodinámica y pérdidas; deben permanecer separados de una medición de banco. |
| [Motorsport Analytics Pipeline](https://github.com/ElSirGuti/motorsport-analytics-pipeline) | MIT (LICENSE inspeccionado) | Arquitectura de análisis de telemetría, comparaciones, informes y biblioteca de sesiones. | Estudiar algoritmos aislados y pruebas. No adoptar su backend/API tal como está: la documentación declara ausencia de autenticación/autorización en la biblioteca. |
| [i3rs](https://github.com/Friss/i3rs) | MIT (LICENSE inspeccionado) | Core Rust para MoTeC M1 `.ld`, sidecar `.ldx`, canales multi-rate, máscaras de validez y API CLI JSON/CSV. `LdFile::from_bytes` permite recibir bytes sin ruta local; el proyecto también construye una aplicación WebAssembly. | **Candidato prioritario para un adaptador de solo lectura.** POC aún pendiente: requiere una muestra redistribuible o permiso explícito, comparar el parser WASM con el CLI nativo y preservar cada canal a su frecuencia original. No importar el escritor ni los fixtures upstream sin licencia de datos separada. Revisión sobre commit `c5e8e03d9244db7898acd247bae919be4a79cc9c`, crate `i3rs-core 0.4.0`. |
| [motec-i2](https://github.com/afonso360/motec-i2) | MIT (LICENSE inspeccionado) | Parser y escritor Rust para archivos `.ld`; pequeño proyecto independiente útil como segunda referencia de lectura. | Referencia secundaria para contrastar parsing `.ld`. El README marca `.ldx` parsing/writing como no implementado y el último push observado fue en 2024. No integrar su writer. |
| [UltraLog](https://github.com/ClassicMiniDIY/UltraLog) | AGPL-3.0 declarada por el proyecto | Referencia de UX y cobertura de formatos/análisis ECU. | No copiar código en este repositorio sin una decisión explícita de relicenciamiento y análisis de obligaciones AGPL. Estudiar conceptos de interfaz sí; no reutilizar implementación. |
| [ECUxPlot](https://github.com/nyetlabs/ecuxplot) | No confirmada en esta revisión | Reconocimiento de múltiples formatos ECU y análisis de logs. | No copiar ni adaptar código hasta localizar y verificar una licencia aplicable al repositorio y sus archivos. La palabra “open source” en una descripción no reemplaza el archivo de licencia. |
| [DIY Dyno](https://diydyno.com/) | GPL-3.0 para software; CERN-OHL-W para hardware, según el proyecto | Adquisición de sensores y control de banco inercial/frenado. | Referencia de arquitectura de adquisición, no componente de software para esta demo. Hardware y software tienen licencias distintas. |

## Decisiones de arquitectura

1. Mantener el núcleo de dominio propio y sin dependencias de visualización. La capa gráfica puede incorporar una biblioteca aislada, local y sustituible; uPlot no participa en los cálculos de ingeniería.
2. Priorizar adaptadores de formatos abiertos/documentados (CSV exportado, MoTeC cuando se pueda validar, y formatos de ECU con especificación verificable).
3. No importar cálculos de dinamómetro virtual como si fueran mediciones físicas. Identificar por separado:
   - ECU observado;
   - cálculo virtual estimado;
   - dinamómetro de motor;
   - dinamómetro de chasis;
   - rueda, cubo y rodillo.
4. Si se adopta código MIT, conservar el aviso de copyright y el texto de licencia en el componente distribuido, registrar versión/commit de origen y documentar modificaciones.
5. Para AGPL/GPL, revisar el impacto sobre distribución, modificaciones y combinación con el producto antes de incorporar código. No asumir que “gratis” significa sin obligaciones.
6. Generar un inventario de dependencias y licencias en CI antes de sumar paquetes de terceros.

## Capa gráfica local

La integración de uPlot usa el artefacto IIFE y su hoja CSS oficiales de la etiqueta 1.6.32, junto con la licencia MIT. Los archivos se sirven desde el propio repositorio, no desde un CDN. La integración no añade un paquete de runtime a npm.

La capa interactiva cubre dos salidas derivadas. En ECU representa señales temporales filtradas por segmento válido; cada segmento se dibuja por separado para no unir huecos ni períodos sin muestras. En dinamómetro representa cada barrido y canal, conservando mínimo, mediana y máximo por banda RPM. La envolvente mínimo–máximo se muestra sombreada; las bandas sin muestras se representan como huecos explícitos (`null`) y nunca se conectan mediante una línea continua. El eje gráfico usa el centro de banda, mientras la tabla conserva la RPM mediana observada. Los motores de cálculo siguen siendo `resampleTimeBasedSignals` y `buildRpmSweepCurves`; uPlot solo representa resultados ya calculados. Las tablas numéricas siguen visibles y exportables.

El modo de datos alineados de uPlot requiere valores X únicos y estrictamente ascendentes, y admite `null` para datos ausentes. Por eso la aplicación expande las bandas RPM omitidas a posiciones explícitas con `null`, valida el eje antes de crear la gráfica y no reordena muestras, interpola valores ni une barridos o segmentos. Los registros sin eje compatible permanecen en la tabla y muestran el motivo por el que no se dibuja la curva. El zoom horizontal y el cursor son ayudas de exploración, no operaciones de procesamiento ni cambios en la fuente.

## Evaluación MoTeC

i3rs es la opción técnica prioritaria para un futuro lector M1 `.ld/.ldx`: su API de bytes en memoria evita depender de rutas locales y permite diseñar un wrapper de WebAssembly. Sin embargo, no se incorpora todavía. Su repositorio incluye archivos `.ld/.ldx` de prueba, pero el hecho de que el código del proyecto tenga licencia MIT no demuestra que esos logs de muestra tengan una licencia de redistribución propia.

El punto de integración no debe ser el modelo CSV fila-a-fila. Los logs MoTeC almacenan canales con frecuencias y cantidades de muestras diferentes. Aplanarlos en una sola tabla exigiría elegir un reloj maestro y una política de alineación/resampling. Hasta que esa política esté definida y validada, cada canal debe conservar su eje temporal nativo.

El plan de trabajo, contrato intermedio, límites de memoria, controles de seguridad y criterios de aceptación están en [MOTEC_ADAPTER_PLAN.md](MOTEC_ADAPTER_PLAN.md).

## Referencias

- uPlot 1.6.32: https://github.com/leeoniya/uPlot/tree/1.6.32
- Documentación de modos y orden de datos: https://leeoniya.github.io/uPlot/docs/data-modes.html
- Chart.js decimation: https://www.chartjs.org/docs/latest/configuration/decimation.html
- Log2Dyno: https://github.com/nshobe/Log2Dyno
- Motorsport Analytics Pipeline: https://github.com/ElSirGuti/motorsport-analytics-pipeline
- i3rs: https://github.com/Friss/i3rs
- UltraLog: https://github.com/ClassicMiniDIY/UltraLog
- ECUxPlot: https://github.com/nyetlabs/ecuxplot
- DIY Dyno: https://diydyno.com/
