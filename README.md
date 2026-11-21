<div align="center">

# Datalog Comparison

### La evidencia antes que la comparación.

Una demostración técnica para evaluar si dos registros de motor ofrecen una base razonable para compararlos, identificar límites en los datos y explicar cuándo corresponde revisar o bloquear el análisis.

[![Validación de la demo](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml)

**Demo experimental · JavaScript · Datos sintéticos reproducibles · Fuentes públicas documentadas · Adaptadores CSV experimentales**

</div>

---

## El problema

Superponer dos curvas no demuestra que las mediciones sean comparables. Antes de interpretar diferencias conviene conocer su origen, calidad temporal, canales, unidades, condiciones de prueba y procedencia.

**Datalog Comparison** explora ese paso previo. La aplicación reúne controles independientes y presenta sus resultados de forma explicable: qué se pudo comprobar, qué requiere revisión y qué incompatibilidad impide continuar.

Es una muestra acotada de ingeniería de software aplicada al análisis de registros de motor. **No es un producto de taller, un sistema de diagnóstico ni una herramienta de calibración.**

## Qué incluye la demostración

La aplicación contiene cuatro escenarios sintéticos generados en memoria:

| Escenario | Qué permite observar |
| --- | --- |
| **Registros completos** | Dos registros del mismo dominio, con canales y unidades declarados. La matriz mantiene la validación real como requisito. |
| **Datos incompletos** | Valores ausentes, cobertura parcial y anomalías en la secuencia temporal. Los datos faltantes no se completan artificialmente. |
| **ECU frente a dinamómetro** | Dos fuentes de evidencia distintas. La política bloquea la comparación numérica conjunta y oculta las curvas superpuestas. |
| **Bases de banco distintas** | Dos resultados de dinamómetro con la misma unidad, uno de rueda y otro referido a motor. Torque y potencia quedan excluidos aunque el origen sea el mismo. |

Además, se pueden **inspeccionar archivos CSV y MSL locales** mediante cuatro rutas: CSV genérico, dos layouts experimentales Haltech NSP identificados por %DataLog% (encabezado tipado y bloques Channel/ID/Type), un perfil guiado para Dynojet PowerCore/WinPEP y un perfil TunerStudio/MegaSquirt para MSL tabulado y export CSV clásico con metadatos. Dos importaciones pueden asignarse explícitamente como referencia y candidata en un expediente local. El resumen compara distribuciones de canales compatibles sin alinear relojes ni emparejar muestras; los escenarios sintéticos permanecen separados. El expediente permite exportar un informe JSON versionado con estadísticas, exclusiones, controles de revisión, unidades y procedencia resumida, sin filas, muestras ni contenido del CSV. Se calcula SHA-256 en el navegador para detectar si se seleccionó dos veces el mismo archivo; la huella no autentica su origen. Se examinó una exportación pública Haltech para validar la estructura de metadatos; el archivo no se incluye ni se redistribuye.

En los escenarios sintéticos compatibles de un mismo dominio se pueden inspeccionar gráficos descriptivos de **torque y potencia frente a RPM**. El caso de bases de banco distintas muestra cómo se excluyen esos canales cuando la magnitud física no coincide. Ambos comparten el eje horizontal y mantienen escalas verticales independientes. La aplicación también permite exportar un resumen de la evaluación sintética en JSON.

Para los CSV importados hay vistas interactivas adicionales, separadas de los escenarios sintéticos. En ECU, las señales temporales derivadas se dibujan por segmento continuo: los huecos y períodos sin muestras no se conectan artificialmente. En dinamómetro, cada barrido y canal conserva los mínimos, medianas y máximos observados por banda de RPM, con cursor y zoom horizontal. Las tablas numéricas permanecen disponibles y exportables; el gráfico no reemplaza los datos ni calcula mediciones nuevas.

### Cómo decide la matriz

Los controles se presentan por separado, sin reducirlos a una puntuación opaca:

- **Origen:** identifica si los registros pertenecen al dominio ECU/logger o dinamómetro.
- **Calidad:** revisa faltantes, cobertura, consistencia de metadatos y secuencia temporal.
- **Canales, unidades y base física:** comprueba qué señales tienen una unidad, cobertura y base de torque/potencia compatibles.
- **Condiciones de operación:** revisa valores, estado de verificación y procedencia declarada.
- **Procedencia:** conserva la información disponible sobre archivos, roles y contexto.

| Resultado | Interpretación |
| --- | --- |
| **Bloqueada** | Existe una incompatibilidad que impide realizar esa comparación. |
| **Revisión necesaria** | Hay advertencias, información incompleta o validaciones pendientes. |
| **Descriptiva** | Solo permite una lectura limitada de los datos observados; no acredita equivalencia física. |

Un resultado descriptivo no certifica que dos ensayos sean equivalentes. La interpretación técnica sigue dependiendo de la evidencia original y de la revisión de una persona con experiencia.

## Importación CSV y perfiles experimentales

**Haltech NSP:** se reconocen dos layouts con marcador %DataLog%: encabezados tipados y bloques de metadatos Channel/ID/Type. El segundo se contrastó con una exportación pública de 114 canales; se aplican nombres exactos y reglas de escala acotadas. Las reglas son comunitarias y no están certificadas por el fabricante.

**Dynojet PowerCore/WinPEP:** el perfil guiado utiliza el parser neutral porque las exportaciones son configurables y no se encontró un esquema CSV universal. El resolver propone coincidencias genéricas que deben confirmarse; también se declara la base física de torque/potencia. No lee archivos nativos de WinPEP o Power Vision.

**TunerStudio / MegaSquirt:** se reconocen MSL tabulados con preámbulo opcional, fila de unidad temporal, columnas `Time` y `SecL` separadas y eventos `MARK`, además del export CSV clásico `Tune Datalog export of` con `Frame,Duration` y metadatos. `Duration` se conserva en segundos; las anomalías del reloj no se corrigen silenciosamente. Los binarios `.mlg` y `.ms3` no están soportados.

**CSV genérico:** cuenta con un resolver determinista local, sin IA externa, que propone alias, variantes de nombres, unidades y pistas numéricas. Solo las coincidencias exactas, únicas y dimensionalmente compatibles se preseleccionan para revisión; los errores de tipeo, ambigüedades y pistas por rango requieren confirmación. Las unidades admitidas se normalizan a unidades canónicas con reglas versionadas y se conserva la procedencia. Las columnas desconocidas y datos faltantes no se fuerzan dentro del modelo. La comparación importada es local y descriptiva: resume cada archivo por separado y excluye canales sin unidad o base física compatible, no compartidos o con cobertura insuficiente.

Consultá el [contrato y los perfiles CSV](docs/CSV_IMPORT.md) para conocer conversiones, límites, procedencia y restricciones.

Los protocolos de ensayo y repetibilidad incluyen perfiles separados para ECU, banco de motor y banco de chasis. La base física debe declararse como motor, rueda, cubo o rodillo; las condiciones requeridas cambian según el método y el tipo de banco. El sistema informa dispersión y CV, pero no aprueba sin un límite explícito definido para ese equipo y método. Ver [Protocolos de ensayo y repetibilidad](docs/TEST_PROTOCOLS.md).

El formato de exportación de comparaciones importadas tiene un [JSON Schema Draft 2020-12](schemas/imported-run-comparison-1.schema.json), un [ejemplo completo](examples/imported-run-comparison-1.example.json) y una [guía del contrato](docs/IMPORTED_COMPARISON_REPORT.md). El repositorio también incluye un [validador CLI](docs/IMPORTED_COMPARISON_REPORT.md#validador-independiente) para verificar informes desde archivos o tuberías. La interfaz permite además [abrir y revisar un informe guardado](docs/IMPORTED_COMPARISON_REPORT.md#abrir-un-informe-en-la-interfaz), sin volver a cargar los CSV. Los informes se pueden organizar en [expedientes locales persistentes](docs/LOCAL_DOSSIERS.md), con historial, artefactos derivados y respaldos. El respaldo tiene su [JSON Schema versionado](schemas/local-dossier-backup-1.schema.json) y [ejemplo](examples/local-dossier-backup-1.example.json).

## Ejecutar la aplicación

La demo no necesita una ECU, servicios externos ni instalar dependencias de ejecución: los recursos gráficos necesarios ya están incluidos localmente. Solo requiere servir los archivos estáticos desde un servidor local. Una opción disponible en muchos equipos es Python:

```bash
git clone https://github.com/JavierGrecco/Datalog-Comparison.git
cd Datalog-Comparison
python3 -m http.server 8000
```

Abrí [http://127.0.0.1:8000/](http://127.0.0.1:8000/) en el navegador. La página de inicio dirige a la aplicación ubicada en `app/`.

**Python no forma parte del motor ni de la arquitectura del producto:** se utiliza únicamente como servidor estático de desarrollo. Puede reemplazarse por cualquier servidor HTTP local equivalente.

Para detener el servidor, presioná `Ctrl+C`.

## Validar el código

Las pruebas automatizadas requieren **Node.js 22 o posterior** y npm. Desde la raíz del repositorio:

```bash
npm ci --ignore-scripts
npm audit --audit-level=low
npx playwright install chromium
npm test
```

Para validar un informe JSON exportado, sin modificarlo ni enviarlo a un servicio externo:

```bash
npm run validate:report -- ./datalog-comparison-imported.json
```

El comando devuelve código de salida `0` para informes válidos, `1` para JSON/informes inválidos y `2` para errores de uso o lectura. También acepta entrada por tubería y salida JSON para CI; ver [la guía del validador](docs/IMPORTED_COMPARISON_REPORT.md#validador-independiente).

El comando `npm test` ejecuta:

1. **Chequeo de sintaxis:** valida los módulos JavaScript incluidos en el proyecto.
2. **Pruebas unitarias y de contratos:** comprueba escenarios, reglas de origen, unidades, calidad temporal, parser CSV, condiciones operativas, manifiestos, estados de evaluación e informes.
3. **Prueba de navegador:** recorre la entrada del sitio y la interfaz en Chromium, verifica la inspección CSV local, gráficos, bloqueos, selección por teclado, exportación JSON, vista móvil, errores y solicitudes externas.

El workflow de GitHub Actions ejecuta estas validaciones en cada actualización y en las solicitudes de integración. El indicador al comienzo del documento muestra el estado de la última ejecución.

Estas pruebas verifican el comportamiento del software cubierto por ellas; no validan sensores, motores, dinamómetros ni resultados físicos.

## Datos públicos y simulación

La demo ahora incluye un catálogo versionado de fuentes y herramientas para crear registros de prueba reproducibles. No se copian datasets grandes ni logs comunitarios sin licencia al repositorio.

- [Catálogo de datasets y política de licencias](docs/PUBLIC_DATASETS.md): fuentes CC BY 4.0, atribución, procedencia, restricciones y clasificación entre datos medidos, simulados y derivados.
- El catálogo incluye un pequeño extracto OpenBLDCData CC BY 4.0 para probar adquisición y calidad temporal; no se usa para curvas de motor térmico o dinamómetro de vehículo.
- [Simulación y ECU virtual](docs/SIMULATOR.md): generadores reproducibles para ECU y dinamómetro, fixtures Graph Export/Time Export y guía para conectar el simulador externo Speeduino a TunerStudio.
- [Catálogo estructurado](data/sources.json): registro legible por máquina de URLs, licencias y estado de reutilización.

Generá un CSV ECU uniforme para inspeccionar localmente:

```bash
npm run simulate:telemetry -- --profile ecu --scenario road-test --duration 120 --rate 20 --seed 42
```

También hay un perfil OBD asíncrono y un escenario con pérdidas de sensores. El generador de dinamómetro crea archivos sintéticos para los modos Graph Export y Time Export, con referencia, candidata, dos tiradas y faltantes; no son exportaciones nativas ni mediciones reales. Los resultados ECU y OBD se escriben en carpetas locales excluidas de Git. Para ensayos de dinamómetro, ejecutá `npm run simulate:dyno -- --mode graph-export` o `--mode time-export`; ver [guía del simulador](docs/SIMULATOR.md#3-generador-de-ensayos-de-dinamómetro). Para descargar una porción de hasta 100 filas del dataset Opel CC BY 4.0, utilizá `npm run data:obd-sample -- --offset 0 --length 100`; el comando conserva un sidecar de atribución y SHA-256.

La licencia de un dataset externo no concede una licencia sobre el código de este repositorio. Los logs generados por Speeduino tampoco se publican con licencia asumida: el simulador upstream tiene MIT para su código, pero el estado de licencia de sus outputs debe revisarse por separado.

## Organización del repositorio

```text
.
├── app/
│   ├── app.mjs
│   ├── csv-inspector.mjs
│   ├── telemetry-charts.mjs # Presentación Canvas aislada del cálculo
│   ├── imported-report-inspector.mjs
│   ├── dossier-inspector.mjs
│   └── styles.css
├── data/
│   └── sources.json       # Catálogo de fuentes, licencias y procedencia
├── scripts/
│   ├── fetch-obd-sample.mjs
│   ├── generate-simulated-telemetry.mjs
│   ├── generate-simulated-dyno.mjs
│   └── validate-comparison-report.mjs
├── src/
│   ├── simulated-telemetry.mjs
│   ├── simulated-dyno.mjs
│   ├── csv-import.mjs
│   ├── channel-resolver.mjs
│   ├── unit-registry.mjs
│   ├── adapters/          # Perfiles experimentales ECU/dinamómetro
│   ├── demo-model.mjs
│   ├── imported-comparison-report.mjs
│   ├── imported-comparison-report-validator.mjs
│   ├── local-dossier-store.mjs
│   ├── comparison-readiness.mjs
│   ├── run-comparability.mjs
│   ├── data-quality.mjs
│   ├── source-policy.mjs
│   ├── operating-conditions.mjs
│   ├── test-protocol.mjs
│   ├── signal-processing.mjs
│   └── run-manifest.mjs
├── tests/
│   ├── fixtures/         # CSV sintéticos y extracto BLDC CC BY 4.0 atribuido
│   ├── unit/             # Pruebas de dominio y parser
│   │   └── simulated-telemetry.test.mjs
│   └── browser/          # Recorrido automatizado con Chromium
├── schemas/
│   ├── imported-run-comparison-1.schema.json
│   └── local-dossier-backup-1.schema.json
├── examples/
│   ├── imported-run-comparison-1.example.json
│   └── local-dossier-backup-1.example.json
├── docs/
│   ├── PUBLIC_DATASETS.md
│   ├── TEST_PROTOCOLS.md
│   ├── OPEN_SOURCE_COMPONENTS.md
│   ├── SIMULATOR.md
│   ├── ARCHITECTURE.md
│   ├── CSV_IMPORT.md
│   ├── IMPORTED_COMPARISON_REPORT.md
│   ├── LOCAL_DOSSIERS.md
│   ├── CHANNEL_RECOGNITION.md
│   ├── QUALITY_GATES.md
│   ├── ENGINEERING.md
│   ├── LIMITATIONS.md
│   └── REFERENCES.md
├── vendor/
│   └── uplot/             # uPlot 1.6.32 y avisos MIT
├── SECURITY.md
├── index.html
└── package.json
```

La interfaz está implementada con HTML, CSS y módulos JavaScript nativos. Los escenarios sintéticos usan gráficos SVG; las vistas interactivas de telemetría utilizan uPlot 1.6.32 sobre Canvas. La biblioteca y su CSS se sirven localmente desde `vendor/uplot/`, sin CDN ni solicitudes externas. El motor de dominio calcula y valida las series antes de entregarlas a la capa de presentación. No hay framework de interfaz, proceso de compilación ni backend para esta demostración.

## Arquitectura y criterios de calidad

La implementación separa la presentación de las reglas de dominio. La matriz no calcula un puntaje de confianza: combina comprobaciones identificables de origen, calidad, unidades, condiciones y procedencia.

- [Arquitectura](docs/ARCHITECTURE.md): responsabilidades y flujo entre módulos.
- [Contrato CSV](docs/CSV_IMPORT.md): entrada, límites, mapeo y significado de la vista de inspección.
- [Reconocimiento de canales](docs/CHANNEL_RECOGNITION.md): alias, errores de tipeo, dimensiones, límites de inferencia y perfiles de valores.
- [Puertas de calidad](docs/QUALITY_GATES.md): significado de los estados y criterios de bloqueo/revisión.
- [Notas de ingeniería](docs/ENGINEERING.md): validación, convenciones, política de rama única y definición de terminado.
- [Datos públicos](docs/PUBLIC_DATASETS.md): datasets reutilizables, atribución y restricciones.
- [Simulador](docs/SIMULATOR.md): generación reproducible e integración opcional con Speeduino.
- [Protocolos de ensayo](docs/TEST_PROTOCOLS.md): perfiles y evaluación de repetibilidad.
- [Componentes open source](docs/OPEN_SOURCE_COMPONENTS.md): criterios de integración, licencias y decisiones sobre bibliotecas y proyectos externos.
- [Plan de adaptador MoTeC](docs/MOTEC_ADAPTER_PLAN.md): fuentes de práctica y permisos, revisión del parser i3rs, riesgos de muestras truncadas, alternativas oficiales de MoTeC y criterios previos a la integración.
- [Límites de la demo](docs/LIMITATIONS.md): alcance funcional y técnico.
- [Referencias consultadas](docs/REFERENCES.md): antecedentes revisados durante la investigación.

## Alcance y límites

- Todos los escenarios de comparación y sus curvas son **sintéticos**.
- Los CSV importados son datos aportados por quien ejecuta la demo. Su origen y unidades son declaraciones, no datos autenticados.
- Haltech NSP reconoce dos layouts experimentales de CSV con marcador %DataLog% (encabezado tipado y bloques Channel/ID/Type); no representa compatibilidad universal.
- Dynojet PowerCore/WinPEP utiliza mapeo guiado y no lee archivos nativos ni presupone un esquema fijo. No se encontró una exportación CSV cruda pública para validarlo de extremo a extremo.
- TunerStudio/MegaSquirt admite texto MSL y export CSV clásico; no lee binarios `.mlg` ni `.ms3`.
- La comparación entre dos archivos importados no es sincronizada ni punto a punto: no alinea relojes, no interpola y no calcula diferencias entre muestras emparejadas.
- No demuestra equivalencia física, sincroniza relojes ni prueba que dos señales representen la misma magnitud. La normalización de unidades admitidas queda registrada.
- ECU/logger y dinamómetro son fuentes diferentes; no se deben mezclar por defecto.
- No escribe, modifica ni programa una ECU; tampoco diagnostica fallas, demuestra causalidad o emite recomendaciones de calibración validadas.

## Datos y privacidad

La aplicación no tiene cuentas, backend, telemetría ni sincronización entre dispositivos. Los CSV se inspeccionan en el navegador y, si se crean expedientes, sus metadatos, informes y artefactos derivados pueden permanecer en IndexedDB del perfil actual.

Los CSV originales **solo se archivan cuando se marca expresamente la opción de consentimiento** al guardar un informe. Se guardan separados del informe y se vuelve a verificar su SHA-256. Los respaldos JSON contienen informes y artefactos derivados, pero nunca los bytes de los CSV originales; estos deben descargarse individualmente desde el historial.

IndexedDB no es un almacén cifrado ni un mecanismo de control de acceso. Cualquier persona con acceso al mismo perfil del navegador puede acceder a los datos locales. Borrar los datos del sitio, cambiar de perfil/navegador o cambiar de dispositivo puede hacerlos desaparecer. Descargá respaldos periódicos y revisá los nombres de archivo y encabezados antes de compartir informes.

Para conocer las medidas, límites y prácticas recomendadas, consultá [Seguridad e integridad de datos](docs/SECURITY_AND_DATA_INTEGRITY.md) y [Expedientes locales](docs/LOCAL_DOSSIERS.md).

Los comandos de datasets son acciones de terminal separadas y explícitas: `data:obd-sample` consulta Hugging Face para descargar únicamente el slice solicitado. Los archivos se guardan en `data/external/`, fuera de Git, junto a su atribución y SHA-256. El generador escribe en `data/generated/`, también excluida de Git. Ninguno de esos comandos se ejecuta al abrir la web.

## Referencias y procedencia

La implementación publicada es una selección acotada propia, preparada para esta demostración. Los proyectos enumerados en [docs/REFERENCES.md](docs/REFERENCES.md) fueron consultados como antecedentes y no son dependencias de ejecución. La excepción es uPlot 1.6.32, redistribuido sin modificaciones en `vendor/uplot/` bajo su licencia MIT, con el texto de licencia, versión, commit y huellas de los archivos documentados en `vendor/uplot/NOTICE.md`. No se importó código ni datos de los demás proyectos evaluados.

## Estado y licencia

Este repositorio es una **demo experimental de portfolio**, no la publicación del producto completo. Los adaptadores específicos son perfiles experimentales y no están certificados por los fabricantes.

Por ahora, el repositorio **no incluye una licencia general de reutilización para el código propio**. Que el código sea público permite inspeccionarlo, pero no concede por sí solo permiso general para copiarlo, modificarlo o distribuirlo. Los componentes de terceros conservan sus licencias independientes; en particular, la licencia MIT de uPlot se limita a ese componente.

---

<div align="center">

**Datalog Comparison** · Una demostración sobre calidad de evidencia, comparabilidad y límites de interpretación.

</div>
