# Protocolos de ensayo y repetibilidad

## Propósito y límites

Este módulo convierte condiciones de ensayo y repeticiones en controles reproducibles. No es un software de certificación SAE/ISO, no sustituye el manual del banco y no calcula incertidumbre metrológica completa. Los estados `measured` y `verified` conservan lo declarado por la fuente o por quien carga el ensayo; la aplicación no autentica el sensor ni el documento.

## Perfiles separados

### ECU / logger

- `steady_state`: exige identificación de calibración y combustible, temperaturas de admisión y refrigerante con fuente, un punto objetivo explícito de RPM y carga/acelerador y tiempo de estabilización declarado.
- `transient`: exige vehículo/motor, calibración, combustible y temperatura ambiente con fuente. La evaluación temporal y sincronización de señales permanece en las puertas de calidad existentes.
- Dos logs ECU no son repetibles solo porque sus máximos coinciden. Deben representar el mismo protocolo y punto operativo.
- El evaluador compara los valores efectivos de RPM y carga/acelerador en todas las repeticiones, no solo el identificador del punto. En un protocolo estacionario ECU, el tiempo de estabilización y las temperaturas de admisión/refrigerante también deben coincidir para agruparse como una configuración idéntica.

### Dinamómetro

Los modos aceptados son `inertia_sweep`, `loaded_sweep` y `steady_state`. El protocolo distingue dos tipos de banco mediante `dyno_type`:

- **Banco de motor**: mide en el cigüeñal o salida del motor; su base debe declararse como `engine`. No exige marcha, neumáticos, presión de neumáticos ni sujeción del vehículo.
- **Banco de chasis**: mide a través del tren de transmisión; su base debe declararse explícitamente como `wheel`, `hub` o `roller`. Todas las bases requieren marcha y configuración de sujeción. Las bases `wheel` y `roller` requieren medida, presión y estado de neumáticos. La base `hub` no exige datos de neumáticos, pero sí la identificación de adaptadores y fijación del cubo.

Ambos perfiles requieren identificar vehículo/motor, combustible, método, modelo, modo de carga, estándar o condición de corrección, ventilación, calibración de instrumentos y condiciones ambientales: temperatura, presión barométrica y humedad relativa. Los modos de barrido requieren además rampa y suavizado; esos campos no se exigen en un punto estacionario.

Una clasificación ausente, incompatible o mezclada bloquea el protocolo. El evaluador también compara el rango RPM efectivo de cada barrido y el punto RPM/carga en un ensayo estacionario, aunque se repita el mismo `operatingPointId`. Las condiciones ambientales se comparan entre tiradas; si cambian, el grupo requiere revisión y no se presenta como configuración idéntica.

No se convierten ni mezclan bases de motor, rueda, cubo o rodillo: una curva de banco de motor tampoco es intercambiable con una medición de banco de chasis.

## Repetibilidad

La V1 calcula por métrica media, desviación estándar muestral, coeficiente de variación (CV = 100 × s / |media|) y rango relativo (100 × (máximo − mínimo) / |media|).

Se requieren tres repeticiones por defecto. Es una decisión de política inicial inspirada en un caso experimental publicado, no una obligación universal. El límite `maximumCvPct` debe configurarlo el taller según métrica, instrumento, banco y método. Si no se configura, el resultado es `threshold_not_configured`: se informa la dispersión, no se aprueba.

Cada métrica debe estar presente en todas las repeticiones que integran el grupo. Si falta un valor, el resultado informa cuántos valores válidos y faltantes hay; cuando el mínimo de observaciones se alcanza solo con una parte del grupo, el estado es `incomplete_replicates` y exige revisión. No se debe presentar un CV calculado con datos parciales como repetibilidad del conjunto completo.

Cada adquisición debe conservar un identificador de registro propio y no vacío. El evaluador bloquea el grupo si falta un ID o si se repite: copiar una misma adquisición con otro lugar en la lista no la convierte en una repetición independiente. Los IDs se comparan después de quitar espacios externos; se conserva la distinción entre mayúsculas y minúsculas porque son identificadores opacos.

### Métricas esperadas

El contrato acepta `options.expectedMetrics`, una lista explícita de claves como `["power_kw", "torque_nm", "lambda"]`. Esas claves se evalúan aunque no aparezcan en ningún objeto `metrics`. Así, una métrica ausente en todas las adquisiciones se informa con cero valores válidos y un faltante por repetición; no desaparece silenciosamente del análisis.

También se consideran declaradas las claves presentes con valores `null`, `undefined`, infinitos o no numéricos: no cuentan como observaciones válidas. Si no se conoce el conjunto esperado, el sistema solo puede revisar las claves que estén presentes al menos una vez. No inventa un catálogo universal de señales obligatorias: el perfil de ECU, el fabricante, los sensores instalados y el objetivo del ensayo determinan ese contrato.

### Tolerancias de condiciones

Por defecto, las condiciones numéricas se comparan exactamente, como hasta ahora. Se puede declarar `options.setupTolerances` con una tolerancia absoluta para campos numéricos conocidos, por ejemplo `{"ambient_pressure_kpa": 0.2, "coolant_temp_c": 1}`. La unidad es la propia del campo (`kPa`, `°C`, `%`, etc.); no se interpreta como porcentaje relativo.

La tolerancia solo se aplica a la evaluación de igualdad de configuración entre repeticiones. No cambia los valores originales, no promedia condiciones ni altera las métricas. Una tolerancia debe justificarse según sensor, método, resolución y objetivo del ensayo. No hay valores predefinidos universales; una tolerancia no configurada sigue siendo cero. Los campos de texto y selección no admiten tolerancias. El constructor guiado permite ingresarlas como JSON en el campo de tolerancias; el evaluador valida los nombres y rechaza campos de texto, valores negativos y números no finitos. La aceptación se mide por la dispersión máxima entre todas las repeticiones, no contra el primer registro de la lista, para que el resultado no dependa del orden en que se ingresaron. Cuando se declara una tolerancia positiva, la comparación contempla una pequeña holgura de precisión de punto flotante para evitar rechazar un valor situado exactamente en el umbral por redondeo binario. Con tolerancia cero, la comparación sigue siendo exacta.

Si la media de una métrica es cero, el CV no se puede calcular. Con un límite de CV configurado, ese caso queda en revisión (`not_calculable`) y no se presenta como aprobado. Para métricas que pueden tomar valores cercanos a cero, el taller debe definir una evaluación absoluta adecuada; el sistema no inventa un umbral de reemplazo.

Se puede establecer un límite general `options.maximumCvPct` y sobrescribirlo por magnitud mediante `options.maximumCvPctByMetric`, por ejemplo `{"torque_nm": 2, "lambda": 0.5}`. Los valores son porcentajes de CV. El límite por métrica prevalece sobre el general. Una métrica sin límite propio ni general permanece en `threshold_not_configured`; no se interpreta como aprobada. Esto evita aplicar el mismo criterio a magnitudes y sensores con comportamiento distinto.

El cálculo estadístico normaliza las muestras antes de calcular media, dispersión y CV, para no desbordar la suma con datos finitos grandes. Si la media es cero o el CV no puede representarse como número finito, el resultado queda como `not_calculable` y requiere revisión. 

El CV no detecta sesgo sistemático, deriva del sensor ni error de calibración. Tampoco equivale a incertidumbre expandida. No comparar valores de diferentes puntos operativos como si fueran réplicas.

## Caso público usado para diseñar pruebas

Wahyudi, Putri e Ibrahim (2026), DOI [10.38038/vocatech.v8i2.359](https://doi.org/10.38038/vocatech.v8i2.359), describen un motor SI 1.6 L con Motec M130, dinamómetro de motor Schenck Dynas3 LI 250, 288 condiciones estacionarias, tres adquisiciones por condición y estabilización mínima de cinco minutos. Informan refrigerante a 80 ± 2 °C y combustible RON 92. La comparación integrada se limita a 3000 RPM y carga plena para mantener un punto común entre métricas.

El fixture `examples/test-protocol-ecu-steady-state.synthetic.json` reproduce únicamente la estructura del protocolo. Sus valores son sintéticos y sirven para comprobar el contrato y el cálculo del CV. No contiene datos extraídos del artículo.

## Caso de dinamómetro público pendiente de inspección

Parmar et al. (2024), [Mendeley Data](https://data.mendeley.com/datasets/cb2wjcd2st/1), DOI 10.17632/cb2wjcd2st.1, CC BY 4.0, describe archivos de adquisición cruda de un dinamómetro de motor SI monocilíndrico a cuatro cargas. Se registra en `data/sources.json` como fuente candidata. No se incorpora todavía ningún archivo: primero se debe descargar, revisar formato, unidades, separar datos medidos y teóricos, confirmar ejes y calcular su hash. La página descriptiva no permite afirmar que sean barridos RPM o series temporales.

## Uso

```bash
npm run assess:protocol -- examples/test-protocol-ecu-steady-state.synthetic.json
```

El comando también admite stdin con `-`. Entrada máxima: 2 MiB. Código de salida 0 = controles configurados completados; 1 = revisión/bloqueo; 2 = error de entrada o uso. La salida JSON incluye hallazgos, campos requeridos y estadísticas por métrica.


## Captura guiada en la interfaz

La sección de protocolos permite generar un expediente sin editar JSON a mano. Selecciona dominio y modo, solicita el punto o tramo operativo, condiciones requeridas y el estado/fuente de cada una. Los campos desconocidos se mantienen como null; no se autocompletan ni se elevan a medidos. Las métricas se ingresan como arreglos numéricos con un valor por repetición y se asignan en orden.

La captura guiada comparte las condiciones declaradas entre las repeticiones que se están agrupando. El mínimo predeterminado se mantiene en tres repeticiones: cargar solo dos permite inspeccionar los datos, pero el resultado advierte que no alcanza el mínimo de repetibilidad configurado. Si una condición cambia entre tiradas, deben crearse grupos separados o usarse expedientes individuales; no se debe forzar una condición común. El JSON generado queda visible para revisión y exportación manual. La evaluación se ofrece como artefacto derivado pendiente y solo se incorpora al expediente local cuando la persona lo guarda explícitamente. El artefacto conserva la entrada y el resultado; no modifica CSV originales.
