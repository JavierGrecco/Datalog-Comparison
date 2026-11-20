# Arquitectura de la demo

## Objetivo

La publicación es un prototipo pequeño, ejecutable en el navegador y orientado a demostrar reglas de evaluación de evidencia. La arquitectura separa la presentación de los módulos de dominio para que los controles puedan probarse sin depender del DOM.

## Flujo

La interfaz muestra dos rutas independientes:

- Escenarios sintéticos: generador de fixtures → matriz de preparación → gráficos e informe.
- Importación local: selector de perfil → parser/adaptador → mapeo y normalización → perfil de calidad → vista de inspección → asignación explícita referencia/candidata → resumen de distribuciones sin alineación temporal.

El expediente importado permanece separado de la matriz y los gráficos sintéticos. Solo utiliza dos registros CSV aportados por quien ejecuta la demo y conserva copias en memoria de la página.

## Responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| app/ | Presentación, escenarios, gráficos SVG e inspección CSV local. |
| app/csv-inspector.mjs | Lectura local, selección de perfil, mapeo guiado, asignación de roles y presentación de comparaciones importadas. |
| src/text-decoder.mjs | Decodificación estricta de UTF-8/UTF-16 con BOM; rechaza secuencias inválidas en vez de reemplazar bytes. |
| src/csv-import.mjs | Parser genérico, límites, contrato de canales, procedencia de codificación y preservación de valores fuente mapeados. |
| src/channel-resolver.mjs | Resolución determinista por alias, contexto, unidad y perfil numérico; propuestas difusas siempre sujetas a revisión. |
| src/unit-registry.mjs | Registro versionado de símbolos, dimensiones, unidades canónicas y conversiones con sensibilidad al caso. |
| src/adapters/haltech-nsp.mjs | Perfil experimental para variante Haltech NSP con marcador y encabezados tipados. |
| src/adapters/dynojet-powercore.mjs | Perfil guiado para CSV Dynojet con mapeo manual y base de medición declarada. |
| src/demo-model.mjs | Construcción determinista de ejemplos sintéticos y resumen portable. |
| src/comparison-readiness.mjs | Orquestación de puertas de evidencia y próximos pasos. |
| src/source-policy.mjs | Clasificación de fuentes y bloqueo de mezclas ECU/logger–dinamómetro. |
| src/data-quality.mjs | Perfil de muestras, cobertura, secuencia temporal y metadatos. |
| src/sample-selection.mjs | Selección determinista de muestras originales para vistas de inspección, sin interpolación ni mutación. |
| src/series-display.mjs | Decimación min/max solo para SVG; conserva extremos y cortes de datos faltantes sin modificar los registros. |
| src/signal-processing.mjs | Señales derivadas: decimación temporal FIR para señales continuas, retención para discretas y curvas de dinamómetro por barridos y bandas RPM. |
| src/run-comparability.mjs | Inventario de señales, recuento de valores numéricos, canales no compartidos y compatibilidad de unidades/base física. |
| src/distribution-comparison.mjs | Resumen estadístico conservador de registros independientes, con exclusiones por canal y sin alineación temporal. |
| src/imported-comparison-report.mjs | Serialización versionada del expediente importado con lista permitida de metadatos; excluye muestras, celdas y rutas locales. |
| src/imported-comparison-report-validator.mjs | Validación estructural contra el esquema publicado y comprobación de invariantes estadísticas y de unidades. |
| scripts/validate-comparison-report.mjs | Interfaz CLI para validar informes desde archivo o stdin, con salida humana o JSON. |
| schemas/imported-run-comparison-1.schema.json | Contrato JSON Schema Draft 2020-12 para el informe portable de comparaciones importadas. |
| examples/imported-run-comparison-1.example.json | Ejemplo completo y versionado para consumidores externos. |
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
- El inspector crea registros exploratorios; dos pueden asignarse manualmente a un expediente local de comparación descriptiva. No se mezclan con fixtures sintéticos ni con la matriz de escenarios.
- La matriz no calcula una puntuación opaca de confianza.
- El comparador de distribuciones resume cada registro por separado; excluye y explica canales incompatibles, unilaterales o con cobertura insuficiente. No alinea relojes ni empareja puntos.
- Los gráficos consumen canales que superaron las comprobaciones de origen y unidad; faltantes interrumpen el trazo.
- El procesamiento de señales derivadas devuelve artefactos versionados e independientes. Nunca reescribe muestras originales ni permite que las métricas de calidad lean las series reducidas.
- Los informes sintético e importado no exportan muestras completas ni rutas locales. El segundo conserva metadatos permitidos, estadísticas y controles; su SHA-256 identifica bytes iguales, no autentica el origen.
- El validador CLI carga el esquema versionado y añade controles de dominio sobre recuentos, cobertura, unidades y diferencias estadísticas. Solo sigue referencias locales; no accede a la red.

## Ejecución y dependencias

La interfaz usa HTML, CSS y módulos ECMAScript nativos. Los gráficos se dibujan en SVG. No hay backend, proceso de build ni dependencias JavaScript en tiempo de ejecución.

Python puede utilizarse como servidor HTTP estático local, pero no participa del producto. Node.js ejecuta las pruebas, la generación de datos y el validador CLI de informes; Playwright se reserva para las comprobaciones de navegador.

## Pruebas

- tests/unit/: reglas de dominio, parser genérico, adaptadores, escenarios y contratos.
- tests/fixtures/: archivos CSV sintéticos y versionados.
- tests/browser/: servidor efímero local y recorrido de escenarios/importadores en Chromium.
- npm test: sintaxis, pruebas unitarias y pruebas de navegador.
- npm run validate:report -- archivo.json: validación de un informe portable desde consola o tubería.

El detalle de estados está en QUALITY_GATES.md. El contrato de importación está en CSV_IMPORT.md. Las pruebas automáticas no demuestran equivalencia física ni validan un vehículo.
