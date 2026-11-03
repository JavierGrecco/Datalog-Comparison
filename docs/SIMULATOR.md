# Simulación de telemetría y ECU virtual

El repositorio ofrece dos herramientas complementarias y separadas:

1. **Generador local de CSV:** modelo sintético propio, determinista y sin dependencias, pensado para probar el importador y la calidad de datos.
2. **Speeduino Serial Simulator:** simulador externo de una ECU compatible con protocolo Speeduino, útil para ensayar adquisición, comunicación serial/TCP y logging con software de terceros.

Ninguna de las dos herramientas convierte una simulación en una medición real o en una prueba de banco.

## 1. Generador local de CSV

El módulo `src/simulated-telemetry.mjs` produce una secuencia genérica para un motor atmosférico de cuatro cilindros y 2,0 L. Es un modelo ilustrativo, no está calibrado contra un motor concreto ni replica la estrategia de una ECU de marca. No genera canales de torque o potencia: el objetivo es probar señales ECU/OBD, no fingir una medición de dinamómetro.

### Perfiles

| Perfil | Comportamiento | Para qué sirve |
| --- | --- | --- |
| `ecu` | Muestras sincronizadas y uniformes, 20 Hz por defecto. Todos los canales se actualizan en cada fila. | Parser, gráficos, análisis temporal y pruebas de una base temporal uniforme. |
| `obd` | Eventos asíncronos: grupo rápido cada 1 s, medio cada 15 s y lento cada 30 s, con pequeños desfases entre grupos. Las celdas de los otros canales quedan vacías. | Cobertura parcial, faltantes, frecuencia por canal y límites de una adquisición OBD por polling. |

La secuencia `road-test` contiene arranque, calentamiento/ralentí, carga parcial, aceleración a plena carga con cambio de marcha, crucero, retención con corte de combustible (DFCO) y vuelta al ralentí. `sensor-dropout` agrega ventanas de pérdida de MAF y presión de admisión para probar discontinuidades.

### Ejecutar

Desde la raíz del repositorio, con Node.js 22 o posterior:

```bash
# Log ECU uniforme de 120 s a 20 Hz, semilla 42
npm run simulate:telemetry -- --profile ecu --scenario road-test --duration 120 --rate 20 --seed 42

# Mismo recorrido con pérdida de señales
npm run simulate:telemetry -- --profile ecu --scenario sensor-dropout --duration 120 --rate 20 --seed 42

# Flujo OBD con PIDs asíncronos y celdas vacías
npm run simulate:telemetry -- --profile obd --duration 180 --seed 42
```

Cada ejecución genera dos archivos bajo `data/generated/`:

- `*.csv`: muestras para cargar manualmente desde el inspector CSV local.
- `*.csv.metadata.json`: versión del generador, perfil, escenario, semilla, frecuencia, unidades, cantidad de actualizaciones por canal, limitaciones y SHA-256 del CSV.

`data/generated/` está excluido de Git. No se suben los resultados generados ni se mezclan con los escenarios sintéticos internos de la matriz de comparación. La misma configuración y semilla producen las mismas filas y el mismo contenido CSV.

El perfil `obd` es intencionalmente irregular: los valores que no se actualizaron se dejan vacíos. El importador debe conservarlos; no se debe imputar, interpolar ni aplicar el FIR de tiempo uniforme directamente sobre esas filas. Las frecuencias son un escenario de prueba inspirado en grupos de polling OBD, no una reproducción exacta del vehículo del dataset Opel.

### Canales y límites

El CSV incluye tiempo, RPM, velocidad, acelerador, carga, presión y temperatura de admisión, MAF, trims, O2, refrigerante, tensión, avance, ancho de pulso de inyección, VE, marcha/estado y DFCO. La tabla `data/sources.json` distingue el generador propio de fuentes medidas o externas.

Las señales se correlacionan mediante un modelo matemático simple (presión/carga/flujo de aire/régimen/combustible y una respuesta térmica básica). Esto resulta útil para comprobar consistencia de software, rangos, estados, exportaciones y faltantes. No valida sensores, combustión real, tablas VE/ignición, torque, potencia, corrección atmosférica ni resultados SAE.

## 2. Speeduino Serial Simulator (integración externa)

[Repositorio upstream](https://github.com/askrejans/speeduino-serial-sim) · código bajo MIT. No se copia ni se incorpora como dependencia de Datalog Comparison.

La versión consultada ofrece un target nativo para macOS/Linux (`native`), emula el protocolo serial Speeduino 202501 y transmite telemetría por TCP o pseudo-terminal. El proyecto describe un hatchback 1,8 L 16 válvulas con modelo de motor, caja, conductor y lógica ECU; permite conectar TunerStudio y loggers compatibles. Es una capa de prueba más cercana al flujo real de adquisición que un CSV generado offline.

### Compilar y ejecutar en macOS/Linux

Instalá Git, un compilador C/C++ disponible en el sistema y PlatformIO Core. Después, cloná el proyecto por separado y compilá el target de escritorio:

```bash
git clone https://github.com/askrejans/speeduino-serial-sim.git
cd speeduino-serial-sim
pio run -e native
.pio/build/native/program --speed 1
```

El README upstream documenta `--speed`, `--pace`, `--laps`, `--ambient`, `--coolant`, `--no-launch` y `--no-noise`, además de la opción `--pty`. El modo nativo publica el endpoint TCP local en el puerto 5000; consultá el README upstream de la versión que hayas clonado antes de automatizar la conexión.

### Conectar un logger

1. Ejecutá primero el simulador nativo y mantené el proceso abierto.
2. En TunerStudio, seleccioná el perfil/INI correspondiente a Speeduino 202501 y conectá al host local `127.0.0.1`, puerto `5000`, según el tipo de conexión TCP que admita la versión instalada.
3. Comprobá que RPM, MAP, TPS, temperaturas y demás canales cambien durante la sesión.
4. Iniciá un datalog desde el logger compatible y conservá el archivo original.
5. Cuando dispongas de una exportación CSV compatible, inspeccionala localmente en Datalog Comparison. Guardá junto al archivo la versión/commit del simulador, opciones utilizadas, perfil ECU y herramienta/versión de logging.

La compatibilidad del protocolo no significa que la ECU virtual sea un objetivo de calibración. El proyecto upstream advierte que las páginas de tune no representan un mapa real y que las señales provienen del modelo. Temperaturas, presiones y tiempos son plausibles según ese modelo; no son una grabación de un vehículo concreto.

### Licencias y procedencia

La licencia MIT de upstream corresponde al código del simulador. El README identifica por separado datos de circuito procedentes de OpenStreetMap bajo ODbL-1.0. No se encontró una licencia separada que cubra los logs generados por el simulador; por eso el proyecto no distribuye ni atribuye automáticamente una licencia MIT a esos CSV. Usalos localmente para pruebas hasta confirmar las condiciones aplicables al resultado que quieras publicar.

## 3. Qué validar con cada herramienta

| Capacidad | CSV local `ecu` | CSV local `obd` | Speeduino externo |
| --- | --- | --- | --- |
| Parser CSV / unidades / alias | Sí | Sí | Depende de la exportación del logger |
| Calidad temporal uniforme | Sí | No: irregular por diseño | Según el logger/exportación |
| Frecuencia y faltantes por canal | Sí, con escenario de dropout | Sí, por actualización asíncrona | Depende del log capturado |
| Estados de motor / aceleración / retención | Sí, modelo genérico | Sí, a baja resolución | Sí, estrategia/modelo upstream |
| Protocolo ECU y conexión serial/TCP | No | No | Sí, Speeduino 202501 |
| Torque/potencia de dinamómetro medidos | No | No | No |

Para validar curvas de banco necesitamos un dataset de dinamometro con estructura, unidades, eje RPM y condiciones revisadas. La fuente Mendeley listada en [PUBLIC_DATASETS.md](PUBLIC_DATASETS.md) es candidata, pero sus archivos todavía deben inspeccionarse antes de usarla como fixture.
