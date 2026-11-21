# Referencias consultadas

Esta demo tiene una implementación acotada propia. Las referencias siguientes se consultaron para estudiar formatos, flujos de análisis e interoperabilidad. No son dependencias de ejecución y esta publicación no incluye código, muestras completas ni recursos gráficos de otros proyectos.

## Referencias de producto e ingeniería

- [ECUxPlot](https://github.com/nyetlabs/ecuxplot): gráficos y análisis de registros ECU.
- [UltraLog](https://github.com/ClassicMiniDIY/UltraLog): lectura de registros y documentación comunitaria de formatos.
- [TuneAssist](https://github.com/allantaylor8907/tuneassist): referencia de análisis revisada durante la investigación.
- [FuelTune Analyzer](https://github.com/leechardes/fueltune-analyzer): referencia para flujos de importación y análisis.

## Haltech NSP

- [UltraLog — especificación comunitaria de formatos ECU](https://github.com/ClassicMiniDIY/UltraLog/blob/main/docs/FORMAT_SPECIFICATIONS.md): describe la variante con marcador %DataLog%, encabezados tipados y reglas de conversión. La propia publicación indica que parte del contenido procede de ingeniería inversa de archivos exportados; no es documentación oficial de Haltech.
- [UltraLog — exportación NSP pública de ejemplo, log 1118 (18/07/2025)](https://github.com/ClassicMiniDIY/UltraLog/blob/main/exampleLogs/haltech/2025-07-18_0215pm_Log1118.csv): se inspeccionó manualmente para confirmar la forma del layout Channel/ID/Type/DisplayMaxMin y revisar nombres/tipos de canales. No se incorpora ni redistribuye en este repositorio.
- [OpenECU Alliance — Haltech NSP CSV Export, v2.0.0](https://oecua.org/adapters/haltech/haltech-nsp): describe una variante con metadatos y tabla de canales. La tabla `Channel,ID,Type,DisplayMaxMin` permanece fuera del parser.
- [AllDataLogs — formatos y semántica](https://www.alldatalogs.com/help/formats/): referencia secundaria sobre la semántica lambda de los valores AFR en ciertas exportaciones Haltech NSP. La implementación adopta una excepción acotada al nombre exacto `Wideband O2 Overall` en el layout de bloques, no una conversión global de todos los canales AFR.
- [NSP Dyno — parser comunitario de exportaciones NSP](https://github.com/ImMrTea/NSP_Dyno/blob/main/server/parser.js): referencia adicional para reconocer variantes con líneas Channel separadas. Sus heurísticas no se reutilizan como reglas de conversión.

## TunerStudio / MegaSquirt (texto MSL/CSV)

- [Log2Dyno — README y formatos de log](https://github.com/nshobe/Log2Dyno): referencia comunitaria con licencia MIT que enumera preámbulos MS1/MS2/MS3, CSV/TSV, filas de unidades y formatos binarios separados. Se inspeccionaron sus fixtures para comprender la estructura, pero no se copiaron sus muestras ni su código.
- [UltraLog — parser MSL y pruebas de estructura](https://github.com/ClassicMiniDIY/UltraLog/blob/main/src/parsers/msl.rs): referencia comunitaria sobre la cabecera `Time`, fila de unidad temporal, preámbulos y eventos `MARK`. Se consultó para corregir el modelo de estructura; no se copiaron código, muestras ni datos.
- [UltraLog — pruebas MSL](https://github.com/ClassicMiniDIY/UltraLog/blob/main/tests/parsers/msl_tests.rs): referencia de casos de detección y separación frente a otros formatos tabulados. Las pruebas de este repositorio se escribieron independientemente.
- [OpenECU Alliance — MegaSquirt TunerStudio Datalog, v1.1.0](https://oecua.org/adapters/megasquirt/megasquirt-tunerstudio): referencia comunitaria que documenta los cuatro metadatos, `Frame,Duration`, unidades en encabezados, el primer timestamp potencialmente anómalo y valores booleanos `ON/OFF`. No es una especificación oficial de EFI Analytics; la implementación de este repositorio preserva el reloj y deja booleanos sin mapear.
- [UltraLog — parser MegaSquirt CSV](https://github.com/ClassicMiniDIY/UltraLog/blob/main/src/parsers/megasquirt.rs): referencia comunitaria para el encabezado `Tune Datalog export of`, metadatos y columnas `Frame,Duration`. Se usó para estudiar la estructura, no se copió código ni fixture.
- [Speeduino — referencia de datalog](https://github.com/speeduino/speeduino/blob/master/reference/speeduino.ini): referencia del proyecto para los nombres de canales configurables como Time, RPM, MAP, TPS, AFR, IAT/CLT y estados de adquisición. El código upstream está bajo GPL-2.0; este proyecto usa únicamente nombres y conceptos de canal descritos públicamente, sin copiar código.

## Dynojet PowerCore / WinPEP

- [Dynojet — PowerCore Software](https://www.dynojet.com/powercore-software/): documentación del fabricante sobre WinPEP 8 Data Center, logs CSV y fuentes de terceros.
- [Dynojet — POD-300 Installation Guide](https://www.dynojet.com/installguide/POD-300): documentación del fabricante sobre selección de canales, frecuencia de muestreo configurable y exportación de logs a CSV.
- [Dynojet — formatos admitidos en Data Center](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Open_a_Run_File.htm): enumera formatos nativos y CSV como formato de entrada, pero no define un esquema CSV universal de columnas.
- [Dynojet — exportación de un run](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Export_a_Run_File.htm): documenta que el CSV puede exportarse con paso de RPM e intervalo temporal configurables.
- [Dynojet — guía WinPEP 7, carpeta Samples](https://www.dynojet.com/amfile/file/download/file/138/category/184/): documenta archivos de muestra instalados con WinPEP; no se encontró en esa guía una exportación CSV cruda que permita validar el esquema extremo a extremo.

## Estándares de medición, unidades y señales

- [ASAM MDF — Measurement Data Format](https://www.asam.net/standards/detail/mdf/): formato estandarizado para datos de medición, metadatos, conversiones y canales de adquisición. La especificación vigente consultada es MDF 4.3.0.
- [ASAM MDF — Wiki](https://www.asam.net/standards/detail/mdf/wiki/): describe la estructura de canales y la necesidad de distinguir fuente y contexto de adquisición; el nombre de canal no es una identidad física suficiente.
- [UCUM — Unified Code for Units of Measure](https://ucum.org/ucum): referencia para codificación de unidades, dimensiones y símbolos sensibles al caso.
- [NIST SP 811 — Rules and Style Conventions for Printing and Using Units](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-6-rules-and-style-conventions-printing-and-using): reglas de símbolos SI, prefijos y uso de mayúsculas/minúsculas.
- [OpenTelemetry — Metrics Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/): convención interoperable para nombres y unidades de métricas.
- [SciPy — signal.decimate](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.decimate.html): documenta que la reducción de frecuencia debe aplicar un filtro antialias y asume muestras equidistantes; referencia de diseño para `resampleTimeBasedSignals`.
- [SciPy — signal.resample_poly](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.resample_poly.html): referencia de filtrado FIR polifásico para futuros ratios racionales; la V1 de este repositorio restringe la reducción a factores enteros.
- [MathWorks — Signal Resampling](https://www.mathworks.com/help/signal/ug/signal-resampling.html): distingue remuestreo uniforme y no uniforme y describe el filtrado pasa-bajos antialias.
- [ASAM MDF Wiki — Master Channels for Synchronization](https://www.asam.net/standards/detail/mdf/wiki/): documenta dominios de sincronización basados en tiempo, distancia, ángulo o índice y la monotonicidad requerida para el canal maestro temporal.
- [SAE J1349_202511 — Engine Power Test Code](https://saemobilus.sae.org/standards/j1349_202511-engine-power-test-code-spark-ignition-compression-ignition-installed-net-power-torque-rating): estándar revisado el 19/11/2025 para mediciones repetibles de potencia y torque netos instalados. El prototipo no implementa su procedimiento ni las correcciones ambientales.

## Normalización semántica y unidades

- [ASAM MDF 4.3.0](https://www.asam.net/standards/detail/mdf/): estándar para almacenamiento de mediciones, metadatos, agrupación de señales y postprocesamiento; la versión 4.3.0 fue publicada el 23/09/2025.
- [ASAM MDF Wiki — Channel naming and source/acquisition context](https://www.asam.net/standards/detail/mdf/wiki/): explica que el mismo nombre de señal puede corresponder a distintas fuentes o modos de adquisición y que el nombre aislado no alcanza para identificar un canal.
- [UCUM — The Unified Code for Units of Measure](https://ucum.org/ucum): especificación de símbolos, prefijos y dimensiones de unidades. Distingue variantes sensibles y no sensibles al caso; la implementación adopta alias explícitos para símbolos frecuentes y evita lower-case global.
- [OpenECU Alliance — Getting Started](https://oecua.org/docs/getting-started) y [OpenECU Specification](https://oecua.org/spec): referencias de la industria/comunidad para mapear nombres específicos de fabricantes a IDs canónicos. Documentan variantes como Engine RPM, Engine Speed, RPM y Eng RPM para un mismo ID dentro de perfiles ECU. Es una especificación comunitaria, no una certificación de fabricantes.
- [OpenECU Alliance — Creating Adapters](https://oecua.org/docs/creating-adapters): recomienda registrar todas las variantes observadas, unidades, rangos declarados y versiones de adaptador; respalda un registro curado por fuente en lugar de heurísticas universales.
- [MathWorks — Multirate Signal Processing](https://www.mathworks.com/help/signal/multirate-signal-processing.html): referencia de procesamiento multirrate, interpolación, decimación y filtrado antialias. Se consulta para el diseño futuro; el importador actual no remuestrea.

## MoTeC .ld/.ldx y parsers de referencia

- [i3rs](https://github.com/Friss/i3rs): parser Rust de logs MoTeC M1 `.ld`, sidecar `.ldx`, canales multi-rate, máscaras de muestras inválidas y CLI estructurado JSON/CSV. Se revisó el código del crate `i3rs-core 0.4.0` y la API `LdFile::from_bytes`, que permite analizar bytes entregados por el navegador sin requerir una ruta de archivo. El repositorio declara también una build WebAssembly de su aplicación.
- [i3rs — especificación comunitaria del formato .ld](https://github.com/Friss/i3rs/blob/main/docs/ld-file-format.md): describe cabecera, punteros, metadatos, tipos, escalado, validez y diferentes frecuencias por canal. Está verificada por sus autores contra logs M1 concretos; no debe tratarse como especificación universal de todos los dispositivos MoTeC.
- [i3rs — pruebas de integración](https://github.com/Friss/i3rs/tree/main/crates/i3rs-core/tests): pruebas sobre fixtures del upstream. Los ficheros de datos de prueba no se incorporan aquí porque no se confirmó una licencia separada para esos datos.
- [motec-i2](https://github.com/afonso360/motec-i2): parser/writer Rust independiente de `.ld`; el README upstream deja el parsing/escritura de `.ldx` como pendiente. Se conserva solo como posible referencia cruzada, no como dependencia.

El adaptador propuesto para este repositorio permanece pendiente de validación con una muestra autorizada. Ver [plan de adaptador MoTeC](MOTEC_ADAPTER_PLAN.md).

## Criterio de uso

Las referencias documentan antecedentes y límites de evidencia. Se adopta la estrategia de IDs canónicos y listas de nombres de origen de los perfiles OpenECU como guía para futuros adaptadores específicos, manteniendo el resolver genérico independiente de fabricantes. Para la capa de procesamiento ya implementada se usan las referencias de filtrado antialias, muestreo equidistante y sincronización de ASAM como criterios de diseño; no se importó código de SciPy, MATLAB/Simulink ni documentación comercial. La curva por bandas RPM es descriptiva y no equivale a una medición certificada bajo SAE J1349. La muestra Haltech se utilizó para inspección estructural manual, no como fixture ni como validación completa del parser. No se encontró una exportación CSV cruda pública de Dynojet para validar la ruta guiada; por eso permanece basada en asignación manual y no en detección automática de columnas.


## Datos públicos y simulación

- [OBD-II Telemetry – Opel Corsa 1.2 (2012)](https://huggingface.co/datasets/PedroCuisinier2025/OBD2_panel_opel_2012): dataset publicado por PedroCuisinier2025 bajo CC BY 4.0. La ficha declara telemetría OBD-II real y contiene también columnas derivadas/estimadas; consultar [PUBLIC_DATASETS.md](PUBLIC_DATASETS.md) antes de utilizar muestras.
- [Performance characteristics of a hydrogen-CNG fuelled spark-ignition engine](https://data.mendeley.com/datasets/cb2wjcd2st/1), DOI 10.17632/cb2wjcd2st.1: datos de dinamómetro de motor descritos por sus autores y publicados bajo CC BY 4.0. Los archivos necesitan inspección de estructura, unidades y eje antes de crear fixtures.
- [Speeduino Serial Simulator](https://github.com/askrejans/speeduino-serial-sim): emulador externo de protocolo ECU con código MIT. La licencia del código no implica por sí sola una licencia para sus logs generados; el README upstream identifica además datos de circuito bajo ODbL-1.0.
- [rusEFI Online](https://rusefi.com/online/) y [MiniECUMaps](https://github.com/ClassicMiniDIY/MiniECUMaps): ejemplos públicos de logs; no se confirmó una licencia que autorice redistribuir los archivos.
- [EngineDyno](https://github.com/moffa13/EngineDyno): referencia de logs de ruta y cálculo de potencia/torque estimados. No debe confundirse con una medición directa de dinamómetro.

La publicación de una página o archivo en Internet no equivale a conceder derechos de reutilización. El catálogo de [data/sources.json](../data/sources.json) mantiene el estado de cada fuente.


## Protocolos de ensayo, repetibilidad y trazabilidad

- [SAE J1349_202511](https://saemobilus.sae.org/standards/j1349_202511-engine-power-test-code-spark-ignition-compression-ignition-installed-net-power-torque-rating): edición revisada el 19/11/2025. Su alcance busca mediciones repetibles de potencia y torque netos instalados, representativas del uso normal. El proyecto registra el estándar declarado, pero no implementa ni certifica el procedimiento J1349.
- [ISO 1585:2020](https://www.iso.org/standard/70078.html): código de ensayo de motores para evaluación de potencia neta y curvas a plena carga; la ficha ISO confirma que sigue vigente tras su revisión de 2026. El software no calcula resultados de conformidad ISO 1585.
- [ISO/IEC Guide 98-3:2008 (GUM)](https://www.iso.org/standard/50461.html): guía general para evaluar y expresar incertidumbre de medición. El CV de repetición implementado es solo una estadística de dispersión, no una evaluación completa de incertidumbre GUM.
- [ISO 10521-2:2006](https://standards.iteh.ai/catalog/standards/iso/ef7672ae-dc16-48af-9fb5-3dab0ef9c545/iso-10521-2-2006): referencia para reproducción de carga de ruta en dinamómetro de chasis; detalla precisión de instrumentos, estabilización del rodillo y presión de neumáticos. Los requisitos de su procedimiento no se convierten en tolerancias genéricas de tiradas de potencia.
- [Reglamento UE 2017/1151 / WP.29](https://unece.org/DAM/trans/doc/2017/wp29/ECE-TRANS-WP29-2017-098e.pdf): documento público con preparación del dinamómetro, estabilización de pérdidas, temperatura ambiente, presión de neumáticos y colocación/sujeción del vehículo en procedimientos reglamentarios. No es una receta universal de banco de potencia.
- [Dynojet 224x — manuales y guías oficiales](https://www.dynojet.com/downloads/dynamometer/automotive-dyno/224x/): catálogo del fabricante con guías de PowerCore, WinPEP, mantenimiento, freno Eddy Current, sensor de temperatura de neumáticos, medición atmosférica y módulo AFR. Sirve para identificar variables que deben documentarse según el hardware concreto; no se copian procedimientos propietarios.
- [Wahyudi, Putri & Ibrahim (2026), estudio de calibración ECU](https://ojs.aknacehbarat.ac.id/index.php/vocatech/article/download/359/pdf_1): ensayo de motor SI con Motec M130, 288 puntos estacionarios, 3 adquisiciones por condición, estabilización mínima de 5 minutos y comparación integrada en un punto común de 3000 RPM/carga plena. Se utiliza como caso de diseño de protocolo y fixture sintético, no como fuente de datos medidos incorporados al repositorio.
- [Bosch Booklet 8 — Measurement Uncertainty](https://assets.bosch.com/media/global/bosch_group/purchasing_and_logistics/information_for_business_partners/downloads/quality_docs/general_regulations/bosch_publications/booklet-no08-measurement-uncertainty_en.pdf): describe cadenas de medición de torque en bancos de motor y la necesidad de caracterizar incertidumbre por sistema y condiciones equivalentes.

- [Mendeley Data — Performance characteristics of a hydrogen-CNG fuelled spark-ignition engine](https://data.mendeley.com/datasets/cb2wjcd2st/1), DOI 10.17632/cb2wjcd2st.1, CC BY 4.0: dataset de dinamómetro de motor SI monocilíndrico con cuatro cargas y archivos descritos como datos crudos de adquisición. Es una fuente candidata para validar importación de banco; antes de incorporarla como fixture deben descargarse e inspeccionarse los archivos y conservarse atribución y hash. No se han copiado archivos de esta fuente a este repositorio.
- [Suhel et al. (2021) — Dataset for influence of CNG and HCNG on engine performance and emission parameters at diverse injection pressure](https://pmc.ncbi.nlm.nih.gov/articles/PMC7896152/), DOI 10.17632/987rs78d8j.2: caso de motor diésel dual-fuel a 1500 RPM y cargas 25/50/75/100%, con 200/220/240 bar de presión de inyección. La publicación describe repeticiones experimentales 2 y 3 en el archivo asociado. Útil para estudiar ensayos estacionarios de motor, pero no debe mezclarse con registros ECU ni con dinamómetro de chasis.

## Motor eléctrico / adquisición de sensores

- [OpenBLDCData — sensor test-bench dataset](https://github.com/Atikas/OpenBLDCData): dataset medido de banco BLDC con acelerómetros ADXL355, monitor INA226, señal de pulsos del tacómetro y metadatos temporales. La licencia CC BY 4.0 y el esquema están declarados en su README. El repositorio incluye un extracto de 64 filas, atribuido y sin cambios numéricos, únicamente para pruebas de CSV y calidad temporal; no se usa para curvas ECU o potencia de motor térmico.
