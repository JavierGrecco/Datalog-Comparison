<div align="center">

# Datalog Comparison

### La evidencia antes que la comparación.

Una demostración técnica para evaluar si dos registros de motor ofrecen una base razonable para compararlos, identificar límites en los datos y explicar cuándo corresponde revisar o bloquear el análisis.

[![Validación de la demo](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JavierGrecco/Datalog-Comparison/actions/workflows/ci.yml)

**Demo experimental · JavaScript · Datos sintéticos · Adaptadores CSV experimentales**

</div>

---

## El problema

Superponer dos curvas no demuestra que las mediciones sean comparables. Antes de interpretar diferencias conviene conocer su origen, calidad temporal, canales, unidades, condiciones de prueba y procedencia.

**Datalog Comparison** explora ese paso previo. La aplicación reúne controles independientes y presenta sus resultados de forma explicable: qué se pudo comprobar, qué requiere revisión y qué incompatibilidad impide continuar.

Es una muestra acotada de ingeniería de software aplicada al análisis de registros de motor. **No es un producto de taller, un sistema de diagnóstico ni una herramienta de calibración.**

## Qué incluye la demostración

La aplicación contiene cuatro escenarios sintéticos generados en memoria:

| Escenario | Qué permite observar |
| --- | --- |
| **Registros completos** | Dos registros del mismo dominio, con canales y unidades declarados. La matriz mantiene la validación real como requisito. |
| **Datos incompletos** | Valores ausentes, cobertura parcial y anomalías en la secuencia temporal. Los datos faltantes no se completan artificialmente. |
| **ECU frente a dinamómetro** | Dos fuentes de evidencia distintas. La política bloquea la comparación numérica conjunta y oculta las curvas superpuestas. |
| **Bases de banco distintas** | Dos resultados de dinamómetro con la misma unidad, uno de rueda y otro referido a motor. Torque y potencia quedan excluidos aunque el origen sea el mismo. |

Además, se puede **inspeccionar un CSV local** mediante tres rutas: CSV genérico, dos layouts experimentales Haltech NSP identificados por %DataLog% (encabezado tipado y bloques Channel/ID/Type), y un perfil guiado para exportaciones CSV Dynojet PowerCore/WinPEP. Los archivos permanecen aislados de la comparación. Se examinó una exportación pública Haltech para validar la estructura de metadatos; el archivo no se incluye ni se redistribuye.

En los escenarios sintéticos compatibles de un mismo dominio se pueden inspeccionar gráficos descriptivos de **torque y potencia frente a RPM**. El caso de bases de banco distintas muestra cómo se excluyen esos canales cuando la magnitud física no coincide. Ambos comparten el eje horizontal y mantienen escalas verticales independientes. La aplicación también permite exportar un resumen de la evaluación sintética en JSON.

### Cómo decide la matriz

Los controles se presentan por separado, sin reducirlos a una puntuación opaca:

- **Origen:** identifica si los registros pertenecen al dominio ECU/logger o dinamómetro.
- **Calidad:** revisa faltantes, cobertura, consistencia de metadatos y secuencia temporal.
- **Canales, unidades y base física:** comprueba qué señales tienen una unidad, cobertura y base de torque/potencia compatibles.
- **Condiciones de operación:** revisa valores, estado de verificación y procedencia declarada.
- **Procedencia:** conserva la información disponible sobre archivos, roles y contexto.

| Resultado | Interpretación |
| --- | --- |
| **Bloqueada** | Existe una incompatibilidad que impide realizar esa comparación. |
| **Revisión necesaria** | Hay advertencias, información incompleta o validaciones pendientes. |
| **Descriptiva** | Solo permite una lectura limitada de los datos observados; no acredita equivalencia física. |

Un resultado descriptivo no certifica que dos ensayos sean equivalentes. La interpretación técnica sigue dependiendo de la evidencia original y de la revisión de una persona con experiencia.

## Importación CSV y perfiles experimentales

**Haltech NSP:** se reconocen dos layouts con marcador %DataLog%: encabezados tipados y bloques de metadatos Channel/ID/Type. El segundo se contrastó con una exportación pública de 114 canales; se aplican nombres exactos y reglas de escala acotadas. Las reglas son comunitarias y no están certificadas por el fabricante.

**Dynojet PowerCore/WinPEP:** el perfil guiado utiliza el parser neutral porque las exportaciones son configurables y no se encontró un CSV crudo público ni un esquema de columnas fijo publicado. El resolver propone coincidencias genéricas que deben confirmarse; también se declara la base física de torque/potencia. No lee archivos nativos de WinPEP o Power Vision.

**CSV genérico:** cuenta con un resolver determinista local, sin IA externa, que propone alias, variantes de nombres, unidades y pistas numéricas. Solo las coincidencias exactas, únicas y dimensionalmente compatibles se preseleccionan para revisión; los errores de tipeo, ambigüedades y pistas por rango requieren confirmación. Las unidades admitidas se normalizan a unidades canónicas con reglas versionadas y se conserva la procedencia. Las columnas desconocidas y datos faltantes no se fuerzan dentro del modelo. Todos los archivos importados permanecen en modo exploratorio, local y aislado de la matriz.

Consultá el [contrato y los perfiles CSV](docs/CSV_IMPORT.md) para conocer conversiones, límites, procedencia y restricciones.

## Ejecutar la aplicación

La demo no necesita una ECU, servicios externos ni dependencias de ejecución. Solo requiere servir los archivos estáticos desde un servidor local. Una opción disponible en muchos equipos es Python:

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
2. **Pruebas unitarias y de contratos:** comprueba escenarios, reglas de origen, unidades, calidad temporal, parser CSV, condiciones operativas, manifiestos, estados de evaluación e informes.
3. **Prueba de navegador:** recorre la entrada del sitio y la interfaz en Chromium, verifica la inspección CSV local, gráficos, bloqueos, selección por teclado, exportación JSON, vista móvil, errores y solicitudes externas.

El workflow de GitHub Actions ejecuta estas validaciones en cada actualización y en las solicitudes de integración. El indicador al comienzo del documento muestra el estado de la última ejecución.

Estas pruebas verifican el comportamiento del software cubierto por ellas; no validan sensores, motores, dinamómetros ni resultados físicos.

## Organización del repositorio

```text
.
├── app/
│   ├── app.mjs
│   ├── csv-inspector.mjs
│   └── styles.css
├── src/
│   ├── csv-import.mjs
│   ├── channel-resolver.mjs
│   ├── unit-registry.mjs
│   ├── adapters/          # Perfiles experimentales ECU/dinamómetro
│   ├── demo-model.mjs
│   ├── comparison-readiness.mjs
│   ├── run-comparability.mjs
│   ├── data-quality.mjs
│   ├── source-policy.mjs
│   ├── operating-conditions.mjs
│   └── run-manifest.mjs
├── tests/
│   ├── fixtures/         # CSV sintéticos
│   ├── unit/             # Pruebas de dominio y parser
│   └── browser/          # Recorrido automatizado con Chromium
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CSV_IMPORT.md
│   ├── CHANNEL_RECOGNITION.md
│   ├── QUALITY_GATES.md
│   ├── ENGINEERING.md
│   ├── LIMITATIONS.md
│   └── REFERENCES.md
├── SECURITY.md
├── index.html
└── package.json
```

La interfaz está implementada con HTML, CSS y módulos JavaScript nativos. Los gráficos se dibujan en SVG. No hay framework de interfaz, proceso de compilación ni backend para esta demostración.

## Arquitectura y criterios de calidad

La implementación separa la presentación de las reglas de dominio. La matriz no calcula un puntaje de confianza: combina comprobaciones identificables de origen, calidad, unidades, condiciones y procedencia.

- [Arquitectura](docs/ARCHITECTURE.md): responsabilidades y flujo entre módulos.
- [Contrato CSV](docs/CSV_IMPORT.md): entrada, límites, mapeo y significado de la vista de inspección.
- [Reconocimiento de canales](docs/CHANNEL_RECOGNITION.md): alias, errores de tipeo, dimensiones, límites de inferencia y perfiles de valores.
- [Puertas de calidad](docs/QUALITY_GATES.md): significado de los estados y criterios de bloqueo/revisión.
- [Notas de ingeniería](docs/ENGINEERING.md): validación, convenciones, política de rama única y definición de terminado.
- [Límites de la demo](docs/LIMITATIONS.md): alcance funcional y técnico.
- [Referencias consultadas](docs/REFERENCES.md): antecedentes revisados durante la investigación.

## Alcance y límites

- Todos los escenarios de comparación y sus curvas son **sintéticos**.
- Los CSV importados son datos aportados por quien ejecuta la demo. Su origen y unidades son declaraciones, no datos autenticados.
- Haltech NSP reconoce dos layouts experimentales de CSV con marcador %DataLog% (encabezado tipado y bloques Channel/ID/Type); no representa compatibilidad universal.
- Dynojet PowerCore/WinPEP utiliza mapeo guiado y no lee archivos nativos ni presupone un esquema fijo. No se encontró una exportación CSV cruda pública para validarlo de extremo a extremo.
- La importación no habilita comparación entre dos archivos.
- No demuestra equivalencia física, sincroniza relojes ni prueba que dos señales representen la misma magnitud. La normalización de unidades admitidas queda registrada.
- ECU/logger y dinamómetro son fuentes diferentes; no se deben mezclar por defecto.
- No escribe, modifica ni programa una ECU; tampoco diagnostica fallas, demuestra causalidad o emite recomendaciones de calibración validadas.

## Datos y privacidad

La aplicación procesa los ejemplos localmente en el navegador. La inspección CSV también es local y no utiliza cuentas, telemetría, servicios de análisis ni solicitudes a APIs externas. La política de seguridad del contenido restringe conexiones salientes.

Los CSV se mantienen en memoria de la sesión y se descartan al limpiar la vista o recargar. No se exportan sus muestras ni se agregan a los informes sintéticos.

## Referencias y procedencia

La implementación publicada es una selección acotada propia, preparada para esta demostración. Los proyectos enumerados en [docs/REFERENCES.md](docs/REFERENCES.md) fueron consultados como antecedentes durante la investigación; no son dependencias de ejecución y esta publicación no incluye su código, datos ni recursos gráficos.

## Estado y licencia

Este repositorio es una **demo experimental de portfolio**, no la publicación del producto completo. Los adaptadores específicos son perfiles experimentales y no están certificados por los fabricantes.

Por ahora, el repositorio **no incluye una licencia de reutilización**. Que el código sea público permite inspeccionarlo, pero no concede por sí solo permiso general para copiarlo, modificarlo o distribuirlo.

---

<div align="center">

**Datalog Comparison** · Una demostración sobre calidad de evidencia, comparabilidad y límites de interpretación.

</div>
