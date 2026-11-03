# Reconocimiento semántico de canales

## Objetivo

Interpretar de forma reproducible encabezados y unidades de CSV de ECU/logger y dinamómetro, aun cuando los fabricantes utilicen nombres distintos, abreviaturas o errores menores de tipeo. La detección se ejecuta localmente mediante reglas versionadas. No necesita IA externa ni transmite archivos.

El objetivo no es maximizar la cantidad de columnas asignadas. Es maximizar las asignaciones correctas y dejar explícitamente sin resolver aquello que no tenga evidencia suficiente.

## Principios de seguridad semántica

1. **El nombre identifica el concepto, no solo la forma de la palabra.** Se conservan calificadores como engine, wheel, roller, actual, target, absolute, measured o derived.
2. **La unidad limita la dimensión, pero rara vez determina el canal.** 'kPa' identifica presión; no determina si es MAP, boost, combustible o una consigna. 'RPM' identifica velocidad angular; no demuestra que sea el motor.
3. **Los valores validan plausibilidad, no prueban identidad.** Un intervalo de números puede solaparse entre torque, potencia, presión u otras señales. No se asigna un canal ni se inventa una unidad solo porque los números “parezcan” razonables.
4. **La ambigüedad se conserva como estado explícito.** Nunca se resuelve eligiendo silenciosamente el primer candidato.
5. **Los datos faltantes siguen faltantes.** No se generan tiempos, RPM, unidades, interpolaciones ni muestras artificiales durante la importación.

ASAM MDF modela canales, fuentes, conversiones y grupos de adquisición. El nombre del canal, por sí solo, no es una identidad universal: se debe considerar la fuente y el contexto de adquisición. La arquitectura de esta demo mantiene la misma precaución antes de asumir equivalencia entre señales.

## Orden de resolución

La resolución aplica evidencia en este orden:

1. **Perfil de fabricante y metadatos tipados.** Si un adaptador conoce un identificador de canal, tipo, unidad y fuente dentro de un layout concreto, esa regla específica prevalece. La regla queda identificada por el adaptador y su versión.
2. **Nombre normalizado.** Se normalizan Unicode, acentos, espacios, separadores y mayúsculas del nombre. Se conserva el encabezado original. La normalización del nombre no se reutiliza para interpretar símbolos de unidad.
3. **Alias exacto y calificadores.** Se buscan alias completos registrados; no se usa coincidencia por substring. Los términos target, desired, requested, measured, actual, absolute, wheel, roller, hub o engine pueden cambiar el significado.
4. **Unidad explícita.** Se reconoce una unidad al final del encabezado o entre paréntesis/corchetes, y se valida su dimensión contra el canal candidato. Las unidades se resuelven con el registro versionado datalog-units/2.
5. **Corrección difusa acotada.** Se permite una distancia Damerau-Levenshtein limitada para nombres de longitud suficiente y misma cantidad de tokens. Se utiliza para sugerir una revisión, nunca para asignar automáticamente.
6. **Perfil numérico orientativo.** Se calculan estadísticas robustas de hasta 2.000 observaciones espaciadas. Los percentiles y rangos plausibles pueden mostrar candidatos para revisión. No hay umbral numérico que convierta una columna desconocida en una señal identificada.

El primer registro de metadatos específicos debe ser verificable por el adaptador. Las reglas generales no sustituyen esa evidencia.

## Estados que devuelve el resolver

| Estado | Significado | ¿Preselección automática? |
| --- | --- | --- |
| exact | Alias registrado, único y dimensionalmente compatible | Sí, queda sujeto a revisión humana |
| fuzzy | Posible error menor de tipeo | No |
| ambiguous | Más de un rol o significado plausible | No |
| review_unit_only | La unidad identifica una dimensión, pero no el rol | No |
| review_values_only | El rango numérico es compatible con uno o varios canales | No |
| conflict | La unidad contradice la dimensión del nombre/canal | No |
| unsupported | Se detectó una variante cuyo significado no debe mezclarse con un canal existente | No |
| unrecognized | No hay evidencia suficiente | No |

Solo un alias exacto, único y con unidad compatible puede quedar preseleccionado en la interfaz. La persona debe confirmar el canal y la unidad antes de importar. Una sugerencia difusa, de unidad o de rango no se preselecciona.

## Ejemplos de distinciones importantes

| Entrada | Interpretación segura |
| --- | --- |
| Vehicle Speed (km/h) | Velocidad lineal del vehículo; coincidencia exacta |
| Vehcile Speed (kmh) | Posible error de tipeo; sugerir velocidad, exigir confirmación |
| Distance (km) | Distancia, no velocidad |
| Engine RPM | Régimen de motor; alias explícito |
| RPM | Velocidad angular sin ubicación física confirmada |
| Wheel RPM | RPM de rueda; no se asigna al canal de RPM de motor |
| Boost Pressure (kPa) | Presión; puede ser medida o consigna, requiere contexto |
| MAP (kPa) | La unidad ayuda, pero el nombre corto no prueba referencia absoluta ni ubicación |
| Manifold Absolute Pressure (kPa) | Nombre explícito compatible con MAP absoluto |
| Manifold Pressure Derivative (kPa) | Señal derivada; nunca MAP por substring |
| Fuel Rail Pressure (kPa) | Presión de combustible |
| Target Lambda | Consigna; no se mezcla con lambda medida |
| Wideband Lambda | Candidato medido si el alias/perfil lo confirma |
| Logger Channel 8 (kPa) | Solo dimensión presión; no elegir un canal concreto |

Las bases físicas de torque y potencia —motor, rueda, cubo y rodillo— son parte del significado, no una unidad convertibles entre sí. También debe distinguirse presión absoluta, relativa/gauge y diferencial; compartir kPa no las vuelve equivalentes.

## Unidades y sensibilidad a mayúsculas

Los símbolos de unidades son tokens técnicos, no palabras comunes. El registro datalog-units/2 compara símbolos explícitos respetando el caso cuando este cambia el significado, y acepta variantes declaradas de forma individual. No aplica una conversión global a minúsculas ni elimina prefijos.

Ejemplos:

- Pa es pascal; pA es picoampere. No son equivalentes.
- mW y MW representan escalas distintas de potencia.
- Nm es newton-metro; nm corresponde a nanómetro, no a torque.
- km es distancia; km/h, kmh, kmph y kph se registran como variantes explícitas de velocidad.
- K, °C y °F requieren conversiones propias y no se tratan como simples alias textuales.

La unidad original, la unidad canónica, el factor, el offset y la versión de la regla quedan en los metadatos de importación. En CSV genérico y Dynojet se conserva la celda textual de origen de los canales mapeados junto a las muestras normalizadas. En un adaptador de fabricante que transforma valores antes del mapeo, la procedencia se guarda en sus metadatos y no se presenta el dato ya convertido como texto crudo.

## Qué se puede deducir de los valores

El perfil numérico registra cantidad de observaciones, faltantes/no numéricos, mínimo, máximo, mediana, percentiles 5 y 95, proporción de valores enteros, proporción de valores crecientes y proporción de valores únicos. Se toma una muestra espaciada de hasta 2.000 celdas por columna para que la inspección sea acotada.

Los rangos de compatibilidad se usan solo como filtros débiles. Por ejemplo, una columna de valores entre 1.000 y 3.500 puede ser compatible con RPM, pero también con torque o potencia según el vehículo, el banco y la escala de origen. La interfaz informa candidatos y rango observado; nunca crea una asignación a partir de ellos.

Una vez confirmado el canal por nombre, metadatos o intervención humana, los valores pueden generar alertas de plausibilidad —por ejemplo, acelerador fuera de 0–100 %— sin descartar ni corregir la medición original. Estas alertas son distintas de la identidad semántica y deben considerar el contexto del vehículo y sensor.

## Encabezados, unidades y señales ausentes

- Se acepta un eje temporal (time_s) o un eje de RPM. No se inventa el eje que falte.
- Las curvas de torque/potencia de dinamómetro requieren RPM y una base de medición declarada.
- Sin tiempo no se calculan frecuencia temporal, duración, jitter temporal ni sincronización.
- Sin RPM no se habilitan análisis por régimen.
- Si faltan valores dentro de una columna, se mantienen como null; se informa cobertura.
- Las columnas desconocidas permanecen sin asignar y se enumeran en importMetadata.unmappedHeaders.
- Las asignaciones y unidades elegidas se registran con encabezado de origen y unidad canónica.

La calidad temporal informa intervalos observados por canal cuando hay marcas de tiempo válidas y muestras adyacentes. La tasa resultante no representa necesariamente la frecuencia configurada por el logger. No se infieren muestras perdidas sin una frecuencia esperada conocida.

## Muestreo y procesamiento posterior

El importador preserva las filas y el orden original. La inspección de frecuencia observada, cobertura y jitter es descriptiva; no modifica las muestras.

La aplicación separará tres capas:

1. **Fuente:** celdas y metadatos tal como llegaron, con su procedencia.
2. **Semántica canónica:** nombres, dimensiones, unidades y roles confirmados.
3. **Señales derivadas:** sincronización, filtrado, interpolación, remuestreo, segmentación por barrido y curvas por RPM.

La tercera capa no está habilitada por este cambio. Cuando se incorpore, deberá declarar su método, frecuencia objetivo y límites; mantener intacta la fuente; interpolar solo señales continuas; usar retención de último valor para estados discretos; preservar eventos; no extrapolar ni cruzar huecos relevantes; y aplicar filtrado antialias antes de reducir la frecuencia. Las curvas de dinamómetro requieren tratamiento por régimen y segmentación de barridos, no remuestreo temporal indiscriminado.

## Versionado y evolución

- Parser genérico actual: datalog-csv/1.
- Normalización de unidades: datalog-units/2.
- Resolución determinista de canales: datalog-channel-resolver/1.
- Los perfiles de cada fabricante mantienen reglas propias y fixtures sintéticos cuando no hay muestras publicables con derechos claros.
- Cada alias nuevo requiere casos positivos, negativos y una explicación del significado físico.
- Cada conversión requiere unidad de entrada, dimensión, unidad canónica, factor/offset y prueba numérica.

Los rangos plausibles no se consideran calibrados universalmente. Deberán ajustarse solo con documentación fiable y datos de referencia autorizados, sin eliminar los estados de revisión humana.
