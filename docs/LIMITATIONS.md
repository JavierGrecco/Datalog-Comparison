# Límites de la demo

- Los escenarios de comparación y sus curvas son sintéticos. Ningún valor procede de un vehículo, ECU, logger o dinamómetro real.
- El perfil Haltech NSP es experimental y reconoce únicamente una variante de CSV con marcador %DataLog% y encabezados tipados. Sus conversiones se basan en una especificación comunitaria, no en certificación de Haltech.
- El perfil Dynojet PowerCore/WinPEP inspecciona CSV mediante mapeo manual. No presupone un esquema fijo ni lee formatos nativos de WinPEP o Power Vision.
- El CSV genérico permanece disponible para otros exportadores con asignación manual de columnas y unidades.
- Los CSV importados permanecen aislados: no se incorporan a la matriz ni se superponen con escenarios sintéticos.
- El tiempo genérico debe expresarse en segundos y RPM en RPM. No se convierten unidades ni formatos de tiempo desconocidos.
- La base de torque/potencia en dinamómetro se declara como rueda, rodillo, cubo, motor o desconocida; no se convierte entre bases.
- Que dos señales compartan nombre o unidad no demuestra que representen la misma medición, carga, marcha, condición ambiental o método.
- Declarar que dos archivos están relacionados no demuestra que sus relojes estén sincronizados.
- Los valores no se autentican ni validan contra sensores o bancos.
- La aplicación no escribe ni programa una ECU, no diagnostica fallas y no emite recomendaciones de calibración.
- Las pruebas automáticas verifican el comportamiento cubierto del software, no la validez física de un ensayo. La validación real requiere datos autorizados y revisión de especialistas.
