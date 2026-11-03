# Puertas de calidad y significado de los estados

## Principio

La matriz explica qué evidencia se revisó y qué falta comprobar. No produce un puntaje de confianza ni certifica la validez física de un ensayo.

Cada puerta mantiene un estado independiente:

- `blocked`: existe una condición que impide habilitar la comparación numérica.
- `review_required`: la lectura puede ser exploratoria, pero hay datos, contexto o contratos que requieren revisión.
- `supported`: no se detectó un problema dentro de las comprobaciones específicas de esa puerta. No equivale a certificación.

El estado general se calcula de forma conservadora: un bloqueo prevalece sobre cualquier otra condición; en ausencia de bloqueos, una sola puerta pendiente mantiene la evaluación en revisión. Una evaluación sin alertas sigue siendo descriptiva.

## Puertas

| Puerta | Qué revisa | Comportamiento |
| --- | --- | --- |
| Origen | Clasificación ECU/logger, dinamómetro o desconocida. | Bloquea una mezcla ECU/logger–dinamómetro y una mezcla entre un origen conocido y otro sin clasificar. |
| Calidad y tiempo | Cantidad de muestras, canales analizables, faltantes, tiempos, filas omitidas y metadatos de importación. | Bloquea datos insuficientes; requiere revisión ante advertencias de integridad o cobertura. |
| Canales, unidades y base física | Señales compartidas, unidad declarada, cobertura y base de torque/potencia del dinamómetro. | Excluye torque/potencia cuando la base física falta o difiere; revisa unidades excluidas o cobertura inferior al umbral. |
| Condiciones | Campos relevantes por fuente, diferencias, desconocidos, estado y procedencia. | Requiere revisión si hay valores distintos, desconocidos, no verificados o un contrato inválido. |
| Procedencia | Roles, huellas, contexto y manifiestos. | Requiere revisión ante manifiestos ausentes, incompletos, en borrador, inválidos o con posibles duplicados. |
| Validación real | Identificación explícita de datos sintéticos. | Los escenarios sintéticos siempre requieren validación con evidencia real autorizada antes de extraer conclusiones mecánicas. |

El umbral de cobertura por defecto es 80 %. Es una política de revisión configurable, no una tolerancia de ingeniería ni una afirmación de validez metrológica.

## Restricciones deliberadas

- No se convierten unidades automáticamente.
- No se reordenan, interpolan ni imputan muestras.
- No se deduce sincronización entre relojes de distintos archivos.
- No se reemplaza una señal de ECU por una de dinamómetro.
- No se mezclan automáticamente torque/potencia de rueda, rodillo, cubo y motor.
- No se infiere causalidad, seguridad ni efecto de una calibración.
- Una huella SHA-256 identifica bytes; no autentica el ensayo ni la fuente.

## Evidencia de pruebas

Las pruebas unitarias cubren reglas de origen, compatibilidad de unidades, calidad temporal, metadatos, condiciones operativas, manifiestos, cobertura y escenarios sintéticos.

La prueba de navegador recorre la entrada pública, selección de casos, bloqueo entre fuentes y entre bases físicas de dinamómetro, visualización, teclado, descarga de JSON, errores de consola, errores HTTP, viewport móvil y solicitudes externas.

La CI confirma únicamente que pasan las comprobaciones automatizadas configuradas. No valida sensores, motores, bancos ni mediciones físicas.
