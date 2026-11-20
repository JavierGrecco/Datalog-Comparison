# Plan de adaptador MoTeC .ld/.ldx

## Estado

**Investigación completada; integración pendiente de evidencia de datos y validación técnica.**

La prioridad técnica es evaluar el core Rust de [i3rs](https://github.com/Friss/i3rs) como parser de solo lectura para registros MoTeC M1. La revisión se realizó sobre el commit upstream `c5e8e03d9244db7898acd247bae919be4a79cc9c`; el workspace declara la versión `0.4.0` y licencia MIT para el código.

No se incorporó código i3rs, ningún log de muestra upstream ni archivos propietarios al repositorio. La licencia MIT del software no concede automáticamente derechos sobre los datos contenidos en sus fixtures.

## Registro de práctica localizado

Se localizó el hilo público de High Performance Academy [“Example Logged Data and Software Tools Download”](https://www.hpacademy.com/es/foro/tutorial-del-software-motec-m1-1/show/example-logged-data-and-software-tools-download/). El tutor Tim White indica que el curso pone a disposición registros de ejemplo de varios sistemas, incluido MoTeC, para descargarlos y practicar. El enlace de descarga publicado es [03-MOTEC-EXAMPLE-LOGGED-DATA.zip](https://www.hpacademy.com/assets/Course-Content/Data-Fundamentals-/c6d3af1dbb/03-MOTEC-EXAMPLE-LOGGED-DATA.zip).

**Alcance de la autorización:** la publicación expresa que el archivo se ofrece para descarga y práctica. No encontramos una licencia de datos ni permiso explícito para volver a publicar o redistribuir el ZIP. Por eso se lo considera apto para pruebas locales de aprendizaje, pero no se debe subir el archivo, sus contenidos ni copias derivadas al repositorio público o a los artefactos de CI sin autorización adicional.

**Identificación pendiente:** el hilo está dentro de la sección del tutorial MoTeC M1 y describe el archivo como registro MoTeC, pero el texto público consultado no identifica el modelo exacto de ECU que generó ese log. Antes de etiquetarlo como un registro M1 hay que descargarlo, inspeccionar los metadatos en i2 y comprobar que el parser puede leerlo. Hasta entonces es un candidato MoTeC, no un fixture M1 confirmado.

MoTeC también informa que M1 Tune es gratuito y trae un *sample package* para examinar. La página oficial describe ese paquete como material de M1 Tune; no lo confundimos con un archivo de telemetría `.ld` ya validado. El flujo oficial de recuperación M1 convierte la imagen de logging a un archivo listo para i2, según la [documentación de MoTeC](https://help.motec.com.au/m1/tune/1.5/Topics/Retrieve_Logged_Data_1.5.html).

## Alternativas oficiales y puente de importación

La documentación de MoTeC confirma tres caminos distintos que no deben confundirse:

### Recuperación y exportación desde M1 Tune / i2

- M1 Tune recupera los sistemas de logging desde la ECU y convierte la imagen recuperada en un archivo de log listo para abrir en i2. El flujo está documentado por [MoTeC: Retrieve Logged Data](https://help.motec.com.au/m1/tune/1.5/Topics/Retrieve_Logged_Data_1.5.html).
- M1 Tune 1.5 también permite exportar telemetría del gráfico temporal a un archivo `.ld`. MoTeC indica que esa exportación puede alcanzar hasta 50 Hz y depende de las opciones de logging habilitadas en la ECU. No asumir que toda exportación equivale al archivo original completo o conserva todos los canales/tasas del registro recuperado.
- i2 puede exportar datos de canales a CSV, archivos MoTeC o MATLAB. Como puente inicial, se puede abrir el log en i2 y exportar un CSV para usar el importador existente. Esta vía es manual y debe etiquetarse como **CSV exportado desde i2**, no como lectura nativa de `.ld`. Antes de usarla para análisis cuantitativo hay que contrastar encabezados, unidades, faltantes, timestamps y cualquier re-muestreo que i2 haya aplicado.
- M1 Tune 1.5 puede importar datos de i2 Pro para revisión offline. MoTeC advierte que en ese recorrido no hay comprobación de errores de los datos importados y que el mapeo de canales se realiza por coincidencia de nombre. No debemos adoptar esa coincidencia como validación física en nuestro resolver.

Fuentes oficiales: [MoTeC M1 Logged Data Import/Export](https://help.motec.com.au/m1/tune/1.5/Topics/Logged_Data_Importing_Exporting_1.5.html) y [MoTeC i2](https://www.motec.com.au/products/I2).

### API oficial de MoTeC i2

MoTeC ofrece la licencia Feature Licence **#22021 i2 API**. Su documentación indica que habilita una interfaz programática accesible desde lenguajes compatibles con COM y que permite cargar archivos `.ld`, leer canales, rangos, laps, beacons y detalles, además de crear/guardar logs.

Es una alternativa oficial para una integración de escritorio en Windows con i2 instalado y licencia habilitada. No es un parser web autocontenido: suma dependencia de software comercial, activación, COM y entorno Windows. Por seguridad, una integración futura podría exponer solo operaciones de lectura y deshabilitar cualquier función de creación o guardado. Antes de evaluarla hay que confirmar con MoTeC el alcance y las condiciones de esa licencia para el uso previsto.

Fuente oficial: [MoTeC i2 — sección i2 API](https://www.motec.com.au/products/I2#licences).

### Comparación de opciones

| Camino | Ventaja | Límite principal | Uso recomendado |
| --- | --- | --- | --- |
| i3rs local/WASM | Parser independiente, sin requerir i2 en ejecución; conserva canales nativos multi-rate según su modelo | Requiere validación con logs reales autorizados, pruebas de seguridad y revisión de licencia de dependencias | Candidato para integrar lectura nativa en la demo |
| Exportar CSV desde i2 | Permite probar el flujo existente sin implementar un parser binario | Es una exportación derivada; puede perder contexto o alterar la base temporal | Puente manual de validación mientras se investiga el formato |
| API oficial i2 | Acceso soportado por MoTeC a canales y metadatos del .ld | Licencia adicional, i2 Pro/COM y entorno Windows | Posible conector de escritorio/servicio local, no dependencia del frontend web |

## Registros públicos adicionales y estado de sus permisos

Además del paquete de práctica de High Performance Academy, se revisaron dos repositorios con archivos M1:

- [Purdue Formula SAE — MoTeC](https://github.com/purduefsae/MoTeC) contiene carpetas `Logged Data` y `M1`, y pares de archivos `.ld/.ldx`. El repositorio no declara una licencia general de reutilización de los datos.
- [i3rs](https://github.com/Friss/i3rs) mantiene `test_data/VIR_LAP.ld` y su sidecar `.ldx`, descritos por sus autores como un registro MoTeC M1. El repositorio tiene licencia MIT para su código, pero no encontramos una licencia de datos separada para esas muestras.

Ambos son **candidatos para solicitar permiso**, no fixtures autorizados. No descargamos ni incorporamos esos registros. La visibilidad pública de un archivo no concede automáticamente permiso para copiarlo, procesarlo en nuestro proyecto ni redistribuirlo. Si conseguimos autorización, hay que registrar su alcance exacto (uso local, pruebas CI y redistribución son permisos diferentes), procedencia y hash antes de integrarlo.

## Por qué i3rs es el candidato prioritario

El core expone:

- `LdFile::from_bytes(Vec<u8>)`: analiza el contenido binario sin exigir una ruta del sistema de archivos; es adecuado para estudiar una carga desde el navegador.
- `LdFile::read_channel_data(&ChannelMeta)`: devuelve muestras decodificadas y escaladas a `f64`.
- Metadatos por canal: nombre, nombre corto, unidad, frecuencia de muestreo, cantidad declarada de muestras, tipo de dato, decimales y etiquetas enum.
- Máscaras de validez: las muestras marcadas como inválidas se conservan en su posición como NaN, en lugar de compactar el vector.
- `LdxFile::parse(&str)`: permite analizar el sidecar XML desde texto recibido en memoria.
- CLI con salida estructurada: `summary`, `channels`, `laps`, `extract`, `stats` y `compare-laps` en JSON/CSV/NDJSON.
- El proyecto upstream documenta una build WebAssembly de su aplicación y sus workflows incluyen una compilación para `wasm32-unknown-unknown`.

Esto no significa que cualquier archivo MoTeC sea compatible. La documentación de formato de i3rs describe el formato M1 y sus autores dicen haberlo contrastado con logs de unidades concretas. El primer alcance posible debe nombrarse **MoTeC M1 .ld/.ldx experimental**, no “todos los formatos MoTeC”.

## El problema de los canales multi-rate

Un log puede contener canales de distintas frecuencias, por ejemplo 1, 10, 20 o 50 Hz. Cada canal puede tener una cantidad de muestras y un eje nativo diferente.

El importador CSV actual construye filas compartidas (`samples[]`) con canales que se interpretan en una misma muestra. No se debe convertir un archivo MoTeC directamente a ese contrato porque sería necesario elegir un reloj maestro y decidir cómo alinear señales más lentas o más rápidas. Una interpolación automática podría crear valores que nunca fueron observados.

La primera integración debe conservar una representación por canal, sin alinear ni rellenar:

```json
{
  "schema": "datalog-native-motec/1",
  "source": {
    "format": "motec-m1-ld",
    "fileSizeBytes": 0,
    "sha256": "..."
  },
  "session": {},
  "channels": [
    {
      "sourceIndex": 0,
      "sourceName": "Engine Speed",
      "sourceUnit": "rpm",
      "frequencyHz": 20,
      "sampleCountDeclared": 3,
      "dataType": "float32",
      "enumLabels": {},
      "samples": [1800, 1810, null]
    }
  ],
  "sidecar": {
    "format": "motec-ldx",
    "laps": []
  }
}
```

El ejemplo es un contrato ilustrativo, no un fixture real ni una salida copiada de i3rs. Los campos exactos y los límites se deben formalizar en un JSON Schema antes de desarrollar el adaptador.

### Reglas del contrato

- Mantener el nombre, unidad y tipo originales junto al canal normalizado cuando exista un mapeo confirmado.
- Conservar `frequencyHz`, `sampleCountDeclared` y el orden de origen del canal.
- Conservar las posiciones de muestras inválidas como `null`; nunca eliminarlas, compactarlas ni sustituirlas por cero.
- No asumir que la frecuencia declarada garantiza que el sensor haya adquirido un valor válido.
- No inventar una serie temporal unificada. El eje de cada muestra será `sampleIndex / frequencyHz` solo cuando el parser confirme la frecuencia y el origen temporal.
- Conservar metadatos del sidecar `.ldx` por separado; no asumir que siempre está presente ni que describe todos los laps.
- Las propuestas de asignación a IDs canónicos usarán el resolver existente y sus reglas de unidad. Las coincidencias difusas, ambiguas o basadas solo en el nombre permanecerán para confirmación.
- No aplicar conversión de unidades si el símbolo es desconocido o dimensionalmente incompatible.
- No mezclar señales de motor, rueda, cubo o rodillo por compartir un nombre o una unidad.

## Flujo propuesto

1. **Selección local:** aceptar un `.ld` y, opcionalmente, su `.ldx` asociado. La interfaz no los sube a ningún servicio.
2. **Límites previos:** validar extensión informativa, tamaño, número de canales y límites de memoria antes de instanciar WASM. La extensión no sustituye la validación del contenido binario.
3. **Huella de origen:** calcular SHA-256 de los bytes originales y conservar nombre/tamaño como metadatos no autenticados.
4. **Lectura aislada:** invocar únicamente la ruta de parsing desde bytes; el adaptador no expondrá ni invocará funciones de escritura del upstream.
5. **Validación:** comprobar límites de punteros, cantidad de canales, longitud por canal, frecuencia, tipos soportados, finitud y máscara de validez. Un canal no decodificable no se debe reinterpretar como datos válidos.
6. **Normalización:** proponer el mapeo a señales canónicas mediante nombres, unidades y contexto. Requerir revisión donde no haya evidencia suficiente.
7. **Inspección nativa:** graficar cada canal en su propio eje temporal. Si se muestran canales juntos, cada serie debe conservar su unidad/frecuencia y la vista debe dejar claro que las tasas son distintas.
8. **Derivación explícita:** un remuestreo entre canales solo puede existir como operación separada, con eje maestro, interpolación, política de faltantes y método versionados. Nunca se ejecuta al importar.
9. **Persistencia:** el archivo original no se archiva por defecto. Su huella y metadatos pueden conservarse en el expediente; guardar los bytes exige consentimiento explícito y almacenamiento separado.
10. **Exportación:** los informes portables no incorporan automáticamente todos los bytes ni series completas del log original.

## Seguridad y límites técnicos

- La librería upstream utiliza Rust y `memmap2` para lectura nativa por archivo; en el navegador se debe usar `from_bytes`, no `open(path)`.
- Aunque i3rs publica una build WebAssembly, eso no demuestra que el parser sea seguro ante cualquier binario malformado ni que consuma memoria acotada. Deben probarse límites de archivo y asignaciones antes de habilitar cargas grandes.
- `read_channel_data` puede devolver menos muestras que las declaradas por el canal: limita la lectura a los bytes disponibles en el archivo. Una respuesta sin error no demuestra que la serie esté completa. El adaptador debe comparar la cantidad decodificada con `n_data`; si difiere, marcar el canal como truncado y excluirlo del análisis cuantitativo.
- Los tipos `DataType::Unknown` no deben interpretarse ni convertirse a cero. Un tipo no soportado debe quedar como canal no decodificable.
- La frecuencia de `ChannelMeta` ya incorpora el factor de reloj legacy que aplica i3rs. No volver a corregirla en la capa de aplicación. El conteo del encabezado tampoco sustituye el recorrido de la lista real de canales.
- i3rs conserva posiciones inválidas como `NaN`, pero la API pública consultada no distingue esas posiciones de valores no finitos que ya vinieran en la señal. Al convertirlos a `null`, usar una causa general como `invalid_or_non_finite`; no afirmar que el logger marcó todos esos puntos como inválidos.
- El parser `.ldx` trata los tiempos de `Marker` en microsegundos y los convierte a segundos. Otras estructuras, como `MarkerPair`, siguen otra ruta de parsing. Validar finitud, límites y orden de inicio/fin antes de usar marcadores como laps o segmentos.
- El parser no debe ejecutarse en el hilo de interfaz si el tamaño y el tiempo de parseo pueden bloquear la página. La opción de worker se evaluará después de confirmar compatibilidad CSP y el ciclo de vida del módulo WASM.
- No se debe confiar en nombres, comentarios, datos de vehículo o textos del archivo. Renderizarlos como texto, nunca como HTML.
- El importador será estrictamente de solo lectura. No exponer `log_writer`, `encode_log` ni rutinas de salida del upstream.
- No hacer peticiones externas desde la aplicación ni descargar dependencias WASM dinámicamente desde un CDN.
- Registrar la versión/commit exactos del parser, dependencias transitivas, licencia y hashes de artefactos distribuidos.
- Añadir pruebas de fuzzing o corpus malformado para cabeceras, punteros, extensiones y sidecars antes de una publicación estable.

## Criterios de aceptación previos a integrar

No se habilitará el adaptador hasta completar todos estos puntos:

1. **Datos autorizados:** usar el archivo de High Performance Academy solo en pruebas locales de práctica, respetando que no hay permiso explícito para redistribuirlo. Confirmar en los metadatos de i2 que el registro proviene de una ECU M1 antes de usarlo como evidencia M1. Para incluir fixtures en el repositorio o en CI se necesita una licencia/ autorización de redistribución independiente. No copiar `test_data/VIR_LAP.ld` ni `.ldx` de i3rs sin esa confirmación.
2. **Fixture sintético separado:** generar además un binario mínimo sintético para probar límites y errores de parsing; identificarlo expresamente como sintético y no como una captura de ECU.
3. **Contraste independiente:** comparar parser WASM y CLI nativo con exactamente los mismos bytes: metadatos, canales, unidades, frecuencias, recuentos, muestras y máscaras de validez.
4. **Validación de ingeniería:** contrastar valores conocidos con el exportador MoTeC de origen o un registro independiente autorizado. Un parser que se ejecuta no demuestra que todas las magnitudes o escalas sean correctas.
5. **Multi-rate:** probar canales con distintas frecuencias, muestras faltantes y períodos inválidos, asegurando que no se fabriquen marcas temporales o puntos.
6. **Seguridad:** pruebas de tamaño, estructuras truncadas, punteros fuera de rango, contadores excesivos y XML malformado; exigir que la cantidad de muestras decodificadas coincida con `n_data`, rechazar tipos desconocidos para análisis cuantitativo y validar frecuencias y rangos `.ldx`. Ninguna condición debe bloquear la interfaz ni causar crecimiento descontrolado de memoria.
7. **Integridad:** demostrar que la carga y el análisis no modifican los bytes de origen; el SHA-256 antes y después debe coincidir.
8. **Licencias:** conservar MIT y avisos del parser y revisar las licencias de todas las dependencias/artefactos WASM. La licencia del software no se extiende a logs de muestra.
9. **CSP y aislamiento:** WASM y worker locales, sin CDN, telemetría ni solicitudes externas; revisar la política CSP vigente.
10. **CI:** build reproducible de WASM, audit de dependencias y pruebas de contrato en cada commit.

## Generadores de archivos y por qué no reemplazan una muestra M1

Se revisó [TrackTelemetryConverter](https://github.com/BoYanZh/TrackTelemetryConverter), que puede escribir archivos `.ld/.ldx` a partir de fuentes como CSV, AIM, VBOX, RaceChrono e iRacing. El repositorio declara licencia **GPL-3.0-only** e incluye un parser/escritor binario también bajo GPL-3.0.

Su código de exportación construye metadatos de canal a partir de las series procesadas y calcula la frecuencia como un entero redondeado de la frecuencia media del canal. Es una posible herramienta externa para generar ejemplos de formato, pero no aporta una captura auténtica de una ECU M1. Su flujo de normalización/remuestreo tampoco sustituye una prueba que exija preservar las frecuencias nativas del registro original.

**Decisión:** no añadirlo como dependencia del proyecto ni copiar su código. La licencia GPL-3.0 y su alcance de copyleft requieren una decisión explícita de distribución, y un archivo generado se debe rotular como sintético/convertido, nunca como adquisición M1 real. Puede considerarse fuera del repositorio para ensayos de interoperabilidad, siempre que se documente el origen sintético y se verifique qué estructuras binarias genera.

## Comparación con motec-i2

[motec-i2](https://github.com/afonso360/motec-i2) es una segunda implementación Rust con licencia MIT que puede ayudar a contrastar parsing de `.ld`. Su README deja `.ldx` sin implementar y el repositorio muestra un ritmo de mantenimiento inferior al de i3rs. Se lo considera referencia de validación puntual, no como parser principal ni como escritor integrado.

## Decisión

**No integrar todavía el parser en la demo.** HPA ofrece registros para práctica local, pero el paquete no pudo descargarse desde este entorno y su origen M1 todavía debe confirmarse en i2. Purdue Formula SAE e i3rs contienen otros registros M1 públicos, pero no encontramos permisos de reutilización para sus datos. Antes de integrar faltan una muestra M1 autorizada para inspección, un contrato multi-rate formal, límites WASM, controles ante muestras truncadas y tipos desconocidos, y contraste independiente. Esta decisión evita presentar una importación parcialmente probada como compatibilidad MoTeC general.
