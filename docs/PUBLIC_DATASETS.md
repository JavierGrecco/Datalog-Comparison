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


### Dinamómetro de chasis: Argonne D³

[Downloadable Dynamometer Database (D³)](https://www.anl.gov/taps/downloadable-dynamometer-database) · [Ejemplo de vehículo: Infiniti QX50 2019](https://www.anl.gov/taps/d3-2019-infiniti-qx50).

Argonne describe D³ como datos públicos de ensayos de vehículos realizados en laboratorio por el Advanced Mobility Technology Laboratory (AMTL). La ficha del Infiniti QX50 identifica un motor 2.0 L VC-Turbo de cuatro cilindros. Los informes históricos de Argonne/DOE describen señales de ciclo de conducción y dinamómetro a 10 Hz para determinados datasets, incluyendo velocidad, esfuerzo de tracción, régimen de motor, temperaturas y señales eléctricas. **La frecuencia y las señales se deben verificar en cada archivo; no se generalizan de un vehículo a otro.**

D³ es un candidato medido de **dinamómetro de chasis**, no una fuente equivalente a un barrido de potencia/torque de motor en banco. El esfuerzo de tracción del rodillo no debe asignarse directamente al canal `torque_nm`, ni el régimen del motor debe interpretarse como un barrido WOT sin revisar el ciclo y el contexto.

**Acceso y derechos:** la página vigente indica que los datos solo pueden usarse con la atribución que publica Argonne o una referencia bibliográfica estándar. El portal histórico también publicó una advertencia de consentimiento para usos en publicaciones o con fines de lucro. Como esos términos no establecen de forma inequívoca la redistribución de extractos, fixtures o artefactos CI, el catálogo no asigna una licencia y mantiene el uso público en este repositorio como pendiente de confirmación. Contacto oficial: `d3info@anl.gov`.

Atribución publicada por Argonne:

> This data is from the Downloadable Dynamometer Database and was generated at the Advanced Mobility Technology Laboratory (AMTL) at Argonne National Laboratory under the funding and guidance of the U.S. Department of Energy (DOE)

Los archivos de vehículo se enlazan mediante una carpeta Box embebida. Todavía no se ha inspeccionado el inventario ni descargado un archivo concreto; por eso D³ no se usa como fixture ni se afirma una estructura CSV específica.

## Fuentes públicas que no deben redistribuirse por ahora

| Fuente | Utilidad técnica | Estado de derechos y uso en este repositorio |
| --- | --- | --- |
| [rusEFI Online](https://rusefi.com/online/) | Logs ECU comunitarios; posibles muestras de alta frecuencia y formatos `.mlg`. | No se identificó una licencia de redistribución de los logs. Solo QA local/privada hasta tener licencia o permiso del propietario. |
| [ClassicMiniDIY / MiniECUMaps](https://github.com/ClassicMiniDIY/MiniECUMaps) | Ejemplos Haltech NSP CSV/LFS para contrastar layouts. | No se confirmó licencia específica de los archivos de log. No copiarlos, espejarlos ni subirlos a este repositorio. |
| [EngineDyno](https://github.com/moffa13/EngineDyno) | Ejemplos ME7/VCDS/Dragy y cálculo de desempeño. | No se confirmó licencia de los CSV. Sus estimaciones de torque/potencia parten de datos de circulación y supuestos del vehículo; no son mediciones directas de dinamómetro. No usarlos como referencia de banco. |
| [High Performance Academy — MoTeC example logs](https://www.hpacademy.com/es/foro/tutorial-del-software-motec-m1-1/show/example-logged-data-and-software-tools-download/) | Archivo MoTeC de práctica para inspeccionar estructura y flujo de trabajo. | El foro invita a descargar y practicar, pero no identifica una licencia de redistribución del archivo. Solo QA local; no incorporarlo al repositorio ni a CI. El modelo exacto de ECU y el contenido del ZIP siguen sin verificar. |


La publicación de [High Performance Academy](https://www.hpacademy.com/es/foro/tutorial-del-software-motec-m1-1/show/example-logged-data-and-software-tools-download/) enlaza el [ZIP de datos MoTeC de ejemplo](https://www.hpacademy.com/assets/Course-Content/Data-Fundamentals-/c6d3af1dbb/03-MOTEC-EXAMPLE-LOGGED-DATA.zip) e invita a descargarlo para practicar. Esa invitación sirve como base para ensayos locales, pero no es una licencia para redistribuir los archivos, incorporarlos a este repositorio o adjuntarlos a la CI. El ZIP no pudo inspeccionarse durante esta revisión: por eso el catálogo lo marca como pendiente de descarga y no confirma el modelo exacto de ECU ni la estructura de los archivos.

Si una fuente no tiene una licencia clara, el permiso de descarga o la posibilidad de visualizarla no alcanzan. Antes de publicar un extracto hay que conseguir autorización del titular o una licencia que cubra expresamente esa redistribución.

## Clasificación obligatoria de evidencia

Cada registro utilizado por el proyecto debe poder distinguir entre:

- **Medido:** lectura de sensor, logger o equipo de adquisición; conserva método, origen y unidades.
- **Simulado:** salida de un modelo o emulador; conserva versión, configuración y semilla cuando esté disponible.
- **Derivado/estimado:** cálculo construido a partir de otras señales o supuestos; conserva fórmula y entradas.
- **No verificado:** fuente, licencia, unidades, método o semántica todavía no confirmados.

No comparar ni presentar estos grupos como si fueran intercambiables. En particular, una curva de torque/potencia estimada en ruta no debe etiquetarse como curva medida de dinamómetro.

En `data/sources.json`, `evidenceClass` usa únicamente esas cuatro categorías para que el catálogo pueda validarse automáticamente. El campo `evidenceDetail` conserva los matices de cada fuente (por ejemplo, columnas medidas y derivadas, resultados teóricos o datos todavía no verificados). La licencia del código de una herramienta nunca se interpreta como licencia de sus archivos de salida.

## Atribución y trazabilidad para futuras fixtures

Para incorporar una muestra externa a `tests/fixtures/`:

1. Confirmar la licencia del archivo concreto, no solo la licencia general de la página o del código que lo acompaña.
2. Incluir atribución, URL de origen y licencia con su enlace. En CC BY 4.0, indicar también qué recorte, conversión o normalización se hizo.
3. Conservar un hash SHA-256 del archivo de origen y el procedimiento de extracción.
4. No borrar metadatos, filas de cabecera.o unidades que sean necesarias para entender las muestras.
5. Identificar expresamente canales medidos, derivados y estimados.
6. Mantener privados los datos con licencia no identificada o datos personales no necesarios.

Las fuentes y sus estados también se mantienen en `data/sources.json` para que la política pueda revisarse sin depender de una tabla escrita manualmente.


## Casos experimentales incorporados al diseño de pruebas

### ECU estacionaria — Wahyudi, Putri & Ibrahim (2026)

La publicación describe un motor SI 1.6 L con Motec M130 y dinamómetro de motor Schenck Dynas3 LI 250, 288 condiciones de operación, tres adquisiciones por punto, estabilización mínima de cinco minutos y refrigerante a 80 ± 2 °C. El fixture `examples/test-protocol-ecu-steady-state.synthetic.json` reproduce la estructura del protocolo con valores explícitamente sintéticos; no copia muestras ni resultados medidos del artículo. Se usa para verificar los campos obligatorios y el cálculo de CV.

### Dinamómetro — fuente CC BY 4.0 pendiente de inspección

[Mendeley Data, Parmar et al. (2024)](https://data.mendeley.com/datasets/cb2wjcd2st/1) publica datos descritos como adquisición cruda de dinamómetro de motor SI monocilíndrico bajo cuatro cargas. Se incorporó al catálogo de fuentes autorizadas como candidata de validación. Los archivos no se incorporan todavía: hay que revisar columnas, unidades, licencias del archivo, condiciones y si existen repeticiones suficientes antes de construir un fixture fiel. La ficha pública no basta para afirmar que contiene barridos RPM o muestras temporales.
