# Arquitectura de la demo

## Objetivo

La publicación es un prototipo pequeño, ejecutable en el navegador y orientado a demostrar reglas de evaluación de evidencia. La arquitectura separa la presentación de los módulos de dominio para que los controles puedan probarse sin depender del DOM.

## Flujo de ejecución

```mermaid
flowchart TD
    A[Interfaz HTML y JavaScript] --> B[Generador de escenarios sintéticos]
    A --> C[Inspector CSV local]
    C --> D[Parser CSV genérico]
    D --> E[Mapeo explícito de columnas y unidades]
    E --> F[Perfil de calidad]
    B --> G[Matriz de preparación]
    G --> H[Política de origen]
    G --> I[Calidad de datos]
    G --> J[Comparabilidad de canales y unidades]
    G --> K[Condiciones operativas]
    G --> L[Manifiesto y procedencia]
    A --> M[Gráficos SVG e informes]
```

## Responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| `app/` | Presentación, escenarios, gráficos SVG y vista de inspección CSV local. |
| `app/csv-inspector.mjs` | Lectura de archivos en navegador, asignación explícita y vista previa aislada. |
| `src/csv-import.mjs` | Parser genérico, límites de lectura y adaptación a un registro exploratorio. |
| `src/demo-model.mjs` | Construcción determinista de los ejemplos sintéticos y resumen portable. |
| `src/comparison-readiness.mjs` | Orquestación de puertas de evidencia, hallazgos y próximos pasos. |
| `src/source-policy.mjs` | Clasificación de fuentes y bloqueo de mezclas ECU/logger–dinamómetro. |
| `src/data-quality.mjs` | Perfil de muestras, cobertura, secuencia temporal y coherencia de metadatos. |
| `src/run-comparability.mjs` | Detección de canales compartidos y compatibilidad declarada de unidades. |
| `src/operating-conditions.mjs` | Contrato, validación y comparación de condiciones declaradas. |
| `src/run-manifest.mjs` | Identidad, roles, huellas y contexto documentado de los archivos. |

## Límites entre capas

- Los módulos de dominio no acceden al DOM, al almacenamiento del navegador ni a servicios de red.
- El generador produce datos artificiales identificados como sintéticos; no sustituye un parser de archivos.
- El parser CSV es independiente de la interfaz y no depende de una marca de ECU o dinamómetro.
- El parser conserva las filas y los faltantes; rechaza filas con celdas extra y valores numéricos mal formados.
- La asignación de columnas, el dominio y las unidades son explícitos. No hay inferencia por nombre ni conversiones.
- El inspector CSV crea un registro exploratorio y muestra calidad; no lo agrega a la matriz ni permite compararlo con los fixtures.
- La matriz combina los resultados de los módulos, pero no calcula una puntuación de confianza.
- Los gráficos consumen canales que superaron las comprobaciones de origen y unidad. Los datos faltantes interrumpen el trazo; no se interpolan.
- El informe exporta el estado y los máximos observados, no las muestras completas ni rutas locales.
- Los ejemplos de ECU y dinamómetro quedan separados; una relación documental no habilita una comparación numérica cruzada.

## Ejecución y dependencias

La interfaz usa HTML, CSS y módulos ECMAScript nativos. Los gráficos se dibujan en SVG. No hay backend, proceso de build ni dependencias JavaScript de ejecución.

Python puede utilizarse para servir la carpeta localmente, pero no participa del producto. Node.js y Playwright se reservan para las comprobaciones automatizadas.

## Pruebas

- `tests/unit/` valida reglas de dominio, parser CSV, escenarios, condiciones, procedencia y contratos.
- `tests/fixtures/` contiene únicamente CSV sintéticos y versionados.
- `tests/browser/` levanta un servidor local efímero y recorre los tres escenarios y la inspección CSV en Chromium.
- `npm test` ejecuta chequeos de sintaxis, pruebas unitarias y pruebas de navegador.

El detalle de los estados se documenta en [QUALITY_GATES.md](QUALITY_GATES.md). El contrato CSV se documenta en [CSV_IMPORT.md](CSV_IMPORT.md). Las pruebas automáticas no demuestran equivalencia física ni validan un vehículo.
