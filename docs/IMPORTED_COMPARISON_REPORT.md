# Contrato del informe JSON de comparaciones importadas

## Versión

- Identificador del documento: `datalog-imported-run-comparison/1`.
- JSON Schema: Draft 2020-12.
- Esquema publicado: [`schemas/imported-run-comparison-1.schema.json`](../schemas/imported-run-comparison-1.schema.json).
- Ejemplo: [`examples/imported-run-comparison-1.example.json`](../examples/imported-run-comparison-1.example.json).

La propiedad raíz `schema` identifica la versión del documento. Los cambios incompatibles requieren una nueva versión y un nuevo archivo de esquema; no se deben reinterpretar campos existentes.

## Contenido

El documento describe dos registros importados con roles explícitos (`reference` y `candidate`), su dominio (ECU/logger o dinamómetro), base física declarada cuando corresponde, cantidad de muestras, huella SHA-256, unidades y un subconjunto permitido de metadatos de importación.

Cada canal incluido contiene estadísticas independientes para cada registro (mínimo, máximo, media, mediana y cobertura), además de diferencias entre esos resúmenes. Los canales excluidos conservan un código y un motivo. Se publican también bloqueos, puertas de revisión, advertencias y próximos pasos.

## Semántica que no debe inferirse

- `method = unpaired-distribution-summary/1`: se resumen distribuciones de muestras independientes.
- `timeAlignment.performed = false`: los relojes no se alinearon.
- No hay interpolación ni diferencias punto a punto.
- `difference.median` es la mediana candidata menos la mediana de referencia. `medianPct` usa el valor absoluto de la mediana de referencia como denominador; puede ser `null` cuando ese denominador es cero o no se puede calcular.
- Una comparación `descriptive_only` no demuestra equivalencia física, causalidad, seguridad ni que un cambio de calibración haya producido un resultado.
- `minimumCoveragePct` es el umbral de cobertura configurado, no una puntuación de confianza.

Los valores de unidad, dominio, origen y base física proceden del proceso de importación. El JSON no certifica que la señal corresponda al sensor, ubicación o magnitud física que su etiqueta sugiere.

## Procedencia y privacidad

La huella SHA-256 es la huella de los bytes del archivo seleccionado. Puede detectar igualdad byte a byte, pero no acredita identidad, autenticidad, integridad histórica, software de origen ni validez del ensayo.

El serializador usa una lista permitida. No incluye:

- muestras ni series numéricas crudas;
- filas o texto completo del CSV;
- celdas originales conservadas por el importador;
- rutas locales, directorios, nombres de usuario o URLs del sistema;
- objetos completos de adaptadores ni campos de metadatos desconocidos.

Para que el mapeo siga siendo interpretable, conserva el nombre de archivo como etiqueta y los encabezados de columnas asociados a canales. Esos textos provienen del archivo y podrían contener información sensible si quien lo creó los escribió de esa manera. Revisalos antes de compartir el JSON.

La descarga se crea localmente en el navegador. No se transmite el CSV ni el informe a un backend.

## Compatibilidad

Los consumidores deben validar `schema` y, preferentemente, el JSON contra el documento Draft 2020-12 publicado. Deben tolerar campos anulables donde el contrato lo permite, conservar la distinción entre `channels` y `excludedChannels`, y evitar interpretar ausencia de advertencias como validación física.

Los consumidores no deben aceptar propiedades desconocidas en la versión 1. El esquema aplica `additionalProperties: false` a los objetos del contrato para que los cambios incompatibles se detecten explícitamente.

## Validación del repositorio

Las pruebas unitarias verifican que:

1. el informe producido por el serializador cumple el JSON Schema publicado;
2. el ejemplo versionado también cumple el mismo contrato;
3. el esquema rechaza roles invertidos, alineación temporal declarada, campos extra y fechas inválidas;
4. las protecciones contra exportar muestras y contenido de origen siguen vigentes.

El motor de validación implementa las palabras clave utilizadas por este esquema y las invariantes específicas de estos informes. Es deliberadamente acotado: no es una implementación general de JSON Schema para validar contratos ajenos al proyecto.

## Validador independiente

El repositorio incluye un comando de línea de órdenes que carga el esquema publicado y verifica también invariantes del dominio (recuentos, cobertura, orden de estadísticas, unidades y fórmulas de diferencias). No necesita dependencias adicionales y funciona con Node.js 22 o posterior.

Validar un archivo descargado:

```bash
npm run validate:report -- ./datalog-comparison-imported.json
```

Leer desde una tubería:

```bash
cat ./datalog-comparison-imported.json | npm run validate:report -- -
```

Salida de máquina para CI:

```bash
node scripts/validate-comparison-report.mjs --json ./datalog-comparison-imported.json
```

También se puede seleccionar otro esquema local con `--schema ruta/al/esquema.json`. Solo se resuelven referencias locales JSON Pointer (`#/...`); el validador no sigue URLs ni accede a la red. Los informes y esquemas tienen límites de tamaño de 10 MiB y 2 MiB, respectivamente.

Códigos de salida: `0` válido, `1` JSON o informe inválido, `2` uso incorrecto o error de lectura/esquema.

El validador implementa las palabras clave utilizadas por el esquema publicado y las invariantes específicas de este informe; no pretende sustituir una biblioteca general de JSON Schema para contratos ajenos al proyecto.

## Abrir un informe en la interfaz

En el laboratorio, la sección **Abrir una comparación guardada** acepta un archivo JSON exportado previamente. La aplicación:

1. limita el archivo a 10 MiB y decodifica UTF-8 en modo estricto;
2. carga el JSON Schema versionado desde el mismo origen de la aplicación;
3. comprueba estructura, roles, coberturas, unidades y diferencias estadísticas;
4. muestra el resumen, los dos registros, los canales comparables y excluidos, los controles y las advertencias.

El informe se procesa localmente. No se guarda en almacenamiento persistente ni se envía a un backend. Cerrar la vista descarta el resumen abierto. La apertura no modifica los slots referencia/candidata ni el expediente CSV activo.

La vista recupera únicamente los datos contenidos en el informe. No puede reconstruir muestras crudas, series temporales ni gráficos que no se hayan exportado. Los valores de nombres de archivo y encabezados se muestran como texto, nunca como HTML.
