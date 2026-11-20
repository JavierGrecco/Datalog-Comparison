# Plan de adaptador MoTeC .ld/.ldx

## Estado

**Investigación completada; integración pendiente de evidencia de datos y validación técnica.**

La prioridad técnica es evaluar el core Rust de [i3rs](https://github.com/Friss/i3rs) como parser de solo lectura para registros MoTeC M1. La revisión se realizó sobre el commit upstream `c5e8e03d9244db7898acd247bae919be4a79cc9c`; el workspace declara la versión `0.4.0` y licencia MIT para el código.

No se incorporó código i3rs, ningún log de muestra upstream ni archivos propietarios al repositorio. La licencia MIT del software no concede automáticamente derechos sobre los datos contenidos en sus fixtures.

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
- El parser no debe ejecutarse en el hilo de interfaz si el tamaño y el tiempo de parseo pueden bloquear la página. La opción de worker se evaluará después de confirmar compatibilidad CSP y el ciclo de vida del módulo WASM.
- No se debe confiar en nombres, comentarios, datos de vehículo o textos del archivo. Renderizarlos como texto, nunca como HTML.
- El importador será estrictamente de solo lectura. No exponer `log_writer`, `encode_log` ni rutinas de salida del upstream.
- No hacer peticiones externas desde la aplicación ni descargar dependencias WASM dinámicamente desde un CDN.
- Registrar la versión/commit exactos del parser, dependencias transitivas, licencia y hashes de artefactos distribuidos.
- Añadir pruebas de fuzzing o corpus malformado para cabeceras, punteros, extensiones y sidecars antes de una publicación estable.

## Criterios de aceptación previos a integrar

No se habilitará el adaptador hasta completar todos estos puntos:

1. **Datos autorizados:** disponer de al menos un log M1 `.ld` y un sidecar `.ldx` cuya licencia o autorización permita usarlos en pruebas y, si corresponde, redistribuir fixtures. No copiar `test_data/VIR_LAP.ld` ni `.ldx` de i3rs sin esa confirmación.
2. **Fixture sintético separado:** generar además un binario mínimo sintético para probar límites y errores de parsing; identificarlo expresamente como sintético y no como una captura de ECU.
3. **Contraste independiente:** comparar parser WASM y CLI nativo con exactamente los mismos bytes: metadatos, canales, unidades, frecuencias, recuentos, muestras y máscaras de validez.
4. **Validación de ingeniería:** contrastar valores conocidos con el exportador MoTeC de origen o un registro independiente autorizado. Un parser que se ejecuta no demuestra que todas las magnitudes o escalas sean correctas.
5. **Multi-rate:** probar canales con distintas frecuencias, muestras faltantes y períodos inválidos, asegurando que no se fabriquen marcas temporales o puntos.
6. **Seguridad:** pruebas de tamaño, estructuras truncadas, punteros fuera de rango, contadores excesivos y XML malformado; ninguna condición debe bloquear la interfaz ni causar crecimiento descontrolado de memoria.
7. **Integridad:** demostrar que la carga y el análisis no modifican los bytes de origen; el SHA-256 antes y después debe coincidir.
8. **Licencias:** conservar MIT y avisos del parser y revisar las licencias de todas las dependencias/artefactos WASM. La licencia del software no se extiende a logs de muestra.
9. **CSP y aislamiento:** WASM y worker locales, sin CDN, telemetría ni solicitudes externas; revisar la política CSP vigente.
10. **CI:** build reproducible de WASM, audit de dependencias y pruebas de contrato en cada commit.

## Comparación con motec-i2

[motec-i2](https://github.com/afonso360/motec-i2) es una segunda implementación Rust con licencia MIT que puede ayudar a contrastar parsing de `.ld`. Su README deja `.ldx` sin implementar y el repositorio muestra un ritmo de mantenimiento inferior al de i3rs. Se lo considera referencia de validación puntual, no como parser principal ni como escritor integrado.

## Decisión

**No integrar todavía el parser en la demo.** i3rs es el mejor candidato técnico investigado, pero antes faltan datos de prueba autorizados, contrato multi-rate, límites WASM y validación cruzada. Esta decisión evita presentar una importación parcialmente probada como compatibilidad MoTeC general.
