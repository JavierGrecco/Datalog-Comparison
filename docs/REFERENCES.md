# Referencias consultadas

Esta demo tiene una implementación acotada propia. Los proyectos siguientes se consultaron para estudiar formatos, flujos de análisis e interoperabilidad. No son dependencias de ejecución y esta publicación no incluye su código, datos ni recursos gráficos.

## Referencias de producto e ingeniería

- [ECUxPlot](https://github.com/nyetlabs/ecuxplot): gráficos y análisis de registros ECU.
- [UltraLog](https://github.com/ClassicMiniDIY/UltraLog): lectura de registros y documentación comunitaria de formatos.
- [TuneAssist](https://github.com/allantaylor8907/tuneassist): referencia de análisis revisada durante la investigación.
- [FuelTune Analyzer](https://github.com/leechardes/fueltune-analyzer): referencia para flujos de importación y análisis.

## Formatos CSV y perfiles

- [UltraLog — especificación comunitaria de formatos ECU](https://github.com/ClassicMiniDIY/UltraLog/blob/main/docs/FORMAT_SPECIFICATIONS.md): describe la variante Haltech NSP con marcador %DataLog%, encabezados tipados y conversiones. La propia publicación indica que parte de su contenido procede de análisis e ingeniería inversa de archivos exportados; no es documentación oficial de Haltech.
- [UltraLog — exportación NSP pública de ejemplo, log 1118 (18/07/2025)](https://github.com/ClassicMiniDIY/UltraLog/blob/main/exampleLogs/haltech/2025-07-18_0215pm_Log1118.csv): referencia inspeccionada manualmente para el layout Channel/ID/Type/DisplayMaxMin. No se copia ni se incorpora al repositorio.
- [Dynojet — PowerCore Software](https://www.dynojet.com/powercore-software/): documentación del fabricante sobre WinPEP 8 Data Center, logs CSV y fuentes de terceros.
- [Dynojet — POD-300 Installation Guide](https://www.dynojet.com/installguide/POD-300): documentación del fabricante sobre selección de canales, frecuencia de muestreo configurable y exportación de logs a CSV.
- [Dynojet — formatos admitidos en Data Center](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Open_a_Run_File.htm): enumera formatos nativos y CSV como formato de entrada; no define un esquema CSV universal de columnas.

Estos enlaces reconocen antecedentes y fuentes consultadas. No son recomendaciones comerciales ni afirmaciones de que esta demo tenga las mismas funciones, compatibilidad o resultados.


## Fuentes específicas de formato y semántica

- [UltraLog — especificación de formatos, documento 1.0](https://github.com/ClassicMiniDIY/UltraLog/blob/main/docs/FORMAT_SPECIFICATIONS.md): referencia comunitaria de ingeniería inversa para la variante Haltech NSP con marcador %DataLog% y encabezados tipados en una fila.
- [OpenECU Alliance — Haltech NSP CSV Export, v2.0.0](https://oecua.org/adapters/haltech/haltech-nsp): describe una estructura alternativa con metadatos y tabla de canales. La variante Channel/ID/Type se contrastó además con una exportación pública; la tabla Channel,ID,Type,DisplayMaxMin permanece fuera del parser.
- [AllDataLogs — formatos y semántica](https://www.alldatalogs.com/help/formats/): referencia secundaria que indica que los valores del canal AFR de exportaciones Haltech NSP son lambda. El perfil adopta una excepción acotada al nombre exacto Wideband O2 Overall en el layout de bloques, no una conversión global de todos los canales AFR.
- [NSP Dyno — parser comunitario de exportaciones NSP](https://github.com/ImMrTea/NSP_Dyno/blob/main/server/parser.js): referencia adicional para detectar variantes con líneas Channel: separadas. Sus heurísticas numéricas no se reutilizan como reglas de conversión del proyecto.
- [Dynojet — exportación de un run](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Export_a_Run_File.htm): documenta que el CSV puede exportarse con paso de RPM e intervalo temporal configurables.
- [Dynojet — guía WinPEP 7, carpeta Samples](https://www.dynojet.com/amfile/file/download/file/138/category/184/): documenta archivos de muestra instalados con WinPEP, pero no publica un CSV de exportación crudo. No se encontró una muestra CSV pública que permita validar el esquema extremo a extremo.
