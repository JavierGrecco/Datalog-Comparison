# Componentes y proyectos de código abierto evaluados

Revisión inicial: 20 de noviembre de 2026.

## Criterio

No incorporamos código solo porque sea libre o tenga funciones atractivas. Antes de copiar o adaptar un componente hay que revisar su licencia exacta, dependencias transitivas, avisos de copyright, formato de origen, pruebas, seguridad, mantenimiento y compatibilidad con el modelo físico del proyecto.

## Candidatos

| Proyecto | Licencia identificada | Aporte potencial | Decisión |
| --- | --- | --- | --- |
| [Log2Dyno](https://github.com/nshobe/Log2Dyno) | MIT (LICENSE inspeccionado) | Cálculo de curvas virtuales desde registros de velocidad/RPM y parámetros del vehículo. | Referencia técnica, no importar todavía. Sus resultados son estimaciones dependientes de masa, resistencia, aerodinámica y pérdidas; deben permanecer separados de una medición de banco. |
| [Motorsport Analytics Pipeline](https://github.com/ElSirGuti/motorsport-analytics-pipeline) | MIT (LICENSE inspeccionado) | Arquitectura de análisis de telemetría, comparaciones, informes y biblioteca de sesiones. | Estudiar algoritmos aislados y pruebas. No adoptar su backend/API tal como está: la documentación declara ausencia de autenticación/autorización en la biblioteca. |
| [i3rs](https://github.com/Friss/i3rs) | MIT (LICENSE inspeccionado) | Parser MoTeC .ld/.ldx, lectura eficiente de archivos grandes, decimación min/max y comparación de sesiones. | Candidato para un adaptador futuro, sujeto a validar el formato, cobertura de tests y atribución. No integrar parser Rust en la demo web todavía. |
| [UltraLog](https://github.com/ClassicMiniDIY/UltraLog) | AGPL-3.0 declarada por el proyecto | Referencia de UX y cobertura de formatos/análisis ECU. | No copiar código en este repositorio sin una decisión explícita de relicenciamiento y análisis de obligaciones AGPL. Estudiar conceptos de interfaz sí; no reutilizar implementación. |
| [ECUxPlot](https://github.com/nyetlabs/ecuxplot) | No confirmada en esta revisión | Reconocimiento de múltiples formatos ECU y análisis de logs. | No copiar ni adaptar código hasta localizar y verificar una licencia aplicable al repositorio y sus archivos. La palabra “open source” en una descripción no reemplaza el archivo de licencia. |
| [DIY Dyno](https://diydyno.com/) | GPL-3.0 para software; CERN-OHL-W para hardware, según el proyecto | Adquisición de sensores y control de banco inercial/frenado. | Referencia de arquitectura de adquisición, no componente de software para esta demo. Hardware y software tienen licencias distintas. |

## Decisiones de arquitectura

1. Mantener el núcleo de dominio propio, pequeño y sin dependencias de runtime por ahora.
2. Priorizar adaptadores de formatos abiertos/documentados (CSV exportado, MoTeC cuando se pueda validar, y formatos de ECU con especificación verificable).
3. No importar cálculos de dinamómetro virtual como si fueran mediciones físicas. Identificar por separado:
   - ECU observado;
   - cálculo virtual estimado;
   - dinamómetro de motor;
   - dinamómetro de chasis;
   - rueda, cubo y rodillo.
4. Si se adopta código MIT, conservar el aviso de copyright y el texto de licencia en el componente distribuido, registrar versión/commit de origen y documentar modificaciones.
5. Para AGPL/GPL, revisar el impacto sobre distribución, modificaciones y combinación con el producto antes de incorporar código. No asumir que “gratis” significa sin obligaciones.
6. Generar un inventario de dependencias y licencias en CI antes de sumar paquetes de terceros.

## Referencias

- Log2Dyno: https://github.com/nshobe/Log2Dyno
- Motorsport Analytics Pipeline: https://github.com/ElSirGuti/motorsport-analytics-pipeline
- i3rs: https://github.com/Friss/i3rs
- UltraLog: https://github.com/ClassicMiniDIY/UltraLog
- ECUxPlot: https://github.com/nyetlabs/ecuxplot
- DIY Dyno: https://diydyno.com/
