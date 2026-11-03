# Contrato de importación CSV (beta)

## Alcance de esta etapa

La demo admite inspeccionar localmente un CSV genérico con asignación manual de columnas. Esta etapa valida lectura, estructura, campos numéricos y cobertura. **No interpreta formatos propietarios, no autentica el origen del archivo y no habilita comparación entre registros.**

Los archivos permanecen en memoria del navegador durante la sesión. No se envían a un servidor, no se guardan en almacenamiento persistente y se descartan al limpiar la vista o recargar la página.

## Flujo de uso

1. Seleccionar un archivo con extensión `.csv` de hasta 10 MB.
2. Declarar explícitamente el origen: ECU/logger, dinamómetro o sin clasificar.
3. Indicar el separador decimal (punto o coma).
4. Asignar las columnas del archivo a los canales del contrato.
5. Confirmar unidades para cada canal opcional.
6. Inspeccionar la cobertura, las alertas y una muestra de las primeras filas.

Tiempo relativo en segundos y RPM son obligatorios. No hay conversión de milisegundos a segundos, de unidades imperiales a métricas ni de valores de presión absoluta/relativa. Si el archivo utiliza otra convención, debe documentarse y normalizarse fuera de esta etapa hasta que exista una transformación explícita, versionada y probada.

## Contrato de lectura

- Separadores soportados: coma, punto y coma y tabulación. El modo automático se limita a detectar el separador de la primera fila lógica.
- Comillas dobles, comillas escapadas, campos multilínea, BOM y finales de línea CRLF/LF.
- Encabezados obligatorios, no vacíos y únicos después de normalizar espacios, Unicode y mayúsculas.
- Filas completamente vacías se ignoran y se contabilizan en `skippedEmptyRows`.
- Filas con menos celdas se completan con faltantes y generan una advertencia.
- Filas con más celdas que encabezados se rechazan; no se desplazan señales en silencio.
- Límites actuales: 10 MB de texto, 100.000 filas, 128 columnas y 16.384 caracteres por celda.
- Los valores vacíos, `NA`, `N/A`, `null`, `NaN`, `—`, `--` y `-` se conservan como faltantes.
- Un valor no vacío que no respete el separador decimal seleccionado produce un error con fila y columna. No se interpreta ni corrige silenciosamente.
- No se ordenan filas, interpolan valores ni imputan faltantes.

## Canales disponibles

| Canal | Unidad del contrato | Condición |
| --- | --- | --- |
| `time_s` | s | Obligatorio; tiempo relativo en segundos. |
| `rpm` | RPM | Obligatorio. |
| `torque_nm` | Declarada por la persona | Opcional. |
| `power_kw` | Declarada por la persona | Opcional. |
| `speed_kmh` | Declarada por la persona | Opcional. |
| `boost_target` | Declarada por la persona | Opcional. |
| `boost_actual` | Declarada por la persona | Opcional. |
| `iat_c` | Declarada por la persona | Opcional. |
| `lambda` | Declarada por la persona | Opcional. |
| `afr` | Declarada por la persona | Opcional. |

Una columna de origen no puede asignarse a más de un canal. No se deducen unidades desde el nombre del encabezado.

## Salida

El adaptador crea un registro exploratorio normalizado con:

- muestras en el mismo orden de origen;
- valores numéricos y `null` para celdas ausentes;
- dominio y unidades declarados por la persona;
- metadatos del parser genérico;
- manifiesto exploratorio sin hash de archivo;
- alertas calculadas por el perfil de calidad existente.

El estado `no_obvious_issues` significa solamente que las comprobaciones estructurales disponibles no encontraron alertas. No autentica la fuente, la identidad del sensor, las unidades, la sincronización ni las condiciones físicas del ensayo.

## Fixtures y pruebas

Los archivos de `tests/fixtures/` son **sintéticos**. Cubren un CSV separado por punto y coma con coma decimal y un CSV separado por comas con punto decimal. No representan exportaciones de ECU o bancos comerciales.

Las pruebas cubren comillas, BOM, CRLF, filas multilinea, duplicados, columnas inconsistentes, límites de tamaño, asignación de canales, unidades, faltantes y errores numéricos.

## Fuera de alcance

- Perfiles de exportación de FuelTech, MoTeC, ECUMaster, HP Tuners, VCDS u otros formatos propietarios.
- Selección automática de canales por similitud de nombres.
- Conversión de unidades, corrección atmosférica o interpretación de magnitudes.
- Cálculo, interpolación o sincronización de señales.
- Comparación entre dos archivos importados.
- Persistencia, backend, telemetría o envío de archivos.
