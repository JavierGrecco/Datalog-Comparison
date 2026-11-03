<div align="center">

# Datalog Comparison

### La evidencia antes que la comparación.

Una demostración técnica para evaluar si dos registros de motor ofrecen una base razonable para compararlos, identificar límites en los datos y explicar cuándo corresponde revisar o bloquear el análisis.

[![Validación de la demo](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml)

**Demo experimental · JavaScript · Datos sintéticos · Ejecución local**

</div>

---

## El problema

Superponer dos curvas no demuestra que las mediciones sean comparables. Antes de interpretar diferencias conviene conocer su origen, calidad temporal, canales, unidades, condiciones de prueba y procedencia.

**Datalog Comparison** explora ese paso previo. La aplicación reúne controles independientes y presenta sus resultados de forma explicable: qué se pudo comprobar, qué requiere revisión y qué incompatibilidad impide continuar.

Es una muestra acotada de ingeniería de software aplicada al análisis de registros de motor. **No es un producto de taller, un sistema de diagnóstico ni una herramienta de calibración.**

## Qué incluye la demostración

La aplicación contiene tres escenarios generados en memoria:

| Escenario | Qué permite observar |
| --- | --- |
| **Registros sintéticos completos** | Dos registros del mismo dominio, con canales y unidades declarados. La matriz mantiene la revisión de validación real como requisito. |
| **Datos incompletos** | Valores ausentes, cobertura parcial y anomalías en la secuencia temporal. Los datos faltantes no se completan artificialmente. |
| **ECU frente a dinamómetro** | Dos fuentes de evidencia distintas. La política bloquea la comparación numérica conjunta y oculta las curvas superpuestas. |

En los escenarios del mismo dominio se pueden inspeccionar gráficos descriptivos de **torque y potencia frente a RPM**. Ambos comparten el eje horizontal y mantienen escalas verticales independientes. La aplicación también permite exportar un resumen de la evaluación en JSON.

### Cómo decide la matriz

Los controles se presentan por separado, sin reducirlos a una puntuación opaca:

- **Origen:** identifica si los registros pertenecen al dominio ECU/logger o dinamómetro.
- **Calidad:** revisa faltantes, cobertura y consistencia temporal.
- **Canales y unidades:** comprueba qué señales tienen una base declarada compatible.
- **Condiciones de operación:** muestra el contexto informado para cada ensayo y sus vacíos.
- **Procedencia:** conserva la información disponible sobre el origen de los datos.

La matriz puede señalar tres tipos de resultado:

| Resultado | Interpretación |
| --- | --- |
| **Bloqueada** | Existe una incompatibilidad que impide realizar esa comparación. |
| **Revisión necesaria** | Hay advertencias, información incompleta o validaciones pendientes. |
| **Descriptiva** | Solo permite una lectura limitada de los datos observados; no acredita equivalencia física. |

Un resultado descriptivo no certifica que dos ensayos sean equivalentes. La interpretación técnica sigue dependiendo de la evidencia original y de la revisión de una persona con experiencia.

## Ejecutar la aplicación

La demo no necesita una ECU, archivos de registro, servicios externos ni dependencias de ejecución. Requiere Python 3 para levantar un servidor local sencillo.

```bash
git clone https://github.com/JavierGrecco/Datalog-Comparison.git
cd Datalog-Comparison
python3 -m http.server 8000
```

Abrí [http://127.0.0.1:8000/](http://127.0.0.1:8000/) en el navegador. La página de inicio redirige a la aplicación ubicada en `app/`.

Para detener el servidor, presioná `Ctrl+C`.

## Validar el código

Las pruebas automatizadas requieren **Node.js 22 o posterior** y npm. Desde la raíz del repositorio:

```bash
npm ci
npx playwright install chromium
npm test
```

El comando `npm test` ejecuta:

1. **Chequeo de sintaxis:** valida los módulos JavaScript incluidos en el proyecto.
2. **Pruebas unitarias:** comprueba los tres escenarios, los estados de evaluación, el informe exportable y los límites de interpretación.
3. **Prueba de navegador:** recorre la interfaz en Chromium, verifica gráficos, bloqueos, exportación JSON, vista móvil, errores de JavaScript y ausencia de solicitudes externas.

El workflow de GitHub Actions ejecuta estas mismas validaciones en cada actualización de `main` y en las solicitudes de integración. El indicador al comienzo del documento muestra el estado de la última ejecución.

Estas pruebas verifican el comportamiento del software cubierto por ellas; no validan sensores, motores, dinamómetros ni resultados físicos.

## Organización del repositorio

```text
.
├── app/                  # Interfaz, estilos y gráficos SVG
├── src/
│   ├── demo-model.mjs    # Escenarios sintéticos e informe JSON
│   ├── comparison-readiness.mjs
│   ├── run-comparability.mjs
│   ├── data-quality.mjs
│   ├── source-policy.mjs
│   ├── operating-conditions.mjs
│   └── run-manifest.mjs
├── tests/
│   ├── unit/             # Pruebas de reglas y escenarios
│   └── browser/          # Recorrido automatizado con Chromium
├── docs/
│   ├── ARCHITECTURE.md   # Responsabilidades de los módulos
│   ├── LIMITATIONS.md    # Límites funcionales y técnicos
│   └── REFERENCES.md     # Herramientas consultadas
├── index.html            # Entrada y redirección a la aplicación
└── package.json          # Herramientas de desarrollo y pruebas
```

La interfaz está implementada con HTML, CSS y módulos JavaScript nativos. Los gráficos se dibujan en SVG. No hay framework de interfaz, proceso de compilación ni backend para esta demostración.

## Alcance y límites

Para interpretar correctamente esta publicación, tené en cuenta que:

- Todos los registros y valores son **sintéticos** y se generan dentro de la aplicación. No proceden de un vehículo, una ECU, un logger ni un banco real.
- Las curvas son ilustrativas. La potencia se deriva matemáticamente del torque y las RPM sintéticos; esto no constituye un modelo físico validado.
- La aplicación no importa todavía archivos CSV propios.
- No convierte unidades ni demuestra que dos canales representen la misma magnitud física bajo condiciones equivalentes.
- ECU/logger y dinamómetro son fuentes diferentes; no se deben mezclar por defecto.
- Una relación declarada entre registros no demuestra que sus relojes estén sincronizados ni que correspondan al mismo evento físico.
- No escribe, modifica ni programa una ECU; tampoco diagnostica fallas, demuestra causalidad o emite recomendaciones de calibración validadas.

La documentación amplía estos puntos en [Límites de la demo](docs/LIMITATIONS.md) y [Arquitectura](docs/ARCHITECTURE.md).

## Datos y privacidad

La aplicación procesa sus ejemplos localmente en el navegador. No utiliza cuentas, telemetría, servicios de análisis ni solicitudes a APIs externas. La política de seguridad del contenido restringe las conexiones y la prueba de navegador comprueba que la demo no realice solicitudes fuera de su propio servidor local.

El informe JSON se genera en el equipo y contiene un resumen de los escenarios, la matriz de evaluación, los máximos observados y sus limitaciones. No incluye las muestras completas ni rutas locales del sistema.

## Referencias y procedencia

La implementación publicada es una selección acotada propia, preparada para esta demostración. Los proyectos enumerados en [docs/REFERENCES.md](docs/REFERENCES.md) fueron consultados como antecedentes durante la investigación; no son dependencias de ejecución y esta publicación no incluye su código, datos ni recursos gráficos.

## Estado y licencia

Este repositorio es una **demo experimental de portfolio**, no la publicación del producto completo. El desarrollo de funcionalidades para registros reales queda fuera de este alcance hasta contar con datos cuyo uso esté autorizado y una revisión de especialistas.

Por ahora, el repositorio **no incluye una licencia de reutilización**. Que el código sea público permite inspeccionarlo, pero no concede por sí solo permiso general para copiarlo, modificarlo o distribuirlo.

---

<div align="center">

**Datalog Comparison** · Una demostración sobre calidad de evidencia, comparabilidad y límites de interpretación.

</div>
