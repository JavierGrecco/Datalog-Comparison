# Datos públicos: fuentes, licencias y criterios de uso

Este documento registra fuentes externas que pueden ayudar a validar el importador y las herramientas de análisis. **Un enlace público no equivale a una licencia de reutilización.** Cada archivo debe conservar su fuente, licencia, atribución, fecha de descarga, hash y transformaciones.

El catálogo estructurado está en [`data/sources.json`](../data/sources.json). El repositorio no incorpora los archivos originales de terceros por defecto. Las muestras descargadas se guardan en `data/external/`, que está excluido de Git.

## Fuentes aptas para reutilización con atribución

### OBD-II: Opel Corsa 1.2 (2012)

[Dataset en Hugging Face](https://huggingface.co/datasets/PedroCuisinier2025/OBD2_panel_opel_2012) · **CC BY 4.0** · Atribución: `PedroCuisinier2025, OBD-II Telemetry – Opel Corsa 1.2 (2012), Hugging Face Datasets`.

Contiene 394.406 filas y 28 columnas, con telemetría real obtenida de un Opel Corsa 1.2 A12XER (2012) mediante ELM327 y `python-OBD`. La página describe conducción urbana, suburbana y de ruta, con una frecuencia global aproximada de 3–12 Hz según la latencia de cada PID. Los grupos tienen ritmos diferentes: PIDs rápidos cercanos a 1 s, medios a 15 s y lentos a 30 s. Por eso es una referencia útil para faltantes, lecturas asíncronas, cobertura y calidad de datos OBD de calle; **no reemplaza un log de ECU de alta frecuencia**.

El dataset mezcla PIDs OBD con campos derivados. RPM, velocidad, acelerador, carga, presión de admisión, MAF, trims, O2, temperatura y tensión provienen de lecturas de PIDs según la descripción. En cambio `TORQUE`, `POWER` y `GEAR` son valores derivados/estimados por el autor; los campos de consumo y predicción también proceden de cálculos. No los trates como mediciones directas de torque, potencia o marcha.

Para evitar descargar los 91,6 MB completos, el repositorio incorpora un descargador de slices desde el visor de Hugging Face. La API admite hasta 100 filas por solicitud:

```bash
npm run data:obd-sample -- --offset 0 --length 100
npm run data:obd-sample -- --offset 15000 --length 100
```

Cada ejecución escribe un CSV y un sidecar `.source.json` en `data/external/`. El sidecar conserva la atribución, licencia, URL de consulta, offset, cantidad de filas y SHA-256. El CSV no se añade al repositorio. Podés importar el slice desde el inspector CSV local y mapear manualmente `timestamp`, `RPM`, `SPEED`, `THROTTLE_POS`, `ENGINE_LOAD`, `INTAKE_PRESSURE`, `MAF` y otros canales que correspondan.

**Regla de análisis:** los grupos de PIDs no comparten necesariamente una muestra nueva en cada fila. Un valor vacío significa que no hubo actualización disponible en esa fila; no se debe interpolar o convertir automáticamente ese flujo irregular en una serie uniforme. El remuestreador FIR del proyecto requiere una base temporal uniforme validada. Primero debe existir un tratamiento explícito de adquisición asíncrona por canal.

### Dinamómetro de motor: H₂-CNG

[Dataset Mendeley Data](https://data.mendeley.com/datasets/cb2wjcd2st/1) · DOI `10.17632/cb2wjcd2st.1` · **CC BY 4.0**.

Parmar, Nishit; Jamariya, Jasmin; Manjaly, Reuben; Desai, Krish. *Performance characteristics of a hydrogen-CNG fuelled spark-ignition engine* (publicado el 7 de julio de 2024). La descripción informa datos crudos adquiridos directamente con el software de adquisición de un dinamómetro de motor, para un motor SI monocilíndrico alimentado con CNG enriquecido con hidrógeno, bajo cuatro cargas (10, 12, 14 y 16 kg). También incluye comparaciones entre valores reales y teóricos.

Es la fuente más prometedora para incorporar evidencia real de banco. Sin embargo, antes de convertirla en fixture hay que descargar y revisar sus archivos: la ficha pública no demuestra que sean barridos RPM continuos, series temporales o que las columnas tengan el formato que espera `buildRpmSweepCurves`. Mantener separados valores medidos y teóricos. No atribuirle un muestreo o un eje que todavía no se hayan verificado.

## Fuentes públicas que no deben redistribuirse por ahora

| Fuente | Utilidad técnica | Estado de derechos y uso en este repositorio |
| --- | --- | --- |
| [rusEFI Online](https://rusefi.com/online/) | Logs ECU comunitarios; posibles muestras de alta frecuencia y formatos `.mlg`. | No se identificó una licencia de redistribución de los logs. Solo QA local/privada hasta tener licencia o permiso del propietario. |
| [ClassicMiniDIY / MiniECUMaps](https://github.com/ClassicMiniDIY/MiniECUMaps) | Ejemplos Haltech NSP CSV/LFS para contrastar layouts. | No se confirmó licencia específica de los archivos de log. No copiarlos, espejarlos ni subirlos a este repositorio. |
| [EngineDyno](https://github.com/moffa13/EngineDyno) | Ejemplos ME7/VCDS/Dragy y cálculo de desempeño. | No se confirmó licencia de los CSV. Sus estimaciones de torque/potencia parten de datos de circulación y supuestos del vehículo; no son mediciones directas de dinamómetro. No usarlos como referencia de banco. |

Si una fuente no tiene una licencia clara, el permiso de descarga o la posibilidad de visualizarla no alcanzan. Antes de publicar un extracto hay que conseguir autorización del titular o una licencia que cubra expresamente esa redistribución.

## Clasificación obligatoria de evidencia

Cada registro utilizado por el proyecto debe poder distinguir entre:

- **Medido:** lectura de sensor, logger o equipo de adquisición; conserva método, origen y unidades.
- **Simulado:** salida de un modelo o emulador; conserva versión, configuración y semilla cuando esté disponible.
- **Derivado/estimado:** cálculo construido a partir de otras señales o supuestos; conserva fórmula y entradas.
- **No verificado:** fuente, licencia, unidades, método o semántica todavía no confirmados.

No comparar ni presentar estos grupos como si fueran intercambiables. En particular, una curva de torque/potencia estimada en ruta no debe etiquetarse como curva medida de dinamómetro.

## Atribución y trazabilidad para futuras fixtures

Para incorporar una muestra externa a `tests/fixtures/`:

1. Confirmar la licencia del archivo concreto, no solo la licencia general de la página o del código que lo acompaña.
2. Incluir atribución, URL de origen y licencia con su enlace. En CC BY 4.0, indicar también qué recorte, conversión o normalización se hizo.
3. Conservar un hash SHA-256 del archivo de origen y el procedimiento de extracción.
4. No borrar metadatos, filas de cabecera.o unidades que sean necesarias para entender las muestras.
5. Identificar expresamente canales medidos, derivados y estimados.
6. Mantener privados los datos con licencia no identificada o datos personales no necesarios.

Las fuentes y sus estados también se mantienen en `data/sources.json` para que la política pueda revisarse sin depender de una tabla escrita manualmente.
