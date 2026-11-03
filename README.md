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
| **Registros sintéticos completos** | Dos registros del mismo dominio, con canales y unidades declarados. La matriz mantiene la validación real como requisito. |
| **Datos incompletos** | Valores ausentes, cobertura parcial y anomalías en la secuencia temporal. Los datos faltantes no se completan artificialmente. |
| **ECU frente a dinamómetro** | Dos fuentes de evidencia distintas. La política bloquea la comparación numérica conjunta y oculta las curvas superpuestas. |

En los escenarios del mismo dominio se pueden inspeccionar gráficos descriptivos de **torque y potencia frente a RPM**. Ambos comparten el eje horizontal y mantienen escalas verticales independientes. La aplicación también permite exportar un resumen de la evaluación en JSON.

### Cómo decide la matriz

Los controles se presentan por separado, sin reducirlos a una puntuación opaca:

- **Origen:** identifica si los registros pertenecen al dominio ECU/logger o dinamómetro.
- **Calidad:** revisa faltantes, cobertura, consistencia de metadatos y secuencia temporal.
- **Canales y unidades:** comprueba qué señales tienen una base declarada compatible.
- **Condiciones de operación:** revisa valores, estado de verificación y procedencia declarada.
- **Procedencia:** conserva la información disponible sobre archivos, roles y contexto.

| Resultado | Interpretación |
| --- | --- |
| **Bloqueada** | Existe una incompatibilidad que impide realizar esa comparación. |
| **Revisión necesaria** | Hay advertencias, información incompleta o validaciones pendientes. |
| **Descriptiva** | Solo permite una lectura limitada de los datos observados; no acredita equivalencia física. |

Un resultado descriptivo no certifica que dos ensayos sean equivalentes. La interpretación técnica sigue dependiendo de la evidencia original y de la revisión de una persona con experiencia.

## Ejecutar la aplicación

La demo no necesita una ECU, archivos de registro, servicios externos ni dependencias de ejecución. Solo requiere servir los archivos estáticos desde un servidor local. Una opción disponible en muchos equipos es Python:

```bash
git clone https://github.com/JavierGrecco/Datalog-Comparison.git
cd Datalog-Comparison
python3 -m http.server 8000
```

Abrí [http://127.0.0.1:8000/](http://127.0.0.1:8000/) en el navegador. La página de inicio dirige a la aplicación ubicada en `app/`.

**Python no forma parte del motor ni de la arquitectura del producto:** se utiliza únicamente como servidor estático de desarrollo. Puede reemplazarse por cualquier servidor HTTP local equivalente.

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
2. **Pruebas unitarias y de contratos:** comprueba escenarios, reglas de origen, unidades, calidad temporal, condiciones operativas, manifiestos, estados de evaluación e informes.
3. **Prueba de navegador:** recorre la entrada del sitio y la interfaz en Chromium, verifica gráficos, bloqueos, selección por teclado, exportación JSON, vista móvil, errores, recursos inexistentes y solicitudes externas.

El workflow de GitHub Actions ejecuta estas validaciones en cada actualización y en las solicitudes de integración. El indicador al comienzo del documento muestra el estado de la última ejecución.

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
│   ├── unit/             # Pruebas de dominio y contratos
│   └── browser/          # Recorrido automatizado con Chromium
├── docs/
│   ├── ARCHITECTURE.md
│   ├── QUALITY_GATES.md
│   ├── ENGINEERING.md
│   ├── LIMITATIONS.md
│   └── REFERENCES.md
├── SECURITY.md
├── index.html            # Entrada segura y redirección estática
└── package.json          # Herramientas de desarrollo y pruebas
```

La interfaz está implementada con HTML, CSS y módulos JavaScript nativos. Los gráficos se dibujan en SVG. No hay framework de interfaz, proceso de compilación ni backend para esta demostración.

## Arquitectura y criterios de calidad

La implementación separa la presentación de las reglas de dominio. La matriz no calcula un puntaje de confianza: combina comprobaciones identificables de origen, calidad, unidades, condiciones y procedencia.

- [Arquitectura](docs/ARCHITECTURE.md): responsabilidades y flujo entre módulos.
- [Puertas de calidad](docs/QUALITY_GATES.md): significado de los estados y criterios de bloqueo/revisión.
- [Notas de ingeniería](docs/ENGINEERING.md): validación, convenciones y definición de terminado.
- [Límites de la demo](docs/LIMITATIONS.md): alcance funcional y técnico.
- [Referencias consultadas](docs/REFERENCES.md): antecedentes revisados durante la investigación.

## Alcance y límites

Para interpretar correctamente esta publicación, tené en cuenta que:

- Todos los registros y valores son **sintéticos** y se generan dentro de la aplicación. No proceden de un vehículo, una ECU, un logger ni un banco real.
- Las curvas son ilustrativas. La potencia se deriva matemáticamente del torque y las RPM sintéticos; esto no constituye un modelo físico validado.
- La aplicación no importa todavía archivos CSV propios.
- No convierte unidades ni demuestra que dos canales representen la misma magnitud física bajo condiciones equivalentes.
- ECU/logger y dinamómetro son fuentes diferentes; no se deben mezclar por defecto.
- Una relación declarada entre registros no demuestra que sus relojes estén sincronizados ni que correspondan al mismo evento físico.
- No escribe, modifica ni programa una ECU; tampoco diagnostica fallas, demuestra causalidad o emite recomendaciones de calibración validadas.

La documentación amplía estos puntos en [Límites de la demo](docs/LIMITATIONS.md) y [Puertas de calidad](docs/QUALITY_GATES.md).

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
