# Contrato de importación CSV y perfiles experimentales

## Alcance

La demo permite inspeccionar CSV localmente y asignar dos importaciones explícitamente como referencia y candidata en un expediente separado de los escenarios sintéticos. Calcula SHA-256 sobre los bytes originales para reconocer archivos idénticos y evitar que uno ocupe ambos roles. Los registros y el expediente permanecen en memoria del navegador, no se envían a servicios externos y se descartan al recargar la página o vaciar el expediente. La comparación resume distribuciones independientes y no sincroniza marcas de tiempo ni puntos RPM.

Hay cuatro rutas de importación:

1. CSV genérico: parser neutral con asignación manual de columnas y unidades.
2. Haltech NSP CSV: perfil experimental para dos layouts identificados por %DataLog%: encabezados tipados Canal(Tipo:Unidad) y bloques Channel / ID / Type / DisplayMaxMin.
3. Dynojet PowerCore / WinPEP CSV: perfil guiado para una exportación configurable. No se presupone un esquema fijo de columnas.
4. TunerStudio / MegaSquirt CSV y MSL de texto: perfil experimental para preámbulos MS1/MS2/MS3, tabulación o coma y fila opcional de unidades. Los binarios .mlg y .ms3 no se importan.

## Flujo

1. Seleccionar automático, genérico, Haltech NSP, Dynojet PowerCore/WinPEP o TunerStudio/MegaSquirt.
2. En la ruta genérica, declarar el origen del registro.
3. Confirmar el separador de columnas y decimal cuando la ruta requiere mapeo.
4. Asignar las columnas a los canales compatibles.
5. Declarar las unidades de los canales opcionales.
6. En dinamómetro, declarar la base de torque/potencia: rueda, rodillo, cubo, motor o desconocida.
7. Inspeccionar cobertura, alertas y una muestra de filas. La tabla muestra hasta ocho muestras reales distribuidas por el orden de captura, no solo las primeras filas.

La vista previa selecciona hasta ocho muestras originales espaciadas a lo largo del array de captura e incluye los extremos. Es una reducción exclusivamente visual: no modifica el registro, no interpola, no elimina datos ni cambia sus índices internos. El importador admite al menos un eje presente: tiempo relativo o RPM. Las curvas de torque/potencia de dinamómetro requieren RPM y base de medición declarada. No se inventan ejes ausentes ni se rellenan muestras. El resolver local propone mapeos por alias exactos y contexto; los errores de tipeo, inferencias por unidad y perfiles de rango permanecen sujetos a confirmación. Las unidades se normalizan mediante reglas explícitas y versionadas; en CSV genérico y Dynojet se conserva encabezado, unidad y celda textual de origen de los canales mapeados, además de la conversión aplicada. Los adaptadores Haltech que convierten datos antes del mapeo conservan su propia procedencia en metadatos del adaptador y no etiquetan el valor normalizado como celda cruda.

## Parser CSV genérico

- Separadores: coma, punto y coma y tabulación.
- Codificación: UTF-8 con o sin BOM y UTF-16 little-endian/big-endian cuando incluyen BOM. Las secuencias inválidas se rechazan; las codificaciones locales/ANSI no se adivinan.\n- Comillas dobles, comillas escapadas, campos multilínea y CRLF/LF.
- Encabezados obligatorios, no vacíos y únicos después de normalizar espacios, Unicode y mayúsculas.
- Filas completamente vacías ignoradas y contabilizadas.
- Se conserva el número de línea física del encabezado y de cada muestra, incluso con CRLF, filas vacías y celdas entrecomilladas multilínea.
- Los errores de estructura o de valores numéricos informan la línea real del archivo, no la posición compactada de la muestra.
- Las filas cortas conservan sus campos finales como faltantes y exponen las líneas que requieren revisión.
- Filas cortas conservadas como faltantes con advertencia; filas con celdas extra rechazadas.
- Límites: 10 MB de texto, 100.000 filas, 128 columnas, 16.384 caracteres por celda y 2.000.000 de celdas en todo el archivo (incluidos encabezados, filas vacías y celdas sin valor). El límite total evita que una tabla muy ancha consuma memoria desproporcionada.
- Valores vacíos, NA, N/A, null, NaN, —, -- y - conservados como faltantes.
- Los valores numéricos ambiguos producen error con fila y columna.
- No se ordenan filas, interpolan muestras ni imputan valores.

## Perfil Haltech NSP CSV (experimental)

### Identificación y alcance

El adaptador reconoce dos layouts observados en exportaciones públicas y documentación comunitaria. Ambos siguen siendo experimentales y no constituyen una certificación de Haltech.

- Primer registro no vacío: %DataLog%.
- Encabezado con estructura Canal(Tipo:Unidad).
- Primera columna: Time(Time_ms:ms).
- Marca temporal: HH:MM:SS.mmm.
- Delimitador: coma.
- Decimal: punto.

El layout de bloques procesa metadatos de archivo y definiciones `Channel : nombre`, `ID : ...`, `Type : ...`, `DisplayMaxMin : ...`, seguidos por una fila por marca temporal. Antes de interpretar las muestras, valida que cada fila tenga exactamente una columna de tiempo más una columna por bloque Channel. Preserva IDs, tipos, límites de display y metadatos de origen. La variante de tabla `Channel,ID,Type,DisplayMaxMin` se sigue rechazando: no se fuerza al parser de bloques. OpenECU Alliance describe ese layout tabular distinto.

Se inspeccionó manualmente una exportación NSP pública incluida en UltraLog (log 1118, 18/07/2025): 114 definiciones de canal y 879 muestras. El archivo original no se copia al repositorio ni se usa como fixture de CI; los tests mantienen datos sintéticos y reproducibles. Esta inspección confirma la forma del layout, no la compatibilidad universal ni la precisión de cada canal.

### Conversiones implementadas

Las conversiones tipadas siguen la tabla publicada por la especificación comunitaria de UltraLog. No son una certificación de Haltech ni una validación del hardware.

| Tipo NSP | Conversión | Uso en el perfil |
| --- | --- | --- |
| EngineSpeed | Directa | RPM, con tipo EngineSpeed y unidad RPM. |
| AbsPressure | raw / 10 | MAP/presión absoluta de colector reconocida por nombre. |
| Pressure | raw / 10 − 101,3 | Boost y presión de combustible reconocidos por nombre. |
| Percentage | raw / 10 | TPS/acelerador. |
| Angle | raw / 10 | Avance de encendido. |
| Temperature | raw / 10 − 273,15 | IAT y refrigerante. |
| BatteryVoltage | raw / 1000 | Tensión de batería. |
| Speed | raw / 10 | Velocidad del vehículo. |
| AFR | Depende del nombre exacto | En el layout de bloques, solo `Wideband O2 Overall` se normaliza a lambda (raw / 1000); consignas y otros canales AFR se excluyen. En el layout tipado se mantiene excluido. |
| Raw | Directa | Solo torque Nm y potencia kW si nombre y unidad coinciden. |

Los canales sin semántica implementada quedan enumerados como no soportados y no se agregan al registro normalizado. En el layout de bloques se reconoce únicamente el nombre exacto `Wideband O2 Overall` de tipo AFR como lambda medida; `Target Lambda` y los demás canales AFR quedan fuera. Esta regla estrecha se basa en la exportación pública examinada y en referencias secundarias, no en una regla universal para todas las versiones. Se exige RPM válido. No se infieren canales por similitud parcial de nombres: por ejemplo, `Manifold Pressure Derivative` no se interpreta como MAP. Los canales Pressure usan una referencia fija de 101,3 kPa para pasar a presión relativa; no se sustituye por el canal barométrico observado. Los valores numéricos iguales o menores a -2.000.000.000 se preservan como faltantes por la familia de sentinels observada en la exportación pública.

La especificación consultada declara que parte de su detalle procede de análisis e ingeniería inversa de archivos exportados. Es una referencia comunitaria de interoperabilidad, no documentación oficial ni garantía de compatibilidad. Antes de interpretar un archivo, contrastar sus valores con la exportación original y el software NSP.

## Perfil TunerStudio / MegaSquirt MSL y CSV de texto (experimental)

El adaptador `src/adapters/tunerstudio-msl.mjs` contempla el MSL tabulado histórico, el export CSV clásico de MegaSquirt/TunerStudio con cuatro líneas de metadatos y tablas CSV simples cuando se selecciona el perfil manualmente. Para el MSL, la detección automática exige una primera columna `Time`, una fila siguiente cuya primera celda declare una unidad temporal (`sec`, `s`, `ms`, etc.) y al menos una muestra numérica. Se admiten hasta ocho líneas de preámbulo, por ejemplo una identificación de firmware y una fecha de captura.

**El eje temporal es `Time`.** `SecL` se conserva como una columna independiente; no se usa como sustituto del eje. El adaptador reconoce filas `MARK`, las excluye de las muestras numéricas y conserva su texto y número de línea en los metadatos. Las líneas físicas originales de cada muestra también se conservan aunque se omitan eventos.

Los campos vacíos o no numéricos no se rellenan con el último valor. Se preservan como faltantes para no ocultar una desconexión, pérdida de sensor o dato no disponible. Tampoco se corrigen automáticamente saltos hacia atrás del reloj ni concatenaciones de sesiones: quedan disponibles para el diagnóstico temporal y requieren revisión.

Los encabezados frecuentes se normalizan conservadoramente (`RPM`, `TPS`, `Lambda 1`, `MAT`, `CLT`, `Spark Advance`, `VSS1`). `MAP` y `Boost` siguen requiriendo confirmación de referencia y rol; no se asignan por descarte. Las unidades se toman de la fila fuente, no se adivinan por la magnitud. Los archivos binarios `.mlg` y los registros nativos `.ms3` no están soportados.

### Export CSV clásico de MegaSquirt / TunerStudio

La variante clásica comienza con `Tune Datalog export of`, conserva metadatos como `Tune file`, `Total Frames` y `Duration`, y presenta una tabla que comienza con `Frame,Duration`. El adaptador detecta esa firma de forma automática y preserva las líneas de metadatos y la fila de encabezados originales.

- `Duration` se interpreta como segundos y se ofrece como eje `Elapsed Time (s)`.
- `RPM` se ofrece como `Engine RPM (rpm)`.
- `Frame` queda como columna auxiliar sin incorporarse al modelo normalizado.
- Las unidades entre paréntesis, por ejemplo `MAP(mBar)` o `TPS(%)`, se conservan y se contrastan con el registro de unidades.
- La cantidad declarada en `Total Frames` se compara con las filas reales. Una diferencia produce advertencia; no se rellenan ni descartan filas.
- Si el primer valor de `Duration` parece corresponder a tiempo de ECU anterior al inicio del log, el adaptador no lo corrige. El eje original se conserva y la calidad temporal puede señalar el retroceso.

El fixture `tests/fixtures/tunerstudio-megasquirt-export-synthetic.csv` es sintético y propio. No contiene capturas ni valores de terceros.


El fixture `tests/fixtures/tunerstudio-ms3-synthetic.msl` es sintético y propio. Prueba preámbulo opcional, fila de unidades, columnas `Time`/ `SecL`, eventos `MARK`, líneas originales y conversión de unidades. No es una captura ECU ni una prueba de compatibilidad oficial con todas las versiones.

## Perfil Dynojet PowerCore / WinPEP (guiado)

La documentación del fabricante confirma que WinPEP 8 Data Center puede trabajar con logs CSV y fuentes de terceros. La guía del POD-300 describe selección de canales registrados, frecuencia de muestreo configurable y exportación de logs a CSV.

No se encontró un contrato público de columnas fijo que justifique un parser automático universal. Por eso esta ruta utiliza el parser genérico y el resolver común para proponer alias, unidades y posibles variantes; la asignación final sigue siendo explícita. Registra un identificador de perfil propio y no lee archivos nativos de WinPEP ni Power Vision.

Si se asigna torque o potencia, la base de medición se debe declarar como rueda, rodillo, cubo, motor o desconocida. La asignación por nombre se contrasta con calificadores físicos explícitos como Wheel, Roller, Hub o Engine. Las unidades reconocidas se convierten a las unidades canónicas del modelo mediante reglas versionadas (`datalog-units/3`). La unidad original, el factor, el offset y la unidad de salida se conservan en los metadatos. Las bases físicas no se convierten. El comparador excluye torque y potencia cuando uno de los ensayos es ECU/logger y el otro dinamómetro, cuando la base difiere (rueda, rodillo, cubo o motor) o cuando una base sigue desconocida. La opción desconocida permanece como advertencia.

## Canales canónicos disponibles

| Canal | Unidad / condición |
| --- | --- |
| time_s | s; eje temporal opcional |
| rpm | RPM; eje de régimen opcional |
| distance_km | km; canal opcional |
| torque_nm, power_kw | unidad declarada; base obligatoria si origen dinamómetro |
| speed_kmh | unidad declarada |
| boost_target, boost_actual, map_abs_kpa, fuel_pressure_kpa | unidad declarada en CSV genérico; normalizada por tipo en Haltech admitido |
| throttle_pct, iat_c, coolant_temp_c, ignition_advance_deg, battery_v | unidad declarada en CSV genérico; normalizada por tipo en Haltech admitido |
| lambda, afr | unidad declarada |

Una clave canónica no certifica que sensores, ubicación de medición o método sean físicamente equivalentes.

## Normalización de unidades

El registro `datalog-units/3` admite conversiones explícitas por dimensión y unidad canónica. Los símbolos se comparan de forma sensible al caso cuando la norma o el prefijo lo requiere; no se aplica lowercase global:

| Canal | Unidades de origen admitidas | Unidad canónica |
| --- | --- | --- |
| Torque | Nm, ft-lb / lb-ft | Nm |
| Potencia | kW, W, hp / bhp, PS / CV | kW |
| Velocidad | km/h / kph, mph, m/s | km/h |
| Presión | kPa, bar, psi, mbar, Pa | kPa |
| Temperatura | °C, °F, K | °C |
| Tensión de batería | V, mV | V |
| Acelerador | %, percent | % |
| Avance de encendido | grados, radianes | grados |

`mBar` se admite como variante exacta de encabezados de algunos exports MegaSquirt y se normaliza como `mbar` (factor 0,1 a kPa); no se habilita una conversión genérica sin distinguir mayúsculas.\n\nLas unidades no listadas o dimensionalmente incompatibles se rechazan para el canal elegido. Pa y pA, mW y MW, Nm y nm se distinguen explícitamente. La unidad original, conversión y encabezado se conservan en importMetadata; los CSV genéricos/Dynojet mantienen también la celda textual de origen junto a cada muestra. La normalización no convierte la base física de torque/potencia (rueda, rodillo, cubo o motor), ni convierte AFR a lambda.

Dynojet Data Center permite configurar por separado el paso de exportación por RPM y el intervalo temporal. El importador conserva el orden y muestra intervalo mediano, frecuencia observada por canal y jitter robusto cuando hay eje temporal. Son métricas calculadas sobre muestras adyacentes válidas; no prueban la frecuencia configurada ni la existencia de muestras perdidas. Sin eje temporal no se afirma frecuencia, duración ni sincronización.

## Salida y limitaciones

El mapeo genérico crea un registro exploratorio con muestras en orden de origen, valores canónicos, celdas textuales originales de los canales mapeados, faltantes, unidades, versión del parser, codificación detectada cuando se leyó desde bytes, asignaciones, metadatos y advertencias. Los adaptadores específicos preservan su procedencia según el punto de conversión de cada perfil y no declaran valores transformados como celdas originales. Las columnas no mapeadas quedan enumeradas en importMetadata.unmappedHeaders, no se incorporan al modelo semántico. El estado sin alertas estructurales no autentica origen, sensor, unidades, sincronización, método ni condiciones físicas.

## Informe portable de comparación importada

Después de ejecutar la comparación de referencia y candidata, la interfaz permite descargar un JSON versionado (`datalog-imported-run-comparison/1`). Incluye estado, método, umbral de cobertura, identificadores y nombres de archivo, huellas SHA-256, dominio y base declarados, unidades, perfil resumido de importación, conversiones explícitas, estadísticas por canal, exclusiones, puertas de revisión, advertencias y próximos pasos.

El informe usa una lista permitida de metadatos. No exporta muestras, celdas originales, filas CSV, texto del archivo, rutas locales ni metadatos completos del adaptador. Los nombres de archivo y encabezados de canal sí se conservan como etiquetas para interpretar el resumen. La huella SHA-256 permite reconocer bytes idénticos, pero no autentica procedencia, sensores ni mediciones. La descarga se genera en el navegador y no envía los archivos a un servidor. El mismo laboratorio permite abrir después un informe JSON guardado, validarlo y volver a consultar sus estadísticas, exclusiones y controles sin los CSV originales. Esta vista no recupera muestras ni reconstruye curvas; permanece separada del expediente de importación activo. El contrato exacto y un ejemplo reproducible están publicados en [IMPORTED_COMPARISON_REPORT.md](IMPORTED_COMPARISON_REPORT.md), [el JSON Schema](../schemas/imported-run-comparison-1.schema.json) y [el ejemplo JSON](../examples/imported-run-comparison-1.example.json). Antes de compartir un informe, revisá el nombre del archivo y los encabezados de columna: son etiquetas de origen y pueden contener información que no quieras divulgar.

Fuera de alcance:

- Comparación sincronizada o punto a punto de dos archivos importados. La versión actual resume medianas, medias y rangos de cada registro por separado, solo en canales con unidades y bases físicas compatibles.
- Importación de archivos nativos o binarios propietarios.
- Sincronización de distintos relojes o grupos de adquisición, reconstrucción de una base temporal irregular e interpolación de señales continuas.
- Corrección atmosférica SAE, conversión de base física de torque/potencia o certificación del ensayo.
- Adaptadores FuelTech, ECUMaster, MoTeC, Link, AiM o AEM sin contrato y fixtures autorizados.
- Persistencia, backend, telemetría o envío de archivos.

## Fixtures y pruebas

Todos los fixtures del repositorio son sintéticos. No representan exportaciones reales de un vehículo ni archivos descargados de software comercial. Una exportación Haltech pública fue examinada manualmente para confirmar la estructura Channel/ID/Type, pero no se distribuye ni se incorpora a CI. No se encontró una exportación CSV cruda pública de Dynojet para validar de extremo a extremo el perfil guiado; el fabricante documenta que la exportación permite configurar por separado paso de RPM e intervalo temporal. Las pruebas automatizadas cubren contratos, conversiones implementadas y casos negativos; no certifican mediciones físicas.


## Expedientes persistentes y archivo de originales

El expediente de comparación en memoria puede guardarse en un expediente local de vehículo. Se almacenan por separado:

- metadatos del expediente;
- informes JSON validados;
- CSV originales, únicamente cuando se marca explícitamente la opción de archivado;
- resultados derivados de procesamiento temporal o curvas por barrido.

Los CSV se conservan como blobs en una tienda IndexedDB separada del informe y se verifica de nuevo su SHA-256 frente a la huella del informe antes de archivarlos. El archivado está limitado a 100 MiB por archivo y 150 MiB por pareja.

Los respaldos de expediente incluyen metadatos, informes y artefactos derivados, pero excluyen los bytes originales. Estos se pueden descargar individualmente desde el historial antes de mover o borrar un perfil del navegador. Un respaldo restaurado crea siempre un expediente nuevo, valida sus informes y no sobrescribe expedientes existentes.
