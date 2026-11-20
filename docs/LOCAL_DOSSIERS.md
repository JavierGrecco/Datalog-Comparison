# Expedientes locales y almacenamiento

## Objetivo

Los expedientes permiten agrupar varios informes de comparación y artefactos derivados asociados a un vehículo o proyecto. La persistencia es local al perfil del navegador: no existe backend ni sincronización entre dispositivos.

## Modelo de datos

El formato de respaldo público está versionado como `datalog-local-dossier-backup/1`. Su contrato está publicado en [JSON Schema Draft 2020-12](../schemas/local-dossier-backup-1.schema.json) y tiene un [ejemplo completo](../examples/local-dossier-backup-1.example.json).

La base `datalog-comparison-local-vault` usa IndexedDB versión 1 y mantiene cuatro object stores independientes:

| Store | Contenido |
| --- | --- |
| `dossiers` | Nombre del expediente, identificación del vehículo, notas y marcas de tiempo |
| `reports` | Informes JSON validados, roles, estadísticas, exclusiones, advertencias y referencias de origen |
| `sourceFiles` | Blobs CSV originales, huella SHA-256, rol, tamaño y vínculo al informe |
| `derivedArtifacts` | Series remuestreadas o curvas de dinamómetro, algoritmo, versión, metadatos y payload |

Los informes no contienen muestras originales. El almacenamiento de los CSV originales está separado y requiere marcar la casilla de consentimiento al guardar un informe. Antes de persistirlos se vuelve a calcular SHA-256 y se exige coincidencia con la huella del informe.

Los límites actuales son 100 MiB por CSV original, 150 MiB para los dos archivos asociados a un informe, 8 MiB por artefacto derivado y 30 MiB por respaldo JSON.

## Flujo de trabajo

1. Crear un expediente, por ejemplo `Ford Falcon 221 · banco`.
2. Inspeccionar y comparar dos CSV como referencia y candidata.
3. Guardar el informe validado en el expediente.
4. Elegir si se archivan también los dos CSV originales. Si no se marca la opción, se guardan solamente el informe y sus huellas.
5. Generar procesamiento temporal o curvas de dinamómetro y guardar el artefacto derivado por separado.
6. Consultar el historial, abrir informes, descargar originales archivados y exportar respaldos.

Abrir un informe desde un archivo o desde el historial no introduce muestras al comparador ni habilita reconstrucciones punto a punto. Los artefactos derivados se almacenan como payload separado y no reescriben el registro fuente.

## Respaldo y restauración

El respaldo usa el identificador `datalog-local-dossier-backup/1`. Contiene metadatos del expediente, informes portables y artefactos derivados.

Los bytes originales no se incluyen. El respaldo contiene las referencias de sus archivos (nombre, rol, tamaño y SHA-256) e informa cuántos originales permanecen en el almacén local. Para conservarlos fuera del dispositivo, descargalos individualmente desde el historial antes de mover o borrar el perfil del navegador.

Restaurar un respaldo:

- siempre crea un expediente nuevo y no sobrescribe uno existente;
- valida cada informe contra el JSON Schema y las invariantes de dominio;
- remapea identificadores internos para evitar colisiones;
- restaura los artefactos derivados en su store separado;
- no restaura los bytes originales del CSV.

## Privacidad y límites

Los datos permanecen en IndexedDB del origen actual. No se envían a un backend. No obstante, cualquier persona con acceso al mismo perfil/navegador puede acceder a ellos; no es un almacén cifrado ni un mecanismo de control de acceso.

Los datos locales pueden desaparecer al borrar los datos del sitio, cambiar de perfil, navegador o dispositivo, o por políticas de almacenamiento del navegador. Descargá respaldos periódicos. Los CSV archivados deben descargarse por separado porque no se incluyen en el respaldo JSON.

Eliminar un expediente elimina sus informes, originales archivados y artefactos derivados vinculados. Eliminar un informe elimina sus CSV archivados y los artefactos asociados.

El almacenamiento persistente es una herramienta de organización y trazabilidad, no una copia forense certificada, una autenticación de sensor ni una validación de las condiciones físicas del ensayo.
