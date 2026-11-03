# Referencias consultadas

Esta demo tiene una implementación acotada propia. Las referencias siguientes se consultaron para estudiar formatos, flujos de análisis e interoperabilidad. No son dependencias de ejecución y esta publicación no incluye código, muestras completas ni recursos gráficos de otros proyectos.

## Referencias de producto e ingeniería

- [ECUxPlot](https://github.com/nyetlabs/ecuxplot): gráficos y análisis de registros ECU.
- [UltraLog](https://github.com/ClassicMiniDIY/UltraLog): lectura de registros y documentación comunitaria de formatos.
- [TuneAssist](https://github.com/allantaylor8907/tuneassist): referencia de análisis revisada durante la investigación.
- [FuelTune Analyzer](https://github.com/leechardes/fueltune-analyzer): referencia para flujos de importación y análisis.

## Haltech NSP

- [UltraLog — especificación comunitaria de formatos ECU](https://github.com/ClassicMiniDIY/UltraLog/blob/main/docs/FORMAT_SPECIFICATIONS.md): describe la variante con marcador %DataLog%, encabezados tipados y reglas de conversión. La propia publicación indica que parte del contenido procede de ingeniería inversa de archivos exportados; no es documentación oficial de Haltech.
- [UltraLog — exportación NSP pública de ejemplo, log 1118 (18/07/2025)](https://github.com/ClassicMiniDIY/UltraLog/blob/main/exampleLogs/haltech/2025-07-18_0215pm_Log1118.csv): se inspeccionó manualmente para confirmar la forma del layout Channel/ID/Type/DisplayMaxMin y revisar nombres/tipos de canales. No se incorpora ni redistribuye en este repositorio.
- [OpenECU Alliance — Haltech NSP CSV Export, v2.0.0](https://oecua.org/adapters/haltech/haltech-nsp): describe una variante con metadatos y tabla de canales. La tabla `Channel,ID,Type,DisplayMaxMin` permanece fuera del parser.
- [AllDataLogs — formatos y semántica](https://www.alldatalogs.com/help/formats/): referencia secundaria sobre la semántica lambda de los valores AFR en ciertas exportaciones Haltech NSP. La implementación adopta una excepción acotada al nombre exacto `Wideband O2 Overall` en el layout de bloques, no una conversión global de todos los canales AFR.
- [NSP Dyno — parser comunitario de exportaciones NSP](https://github.com/ImMrTea/NSP_Dyno/blob/main/server/parser.js): referencia adicional para reconocer variantes con líneas Channel separadas. Sus heurísticas no se reutilizan como reglas de conversión.

## Dynojet PowerCore / WinPEP

- [Dynojet — PowerCore Software](https://www.dynojet.com/powercore-software/): documentación del fabricante sobre WinPEP 8 Data Center, logs CSV y fuentes de terceros.
- [Dynojet — POD-300 Installation Guide](https://www.dynojet.com/installguide/POD-300): documentación del fabricante sobre selección de canales, frecuencia de muestreo configurable y exportación de logs a CSV.
- [Dynojet — formatos admitidos en Data Center](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Open_a_Run_File.htm): enumera formatos nativos y CSV como formato de entrada, pero no define un esquema CSV universal de columnas.
- [Dynojet — exportación de un run](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Export_a_Run_File.htm): documenta que el CSV puede exportarse con paso de RPM e intervalo temporal configurables.
- [Dynojet — guía WinPEP 7, carpeta Samples](https://www.dynojet.com/amfile/file/download/file/138/category/184/): documenta archivos de muestra instalados con WinPEP; no se encontró en esa guía una exportación CSV cruda que permita validar el esquema extremo a extremo.

## Criterio de uso

Las referencias documentan antecedentes y límites de evidencia. La muestra Haltech se utilizó para inspección estructural manual, no como fixture ni como validación completa del parser. No se encontró una exportación CSV cruda pública de Dynojet para validar la ruta guiada; por eso permanece basada en asignación manual y no en detección automática de columnas.
