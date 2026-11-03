# Referencias consultadas

Esta demo tiene una implementación acotada propia. Los proyectos siguientes se consultaron para estudiar formatos, flujos de análisis e interoperabilidad. No son dependencias de ejecución y esta publicación no incluye su código, datos ni recursos gráficos.

## Referencias de producto e ingeniería

- [ECUxPlot](https://github.com/nyetlabs/ecuxplot): gráficos y análisis de registros ECU.
- [UltraLog](https://github.com/ClassicMiniDIY/UltraLog): lectura de registros y documentación comunitaria de formatos.
- [TuneAssist](https://github.com/allantaylor8907/tuneassist): referencia de análisis revisada durante la investigación.
- [FuelTune Analyzer](https://github.com/leechardes/fueltune-analyzer): referencia para flujos de importación y análisis.

## Formatos CSV y perfiles

- [UltraLog — especificación comunitaria de formatos ECU](https://github.com/ClassicMiniDIY/UltraLog/blob/main/docs/FORMAT_SPECIFICATIONS.md): describe la variante Haltech NSP con marcador %DataLog%, encabezados tipados y conversiones. La propia publicación indica que parte de su contenido procede de análisis e ingeniería inversa de archivos exportados; no es documentación oficial de Haltech.
- [Dynojet — PowerCore Software](https://www.dynojet.com/powercore-software/): documentación del fabricante sobre WinPEP 8 Data Center, logs CSV y fuentes de terceros.
- [Dynojet — POD-300 Installation Guide](https://www.dynojet.com/installguide/POD-300): documentación del fabricante sobre selección de canales, frecuencia de muestreo configurable y exportación de logs a CSV.
- [Dynojet — formatos admitidos en Data Center](https://docs.dynojet.com/Support/SoftwareHelpFiles/PowerCoreHelp/en-US/2.1.0/DataCenter/DataCenter/DataCenter/To_Open_a_Run_File.htm): enumera formatos nativos y CSV como formato de entrada; no define un esquema CSV universal de columnas.

Estos enlaces reconocen antecedentes y fuentes consultadas. No son recomendaciones comerciales ni afirmaciones de que esta demo tenga las mismas funciones, compatibilidad o resultados.
