# Arquitectura de la demostración

## Objetivo

La aplicación es una demostración local de análisis de registros de motor. Su diseño separa la interfaz, las reglas de dominio, el procesamiento de señales, la presentación gráfica y la persistencia de expedientes.

La prioridad es que cada resultado pueda explicarse: de qué archivo proviene, qué reglas se aplicaron, qué transformaciones se realizaron y cuáles son sus límites. Una vista o un cálculo derivado no reemplaza el archivo original ni convierte una declaración del usuario en una medición autenticada.

## Recorridos principales

### Escenarios sintéticos

`Fixtures` reproducibles → modelo de dominio → controles de origen y calidad → matriz de preparación → gráficos e informe sintético.

Los escenarios se generan en memoria y se mantienen separados de los CSV que aporta quien usa la aplicación.

### Importación CSV local

Archivo seleccionado en el navegador → decodificación y parser → perfil/adaptador → mapeo de canales → normalización de unidades → controles de calidad → inspección y análisis derivado.

La comparación importada resume cada registro por separado. No sincroniza relojes, no empareja muestras y no calcula diferencias punto a punto.

### Protocolos y repetibilidad

Formulario guiado o JSON → validación de dominio y condiciones operativas → evaluación de repeticiones → artefacto derivado pendiente → guardado manual en un expediente local.

Los controles distinguen ECU/logger, banco de motor y banco de chasis. Para agrupar repeticiones se verifica tanto el identificador como los valores efectivos de RPM/carga o tramo; también se contrastan los tiempos de estabilización y las condiciones ambientales. Una evaluación no certifica una norma ni autentica sensores, documentos o calibraciones.

## Responsabilidades por capa

| Capa o módulo | Responsabilidad |
| --- | --- |
| `app/app.mjs` | Inicio de la aplicación, escenarios sintéticos y coordinación de vistas. |
| `app/csv-inspector.mjs` | Selección de archivos, importadores, mapeo guiado, resumen y vistas de análisis derivado. |
| `app/telemetry-charts.mjs` | Presentación Canvas de series ya calculadas; valida ejes y administra el ciclo de vida de las gráficas. |
| `app/protocol-inspector.mjs` | Captura y evaluación guiada de protocolos de ensayo. |
| `app/dossier-inspector.mjs` | Expedientes locales, historial, artefactos derivados, consentimiento de archivado de CSV y respaldos. |
| `app/imported-report-inspector.mjs` | Apertura local de informes guardados, validación de esquema y representación segura del resumen. |
| `src/text-decoder.mjs` | Decodificación estricta UTF-8/UTF-16 con BOM; rechaza secuencias inválidas. |
| `src/csv-import.mjs` | Parser genérico, límites de entrada, preservación de valores fuente y contrato de canales. |
| `src/adapters/` | Perfiles experimentales de formatos ECU/dinamómetro; no presuponen compatibilidad universal. |
| `src/channel-resolver.mjs` | Reconocimiento determinista por alias, contexto, unidad y perfil numérico. Las propuestas difusas requieren revisión. |
| `src/unit-registry.mjs` | Símbolos, dimensiones, unidades canónicas y conversiones versionadas y sensibles al caso. |
| `src/data-quality.mjs` | Faltantes, cobertura, consistencia de metadatos y calidad temporal. |
| `src/source-policy.mjs` | Clasificación de fuentes y bloqueos ante mezclas físicamente incompatibles. |
| `src/comparison-readiness.mjs` | Orquestación de puertas de evidencia y próximos pasos. |
| `src/run-comparability.mjs` | Inventario de señales, cobertura y compatibilidad de unidad/base física. |
| `src/distribution-comparison.mjs` | Estadísticas descriptivas de registros independientes, con exclusiones explicadas. |
| `src/sample-selection.mjs` | Selección determinista de muestras originales para vistas de inspección, sin mutarlas. |
| `src/series-display.mjs` | Reducción min/max para gráficos SVG sintéticos; preserva extremos y cortes. |
| `src/signal-processing.mjs` | Señales derivadas: filtrado y remuestreo temporal FIR para señales continuas, retención para discretas y curvas de dinamómetro por barrido/banda RPM. |
| `src/operating-conditions.mjs` | Catálogo, validación y comparación de condiciones operativas declaradas. |
| `src/test-protocol.mjs` | Perfiles ECU/dinamómetro, consistencia de condiciones, repetibilidad y límites de interpretación. |
| `src/run-manifest.mjs` | Identidad del registro, rol, huellas y contexto documentado. |
| `src/imported-comparison-report.mjs` | Serialización versionada con lista permitida de metadatos; excluye muestras y rutas locales. |
| `src/imported-comparison-report-validator.mjs` | Esquema e invariantes de dominio sobre unidades, recuentos y estadísticas. |
| `src/local-dossier-store.mjs` | Persistencia IndexedDB con almacenes separados para expedientes, informes, archivos fuente y artefactos derivados. |
| `src/dossier-evolution.mjs` | Evolución y resumen de artefactos contenidos en un expediente. |
| `scripts/` | Utilidades de terminal para simulación, descarga explícita de muestras públicas y validación de informes/protocolos. |

## Límites entre capas

- Los módulos de dominio no acceden al DOM, a IndexedDB ni a servicios de red.
- Los parsers y adaptadores no convierten encabezados desconocidos en canales canónicos sin evidencia suficiente.
- Una unidad identifica una dimensión, pero no siempre el rol. Se distinguen, por ejemplo, RPM de motor/rueda/rodillo, presión MAP/boost/combustible y torque/potencia por base física.
- Las propuestas por similitud de nombre o rango numérico no se presentan como hechos: requieren confirmación.
- Los valores, faltantes y orden de las fuentes se conservan. No se imputan datos ni se reordenan muestras originales.
- ECU/logger y dinamómetro son dominios diferentes. Tampoco son intercambiables banco de motor, rueda, cubo y rodillo.
- La comparación importada describe distribuciones independientes. No alinea relojes, no interpola y no empareja muestras.
- El procesamiento derivado produce artefactos versionados e independientes. No reescribe el CSV ni cambia las métricas de calidad del archivo fuente.
- Las condiciones de operación conservan valor, estado de evidencia, fuente y nota. `measured` o `verified` reflejan lo declarado por quien carga; no autentican instrumentos ni documentos.
- Los informes portables excluyen muestras completas, celdas CSV y rutas locales. El SHA-256 identifica bytes iguales; no demuestra autoría ni procedencia.
- Los visores de informes reconstruyen únicamente el resumen exportado. El contenido externo se representa como texto, no como HTML ejecutable.

## Procesamiento y visualización

El procesamiento es independiente del motor gráfico:

- **ECU/logger:** las señales continuas se filtran/remuestrean según el perfil temporal; las señales discretas se retienen. Los tramos separados por huecos se conservan como segmentos distintos.
- **Dinamómetro:** `buildRpmSweepCurves` calcula resultados por barrido y canal, con mínimos, medianas y máximos por banda de RPM. No combina barridos diferentes. La vista gráfica reintroduce las posiciones de bandas omitidas como `null`, de modo que la curva y la envolvente se interrumpen donde no hay muestras suficientes.
- **Gráficos sintéticos:** conservan la implementación SVG existente.
- **Gráficos de CSV:** `app/telemetry-charts.mjs` presenta señales ECU por segmento y curvas de dinamómetro por barrido/canal usando uPlot 1.6.32. La biblioteca no calcula métricas ni completa muestras.

uPlot se distribuye localmente en `vendor/uplot/`, con licencia y aviso de origen. No se carga desde CDN. Antes de crear una gráfica se valida que el eje X sea numérico, único, estrictamente creciente y que las series estén alineadas. El módulo no ordena, interpola ni une segmentos. Si no se cumplen las condiciones, se conserva la tabla y se informa que no se puede dibujar la gráfica. Al cambiar la fuente o la vista, se desconectan los observadores y se destruyen las instancias para liberar listeners y cachés.

## Persistencia, seguridad y privacidad

La aplicación no tiene backend, cuentas, telemetría ni sincronización entre dispositivos. Los CSV se procesan localmente en el navegador. Los expedientes e informes pueden permanecer en IndexedDB del perfil actual.

Los bytes originales solo se archivan con consentimiento explícito. Se guardan separados del informe y se vuelve a verificar su SHA-256. Los respaldos JSON no incluyen los bytes de los CSV. IndexedDB no está cifrado ni es un mecanismo de control de acceso; cualquier persona con acceso al mismo perfil puede acceder a sus datos.

La política de seguridad, límites de entrada y tratamiento de datos está documentada en [Seguridad e integridad de datos](SECURITY_AND_DATA_INTEGRITY.md) y [Expedientes locales](LOCAL_DOSSIERS.md).

## Componentes externos y formatos pendientes

La única biblioteca de visualización redistribuida actualmente es uPlot 1.6.32, de licencia MIT. Los detalles de versión, archivos y atribución se encuentran en [Componentes open source evaluados](OPEN_SOURCE_COMPONENTS.md) y `vendor/uplot/NOTICE.md`.

MoTeC `.ld/.ldx` sigue siendo un candidato para un adaptador futuro. Los proyectos Rust i3rs y motec-i2 pueden orientar una herramienta local de solo lectura o una segunda implementación de validación, pero todavía no forman parte de la aplicación. Antes de integrarlos hacen falta archivos de prueba con permiso de uso, verificación cruzada de canales/unidades y una salida intermedia versionada. No se debe habilitar escritura sobre archivos originales.

Los cálculos de dinamómetro virtual también deben permanecer como estimaciones separadas de las mediciones físicas de banco.

## Ejecución y pruebas

La aplicación usa HTML, CSS y módulos ECMAScript nativos. No requiere instalar paquetes para abrir la demo; los recursos de uPlot están incluidos localmente. Python puede servir los archivos estáticos, pero no participa del producto.

Las pruebas y herramientas de desarrollo requieren Node.js 22 o posterior:

- `npm ci`: instala herramientas fijadas para desarrollo y pruebas.
- `npm audit --audit-level=high`: audita dependencias instaladas.
- `npx playwright install chromium`: prepara el navegador de pruebas.
- `npm test`: chequeo de sintaxis, pruebas unitarias y recorrido con Chromium.
- `npm run validate:report -- archivo.json`: valida un informe portable.
- `npm run assess:protocol -- archivo.json`: evalúa condiciones y repetibilidad.

Las pruebas verifican el comportamiento del software cubierto; no certifican sensores, motores, dinamómetros ni equivalencia física. Consultá [Protocolos de ensayo](TEST_PROTOCOLS.md), [Puertas de calidad](QUALITY_GATES.md) y [Límites de la demo](LIMITATIONS.md).
