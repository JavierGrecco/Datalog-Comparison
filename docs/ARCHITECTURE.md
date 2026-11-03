# Arquitectura de la demo

## Objetivo

La publicación es un prototipo pequeño, ejecutable en el navegador y orientado a demostrar reglas de evaluación de evidencia. La arquitectura separa la presentación de los módulos de dominio para que los controles puedan probarse sin depender del DOM.

## Flujo

La interfaz muestra dos rutas independientes:

- Escenarios sintéticos: generador de fixtures → matriz de preparación → gráficos e informe.
- Importación local: selector de perfil → parser/adaptador → mapeo y normalización → perfil de calidad → vista de inspección aislada.

La importación no se conecta a la matriz de preparación ni sustituye los escenarios sintéticos.

## Responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| app/ | Presentación, escenarios, gráficos SVG e inspección CSV local. |
| app/csv-inspector.mjs | Lectura local, selección de perfil, mapeo guiado y vista previa aislada. |
| src/csv-import.mjs | Parser genérico, límites, contrato de canales, preservación de valores fuente mapeados y registro exploratorio. |
| src/channel-resolver.mjs | Resolución determinista por alias, contexto, unidad y perfil numérico; propuestas difusas siempre sujetas a revisión. |
| src/unit-registry.mjs | Registro versionado de símbolos, dimensiones, unidades canónicas y conversiones con sensibilidad al caso. |
| src/adapters/haltech-nsp.mjs | Perfil experimental para variante Haltech NSP con marcador y encabezados tipados. |
| src/adapters/dynojet-powercore.mjs | Perfil guiado para CSV Dynojet con mapeo manual y base de medición declarada. |
| src/demo-model.mjs | Construcción determinista de ejemplos sintéticos y resumen portable. |
| src/comparison-readiness.mjs | Orquestación de puertas de evidencia y próximos pasos. |
| src/source-policy.mjs | Clasificación de fuentes y bloqueo de mezclas ECU/logger–dinamómetro. |
| src/data-quality.mjs | Perfil de muestras, cobertura, secuencia temporal y metadatos. |
| src/sample-selection.mjs | Selección determinista de muestras originales para vistas de inspección, sin interpolación ni mutación. |
| src/run-comparability.mjs | Detección de canales compartidos y compatibilidad declarada de unidades. |
| src/operating-conditions.mjs | Contrato, validación y comparación de condiciones declaradas. |
| src/run-manifest.mjs | Identidad, roles, huellas y contexto documentado. |

## Límites entre capas

- Los módulos de dominio no acceden al DOM, almacenamiento del navegador ni servicios de red.
- El parser CSV genérico es independiente de marca; el resolver propone asignaciones trazables y no fuerza encabezados desconocidos.
- La resolución tiene precedencia por metadatos de fabricante, alias exacto, calificadores, unidad compatible, coincidencia difusa y perfil de valores. Los dos últimos niveles solo sugieren.
- La unidad identifica dimensión, no siempre el rol. Se separan presión MAP/boost/combustible, actual/objetivo, RPM de motor/rueda/rodillo y bases físicas de torque/potencia.
- Las columnas no asignadas se registran y permanecen fuera de los canales canónicos; el perfil de valores solo ofrece candidatos explicables y nunca asigna una señal por rango numérico.
- Los adaptadores específicos se versionan por perfil y documentan evidencia del formato y reglas de conversión.
- Haltech rechaza estructuras no reconocidas y excluye tipos/canales sin semántica implementada.
- Dynojet no auto-detecta un esquema propietario; utiliza las sugerencias genéricas y exige confirmar las columnas y la base física si se importan torque o potencia.
- Los datos importados conservan el orden, faltantes y conversiones; el mapeo genérico conserva además las celdas de origen de los canales mapeados. Los adaptadores específicos documentan el nivel de transformación de sus valores; no se reordenan, interpolan ni imputan.
- La importación admite eje temporal o RPM; no los sintetiza. El perfil de calidad estima intervalos observados por canal solo cuando hay un eje temporal válido.
- El inspector crea un registro exploratorio y muestra calidad; no lo agrega a la matriz ni permite compararlo con fixtures.
- La matriz no calcula una puntuación opaca de confianza.
- Los gráficos consumen canales que superaron las comprobaciones de origen y unidad; faltantes interrumpen el trazo.
- El informe sintético no exporta muestras completas ni rutas locales.

## Ejecución y dependencias

La interfaz usa HTML, CSS y módulos ECMAScript nativos. Los gráficos se dibujan en SVG. No hay backend, proceso de build ni dependencias JavaScript en tiempo de ejecución.

Python puede utilizarse como servidor HTTP estático local, pero no participa del producto. Node.js y Playwright se reservan para las comprobaciones automatizadas.

## Pruebas

- tests/unit/: reglas de dominio, parser genérico, adaptadores, escenarios y contratos.
- tests/fixtures/: archivos CSV sintéticos y versionados.
- tests/browser/: servidor efímero local y recorrido de escenarios/importadores en Chromium.
- npm test: sintaxis, pruebas unitarias y pruebas de navegador.

El detalle de estados está en QUALITY_GATES.md. El contrato de importación está en CSV_IMPORT.md. Las pruebas automáticas no demuestran equivalencia física ni validan un vehículo.
