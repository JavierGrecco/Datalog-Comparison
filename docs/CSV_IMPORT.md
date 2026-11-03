# Contrato de importación CSV y perfiles experimentales

## Alcance

La demo permite inspeccionar CSV localmente. Los archivos permanecen en memoria del navegador, no se envían a servicios externos y se descartan al limpiar la vista o recargar la página. Los registros importados no se incorporan a la matriz de comparación.

Hay tres rutas de importación:

1. CSV genérico: parser neutral con asignación manual de columnas y unidades.
2. Haltech NSP CSV: perfil experimental para la variante cuyo primer registro no vacío es %DataLog%, con encabezados tipados Canal(Tipo:Unidad).
3. Dynojet PowerCore / WinPEP CSV: perfil guiado para una exportación configurable. No se presupone un esquema fijo de columnas.

## Flujo

1. Seleccionar automático, genérico, Haltech NSP o Dynojet PowerCore/WinPEP.
2. En la ruta genérica, declarar el origen del registro.
3. Confirmar el separador de columnas y decimal cuando la ruta requiere mapeo.
4. Asignar las columnas a los canales compatibles.
5. Declarar las unidades de los canales opcionales.
6. En dinamómetro, declarar la base de torque/potencia: rueda, rodillo, cubo, motor o desconocida.
7. Inspeccionar cobertura, alertas y una muestra de filas.

Tiempo relativo en segundos y RPM son obligatorios en la ruta genérica. No se convierten unidades, relojes, presión absoluta/relativa ni bases de medición implícitamente.

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

El adaptador reconoce únicamente la variante descrita por una especificación comunitaria de interoperabilidad:

- Primer registro no vacío: %DataLog%.
- Encabezado con estructura Canal(Tipo:Unidad).
- Primera columna: Time(Time_ms:ms).
- Marca temporal: HH:MM:SS.mmm.
- Delimitador: coma.
- Decimal: punto.

No se afirma compatibilidad con todas las versiones, modelos, tipos de canal ni archivos NSP. Otra estructura debe rechazarse o abrirse y exportarse nuevamente desde el software correspondiente a la variante admitida.

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
| AFR | raw / 1000 | AFR. |
| Raw | Directa | Solo torque Nm y potencia kW si nombre y unidad coinciden. |

Los canales sin semántica implementada quedan enumerados como no soportados y no se agregan al registro normalizado. Se exige un canal RPM válido. No se infieren canales por similitud de nombres ni se interpretan automáticamente tipos no incluidos en la tabla.

La especificación consultada declara que parte de su detalle procede de análisis e ingeniería inversa de archivos exportados. Es una referencia comunitaria de interoperabilidad, no documentación oficial ni garantía de compatibilidad. Antes de interpretar un archivo, contrastar sus valores con la exportación original y el software NSP.

## Perfil Dynojet PowerCore / WinPEP (guiado)

La documentación del fabricante confirma que WinPEP 8 Data Center puede trabajar con logs CSV y fuentes de terceros. La guía del POD-300 describe selección de canales registrados, frecuencia de muestreo configurable y exportación de logs a CSV.

No se encontró un contrato público de columnas fijo que justifique un parser automático universal. Por eso esta ruta utiliza el parser genérico, exige mapeo manual y registra un identificador de perfil propio. No lee archivos nativos de WinPEP ni Power Vision.

Si se asigna torque o potencia, la base de medición se debe declarar como rueda, rodillo, cubo, motor o desconocida. No se convierte entre bases ni unidades. La opción desconocida permanece como advertencia.

## Canales canónicos disponibles

| Canal | Unidad / condición |
| --- | --- |
| time_s | s; obligatorio |
| rpm | RPM; obligatorio |
| torque_nm, power_kw | unidad declarada; base obligatoria si origen dinamómetro |
| speed_kmh | unidad declarada |
| boost_target, boost_actual, map_abs_kpa, fuel_pressure_kpa | unidad declarada en CSV genérico; normalizada por tipo en Haltech admitido |
| throttle_pct, iat_c, coolant_temp_c, ignition_advance_deg, battery_v | unidad declarada en CSV genérico; normalizada por tipo en Haltech admitido |
| lambda, afr | unidad declarada |

Una clave canónica no certifica que sensores, ubicación de medición o método sean físicamente equivalentes.

## Salida y limitaciones

Los adaptadores crean un registro exploratorio con muestras en orden de origen, valores numéricos, faltantes, unidades, versión del parser, metadatos y advertencias. El estado sin alertas estructurales no autentica origen, sensor, unidades, sincronización, método ni condiciones físicas.

Fuera de alcance:

- Comparación entre dos archivos importados.
- Importación de archivos nativos o binarios propietarios.
- Corrección atmosférica, interpolación, sincronización y conversión de unidades/base.
- Adaptadores FuelTech, ECUMaster, MoTeC, Link, AiM o AEM sin contrato y fixtures autorizados.
- Persistencia, backend, telemetría o envío de archivos.

## Fixtures y pruebas

Todos los fixtures del repositorio son sintéticos. No representan exportaciones reales de un vehículo ni archivos descargados de software comercial. Las pruebas cubren contratos, conversiones implementadas y casos negativos; no certifican mediciones físicas.
