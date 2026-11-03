# Cómo está organizada la demo

La aplicación es pequeña y funciona en forma local.

- app/ contiene la página, los controles, los estilos y los gráficos SVG.
- src/demo-model.mjs genera los tres ejemplos en memoria y prepara el resumen que se puede descargar.
- src/comparison-readiness.mjs reúne los controles de origen, comparabilidad, calidad de datos, condiciones y procedencia.
- src/run-comparability.mjs compara canales observados cuando ambos registros declaran unidades compatibles. No convierte unidades ni certifica equivalencia física.
- tests/unit/ comprueba los escenarios y los límites del informe.
- tests/browser/ recorre la aplicación en Chromium y comprueba los gráficos, los bloqueos de origen, la descarga del informe, la vista móvil y la ausencia de solicitudes externas.

Esta exportación no incluye el agregador general del laboratorio privado, el motor externo TuneAssist, herramientas de investigación ni muestras de datos de terceros.
