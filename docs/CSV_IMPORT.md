# Contrato de importación CSV y perfiles experimentales

## Alcance

La demo permite inspeccionar CSV localmente. Los archivos permanecen en memoria del navegador, no se envían a servicios externos y se descartan al limpiar la vista o recargar la página. Los registros importados no se incorporan a la matriz de comparación.

Hay tres rutas de importación:

1. CSV genérico: parser neutral con asignación manual de columnas y unidades.
2. Haltech NSP CSV: perfil experimental para dos layouts identificados por %DataLog%: encabezados tipados Canal(Tipo:Unidad) y bloques Channel / ID / Type / DisplayMaxMin.
3. Dynojet PowerCore / WinPEP CSV: perfil guiado para una exportación configurable. No se presupone un esquema fijo de columnas.

## Flujo

1. Seleccionar automático, genérico, Haltech NSP o Dynojet PowerCore/WinPEP.
2. En la ruta genérica, declarar el origen del registro.
3. Confirmar el separador de columnas y decimal cuando la ruta requiere mapeo.
4. Asignar las columnas a los canales compatibles.
5. Declarar las unidades de los canales opcionales.
6. En dinamómetro, declarar la base de torque/potencia: rueda, rodillo, cubo, motor o desconocida.
7. Inspeccionar cobertura, alertas y una muestra de filas. La tabla muestra hasta ocho muestras reales distribuidas por el orden de captura, no solo las primeras filas.

La vista previa selecciona hasta ocho muestras originales espaciadas a lo largo del array de captura e incluye los extremos. Es una reducción exclusivamente visual: no modifica el registro, no interpola, no elimina datos ni cambia sus índices internos. El importador admite al menos un eje presente: tiempo relativo o RPM. Las curvas de torque/potencia de dinamómetro requieren RPM y base de medición declarada. No se inventan ejes ausentes ni se rellenan muestras. El resolver local propone mapeos por alias exactos y contexto; los errores de tipeo, inferencias por unidad y perfiles de rango permanecen sujetos a confirmación. Las unidades se normalizan mediante reglas explícitas y versionadas; en CSV genérico y Dynojet se conserva encabezado, unidad y celda textual de origen de los canales mapeados, además de la conversión aplicada. Los adaptadores Haltech que convierten datos antes del mapeo conservan su propia procedencia en metadatos del adaptador y no etiquetan el valor normalizado como celda cruda.

## Parser CSV genérico

- Separadores: coma, punto y coma y tabulación.
- Comillas dobles, comillas escapadas, campos multilínea, BOM y CRLF/LF.
- Encabezados obligatorios, no vacíos y únicos después de normalizar espacios, Unicode y mayúsculas.
- Filas completamente vacías ignoradas y contabilizadas.
- Filas cortas conservadas como faltantes con advertencia; filas con celdas extra rechazadas.
- Límites: 10 MB, 100.000 filas, 128 columnas y 16.384 caracteres por celda.
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

## Perfil Dynojet PowerCore / WinPEP (guiado)

La documentación del fabricante confirma que WinPEP 8 Data Center puede trabajar con logs CSV y fuentes de terceros. La guía del POD-300 describe selección de canales registrados, frecuencia de muestreo configurable y exportación de logs a CSV.

No se encontró un contrato público de columnas fijo que justifique un parser automático universal. Por eso esta ruta utiliza el parser genérico y el resolver común para proponer alias, unidades y posibles variantes; la asignación final sigue siendo explícita. Registra un identificador de perfil propio y no lee archivos nativos de WinPEP ni Power Vision.

Si se asigna torque o potencia, la base de medición se debe declarar como rueda, rodillo, cubo, motor o desconocida. La asignación por nombre se contrasta con calificadores físicos explícitos como Wheel, Roller, Hub o Engine. Las unidades reconocidas se convierten a las unidades canónicas del modelo mediante reglas versionadas (`datalog-units/2`). La unidad original, el factor, el offset y la unidad de salida se conservan en los metadatos. Las bases físicas no se convierten. El comparador excluye torque y potencia cuando uno de los ensayos es ECU/logger y el otro dinamómetro, cuando la base difiere (rueda, rodillo, cubo o motor) o cuando una base sigue desconocida. La opción desconocida permanece como advertencia.

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

El registro `datalog-units/2` admite conversiones explícitas por dimensión y unidad canónica. Los símbolos se comparan de forma sensible al caso cuando la norma o el prefijo lo requiere; no se aplica lowercase global:

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

Las unidades no listadas o dimensionalmente incompatibles se rechazan para el canal elegido. Pa y pA, mW y MW, Nm y nm se distinguen explícitamente. La unidad original, conversión y encabezado se conservan en importMetadata; los CSV genéricos/Dynojet mantienen también la celda textual de origen junto a cada muestra. La normalización no convierte la base física de torque/potencia (rueda, rodillo, cubo o motor), ni convierte AFR a lambda.

Dynojet Data Center permite configurar por separado el paso de exportación por RPM y el intervalo temporal. El importador conserva el orden y muestra intervalo mediano, frecuencia observada por canal y jitter robusto cuando hay eje temporal. Son métricas calculadas sobre muestras adyacentes válidas; no prueban la frecuencia configurada ni la existencia de muestras perdidas. Sin eje temporal no se afirma frecuencia, duración ni sincronización.

## Salida y limitaciones

El mapeo genérico crea un registro exploratorio con muestras en orden de origen, valores canónicos, celdas textuales originales de los canales mapeados, faltantes, unidades, versión del parser, asignaciones, metadatos y advertencias. Los adaptadores específicos preservan su procedencia según el punto de conversión de cada perfil y no declaran valores transformados como celdas originales. Las columnas no mapeadas quedan enumeradas en importMetadata.unmappedHeaders, no se incorporan al modelo semántico. El estado sin alertas estructurales no autentica origen, sensor, unidades, sincronización, método ni condiciones físicas.

Fuera de alcance:

- Comparación entre dos archivos importados.
- Importación de archivos nativos o binarios propietarios.
- Corrección atmosférica, interpolación, sincronización y conversión de unidades/base.
- Adaptadores FuelTech, ECUMaster, MoTeC, Link, AiM o AEM sin contrato y fixtures autorizados.
- Persistencia, backend, telemetría o envío de archivos.

## Fixtures y pruebas

Todos los fixtures del repositorio son sintéticos. No representan exportaciones reales de un vehículo ni archivos descargados de software comercial. Una exportación Haltech pública fue examinada manualmente para confirmar la estructura Channel/ID/Type, pero no se distribuye ni se incorpora a CI. No se encontró una exportación CSV cruda pública de Dynojet para validar de extremo a extremo el perfil guiado; el fabricante documenta que la exportación permite configurar por separado paso de RPM e intervalo temporal. Las pruebas automatizadas cubren contratos, conversiones implementadas y casos negativos; no certifican mediciones físicas.
