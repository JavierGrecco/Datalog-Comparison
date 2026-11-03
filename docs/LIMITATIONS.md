# Límites de la demo

## Datos y validación física

- Los cuatro escenarios de comparación y sus curvas son sintéticos. Ningún valor procede de un vehículo, ECU, logger o dinamómetro real.
- Una exportación Haltech NSP pública se inspeccionó manualmente para confirmar la estructura Channel/ID/Type/DisplayMaxMin. El archivo original no está incluido en el repositorio ni en CI; los fixtures de prueba usan datos inventados.
- Las reglas Haltech son experimentales y comunitarias. No están certificadas por Haltech ni garantizan compatibilidad con todos los modelos, versiones o configuraciones de NSP.
- El perfil Dynojet PowerCore/WinPEP inspecciona CSV mediante mapeo manual. No se encontró una exportación CSV cruda pública que permita validar el esquema de extremo a extremo; no se presupone un esquema fijo ni se leen formatos nativos de WinPEP o Power Vision.
- El CSV genérico permanece disponible para otros exportadores con sugerencias de mapeo que requieren confirmación y declaración/revisión de unidades.
- Los CSV importados permanecen aislados: no se incorporan a la matriz ni se superponen con escenarios sintéticos.

## Importación

- Haltech NSP admite dos layouts observados: encabezado tipado en una fila y bloques de metadatos `Channel :`, `ID :`, `Type :` y `DisplayMaxMin :`. La tabla `Channel,ID,Type,DisplayMaxMin` sigue sin estar implementada.
- En el layout de bloques Haltech, solo se asignan nombres y tipos exactos con semántica explícita. Los canales derivados, consignas y señales ambiguas permanecen fuera del registro normalizado.
- La excepción AFR a lambda se limita al nombre exacto `Wideband O2 Overall` de tipo AFR en el layout de bloques. No se generaliza a todos los canales AFR ni al layout tipado.
- La conversión de tipo `Pressure` a presión relativa utiliza una referencia fija de 101,3 kPa según la referencia comunitaria; no reemplaza esa referencia por una medición barométrica del log.
- Se requiere al menos un eje (tiempo o RPM); torque/potencia de dinamómetro requieren RPM. El importador no genera ejes ni muestras ausentes.
- La base de torque/potencia en dinamómetro se declara como rueda, rodillo, cubo, motor o desconocida; no se convierte entre bases.
- La resolución genérica ofrece alias exactos, sugerencias difusas y pistas por dimensión/rango; las dos últimas requieren confirmación y nunca se aplican automáticamente.
- El perfil por rango es orientativo, muestrea hasta 2.000 valores espaciados y no está calibrado contra una flota de vehículos. No identifica de forma autónoma un canal ni su unidad.
- Los símbolos de unidad se interpretan con sensibilidad al caso para evitar colisiones de prefijos; la lista de alias sigue siendo finita y versionada.
- CSV genérico y Dynojet conservan el texto original de valores de los canales mapeados; los adaptadores específicos documentan si ya transformaron el valor antes de la capa común. Las columnas desconocidas no se incorporan al registro canónico.
- Una unidad común no demuestra que dos señales representen la misma magnitud, ubicación de medición, carga, marcha, condición ambiental o método.

## Análisis y seguridad

- Si falta el tiempo, no se calcula frecuencia temporal, duración, jitter ni sincronización; si falta RPM, no se habilitan curvas por régimen.
- La tasa por canal es una estimación de intervalos adyacentes observados, no la frecuencia configurada por el logger ni una estimación validada de muestras perdidas.
- Declarar que dos archivos están relacionados no demuestra que sus relojes estén sincronizados.
- Los valores, el origen y las unidades declaradas no se autentican ni validan contra sensores o bancos.
- La aplicación no escribe ni programa una ECU, no diagnostica fallas y no emite recomendaciones de calibración.
- La comparación entre dos archivos importados, la persistencia y la asociación de expedientes ECU + dinamómetro están fuera del alcance actual.
- Las pruebas automáticas verifican el comportamiento cubierto del software, no la validez física de un ensayo. La validación real requiere datos autorizados y revisión de especialistas.
