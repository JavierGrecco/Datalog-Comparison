# Límites de la demo

- Los escenarios de comparación y las curvas integradas son sintéticos. Ningún valor de esos escenarios procede de un vehículo, una ECU, un logger o un dinamómetro real.
- La importación CSV es genérica y beta: permite inspeccionar localmente archivos con asignación manual de columnas y unidades, pero no reconoce exportaciones propietarias.
- Un CSV importado se mantiene aislado; no se incorpora a la matriz de comparación ni se superpone con los escenarios sintéticos.
- El tiempo debe venir en segundos y RPM debe estar expresado en RPM. No se convierten unidades ni se interpretan automáticamente formatos de tiempo distintos.
- Que dos señales tengan el mismo nombre o una unidad declarada parecida no demuestra que representen la misma medición, carga, marcha, condición ambiental o método de prueba.
- ECU/logger y dinamómetro son fuentes de evidencia distintas. La matriz bloquea su comparación numérica directa.
- Declarar que dos archivos están relacionados no demuestra que sus relojes estén sincronizados.
- Los valores de torque/potencia de un CSV no se autentican, recalculan ni validan contra sensores o bancos.
- La aplicación no escribe, modifica ni programa una ECU; tampoco diagnostica fallas ni emite recomendaciones de calibración.
- Que las pruebas automáticas terminen correctamente solo confirma el comportamiento del software cubierto por ellas. La validación real requiere datos autorizados y revisión de especialistas.
