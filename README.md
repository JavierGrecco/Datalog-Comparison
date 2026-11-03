# Datalog Comparison
## Demo de análisis y comparación de registros de motor

Esta es una demostración pequeña y ejecutable de una idea: antes de comparar dos registros de motor, conviene revisar si los datos permiten hacer esa comparación.

Un gráfico puede mostrar dos curvas una encima de la otra, pero eso no significa que las mediciones tengan el mismo origen, unidades, calidad temporal o condiciones de prueba. Esta demo hace visibles esas diferencias y explica cuándo corresponde comparar, cuándo hace falta revisar información y cuándo es mejor detenerse.

El proyecto es una muestra de ingeniería de software aplicada a un problema técnico concreto. No es un producto terminado para un taller ni una herramienta de calibración.

## ¿Qué se puede probar?

La aplicación incluye tres escenarios que se generan dentro del propio programa:

1. **Dos registros sintéticos:** permite recorrer una comparación de ejemplo con canales y unidades declarados.
2. **Datos incompletos:** incorpora valores ausentes y problemas en la secuencia temporal para mostrar cómo cambian las advertencias.
3. **ECU frente a banco:** presenta dos fuentes distintas y bloquea la comparación directa cuando no corresponde tratarlas como la misma medición.

En los escenarios compatibles se muestran curvas ilustrativas de torque y potencia frente a RPM. También se puede revisar una matriz de evidencias y descargar un resumen en formato JSON.

**Todos los valores son inventados y se generan en memoria.** No provienen de un auto, una ECU, un logger ni un banco de rodillos. Las curvas sirven para probar el comportamiento de la aplicación; no son una simulación física validada de un motor.

## Vista previa

Estas capturas se generan durante la prueba de navegador que forma parte del workflow de exportación. Son imágenes de la misma aplicación que se entrega en el paquete.

![Vista general de la demo en escritorio](assets/screenshots/demo-base-escritorio.jpg)

![Caso donde se bloquea la comparación entre ECU y dinamómetro](assets/screenshots/caso-bloqueo-ecu-banco.jpg)

![Vista de la demo en un teléfono](assets/screenshots/demo-base-movil.jpg)

## ¿Qué problema intenta resolver?

La demo reúne controles sencillos para que una comparación no parezca más sólida de lo que realmente es:

- **Origen:** distingue registros de ECU/logger y de dinamómetro.
- **Calidad de los datos:** señala faltantes, secuencias de tiempo irregulares y cobertura incompleta.
- **Canales y unidades:** evita presentar como comparables señales que no tienen una base compatible declarada.
- **Condiciones de prueba:** muestra qué información se declaró y qué puntos siguen necesitando revisión.
- **Procedencia:** conserva el contexto del ejemplo que se está analizando.

La matriz no entrega una nota misteriosa ni un porcentaje de confianza. Muestra controles independientes, explica el resultado y propone qué revisar a continuación.

## Cómo interpretar el resultado

La aplicación puede mostrar tres estados:

- **Bloqueada:** hay una incompatibilidad que impide realizar esa comparación.
- **Revisión necesaria:** falta información o hay advertencias que una persona debe revisar.
- **Descriptiva:** se puede mostrar una comparación limitada con los datos observados, sin afirmar equivalencia física.

Un estado descriptivo no significa que dos pruebas sean físicamente equivalentes. La interpretación final sigue dependiendo de los datos originales, del método de medición y de la revisión de una persona con experiencia.

## Cómo ejecutar la demo

Requisitos: Node.js 22 o posterior, npm y Python 3.10 o posterior.

1. Desde la carpeta del proyecto, instalá las dependencias: `npm install`
2. Iniciá un servidor local: `python3 -m http.server 8000`
3. Abrí [http://127.0.0.1:8000/](http://127.0.0.1:8000/) en tu navegador. La portada te lleva a la aplicación.

La demo y sus datos funcionan en tu equipo. No necesitan una ECU, un servicio externo ni registros reales. Para detener el servidor, usá Ctrl+C.

## Pruebas

Desde la carpeta del proyecto, ejecutá:

```bash
npm ci
npx playwright install chromium
npm test
```

Las pruebas unitarias cubren los tres escenarios. La prueba en Chromium recorre la interfaz, comprueba los gráficos, los avisos, el bloqueo de fuentes incompatibles, la descarga del informe, la vista móvil y que no se envíen solicitudes externas. Estas pruebas verifican el software, no el comportamiento físico de un motor.

## Límites

- Los tres escenarios son sintéticos y se generan dentro de la aplicación.
- En esta primera versión no se importan archivos CSV del usuario.
- Los gráficos de torque y potencia son ilustrativos; no validan un modelo físico de motor o de banco.
- Los nombres de canal y las unidades, por sí solos, no demuestran que dos pruebas sean equivalentes.
- Los registros de ECU/logger y los resultados de un dinamómetro son fuentes distintas. No se deben mezclar por defecto.
- Una relación declarada entre archivos no demuestra que sus relojes estén sincronizados ni que correspondan al mismo evento físico.
- La demo no escribe, modifica ni programa una ECU.
- No diagnostica fallas mecánicas, no demuestra causalidad y no emite recomendaciones de calibración validadas.
- Las pruebas de software verifican el comportamiento programado, no la exactitud física de los resultados.

## Autoría y referencias

La demo pública se limita a una selección de módulos del Workbench y a escenarios sintéticos generados en memoria. No incluye el motor de análisis de TuneAssist, su adaptador, muestras de terceros ni el laboratorio privado de investigación.

En [docs/REFERENCES.md](docs/REFERENCES.md) se identifican herramientas consultadas durante la investigación. Son antecedentes de referencia, no dependencias ni afirmaciones de que esta demo tenga las mismas funciones.

## Licencia

Este repositorio no incluye por ahora una licencia de reutilización. Que el código sea público permite leerlo, pero no concede por sí solo permiso general para copiarlo, modificarlo o distribuirlo. La licencia podrá definirse cuando termine la revisión de procedencia.

## Estado del proyecto

Esta es una demostración de portfolio acotada. El desarrollo del producto completo está en pausa mientras se consiguen registros reales cuyo uso esté autorizado y una revisión de especialistas del área.

El objetivo de esta muestra es que cualquier persona pueda abrir el código, ejecutar los ejemplos y entender qué hace el programa, qué controles aplica y qué cosas todavía no puede afirmar.
