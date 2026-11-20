# Seguridad e integridad de datos

## Para qué sirve esta guía

Esta demo permite estudiar registros de motor sin enviar los CSV a un servicio externo. Está pensada para aprender, probar reglas y mostrar decisiones de ingeniería. No es un sistema de calibración ni una herramienta certificada para diagnosticar un vehículo.

La seguridad no depende de una sola función. Se apoya en varias medidas pequeñas y en límites explícitos.

## Qué ocurre con los archivos importados

- La inspección lee el CSV seleccionado en el navegador y mantiene el registro exploratorio en memoria mientras la página está abierta.
- La aplicación no tiene backend, analítica ni sincronización. La política CSP restringe las conexiones salientes; los módulos del laboratorio se sirven desde el mismo origen.
- Los expedientes, informes validados y artefactos derivados pueden persistirse en IndexedDB del perfil actual del navegador.
- Los bytes de los CSV originales solo se copian a un almacén separado cuando la persona marca expresamente la opción de archivado. Antes de guardarlos, se vuelve a calcular SHA-256 y se compara con la huella del informe.
- Los informes y respaldos JSON no contienen las muestras originales ni los bytes completos de los CSV. Los originales archivados se descargan por separado desde el historial.
- El almacenamiento local no está cifrado ni protegido por una cuenta; cualquiera con acceso al mismo perfil puede consultar sus datos. Borrar datos del sitio o cambiar de navegador/perfil/dispositivo puede eliminarlos. Los respaldos periódicos son responsabilidad de quien usa la aplicación.

Hay dos herramientas de terminal que el usuario ejecuta de forma explícita y que sí acceden o escriben archivos:

- `npm run data:obd-sample` consulta Hugging Face para descargar un fragmento limitado del dataset documentado. Es una acción manual, no se ejecuta al abrir la aplicación. Guarda el CSV y su atribución bajo `data/external/`.
- `npm run simulate:telemetry` genera datos sintéticos reproducibles bajo `data/generated/`.

Esas carpetas están excluidas de Git. Revisá siempre el destino y el contenido antes de compartir archivos.

## Medidas implementadas

### Lectura controlada

El importador CSV genérico limita el texto a 10 MB, las filas a 100.000, las columnas a 128, cada celda a 16.384 caracteres y el total a 2.000.000 de celdas por archivo. La lectura de bytes acepta UTF-8 con o sin BOM y UTF-16 con BOM; una secuencia inválida se rechaza antes del parser para no convertir bytes dañados en caracteres de sustitución. El límite total cuenta también celdas vacías y encabezados, porque cada una ocupa espacio al construir la tabla en memoria. También valida encabezados duplicados, filas más anchas que el encabezado, números no finitos, separadores y unidades incompatibles.

Estos límites reducen el riesgo de cargas accidentales demasiado grandes. No son una garantía contra todos los archivos maliciosos ni sustituyen las protecciones del navegador y del sistema operativo.

### Contenido importado tratado como texto

Los encabezados, valores y mensajes provenientes del archivo se muestran como texto; no deben ejecutarse como HTML o JavaScript. La prueba de navegador incluye un encabezado sintético con una etiqueta HTML y un atributo de evento para comprobar que no se interpreta como contenido activo.

La aplicación utiliza una política CSP restrictiva: scripts y estilos propios, sin conexiones salientes, objetos embebidos ni cambio de URL base. Cualquier relajación futura debe justificarse y probarse.

### Reconocimiento conservador

- Las coincidencias exactas, únicas y compatibles con la unidad pueden preseleccionarse, pero requieren revisión humana.
- Los errores de tipeo, nombres ambiguos, unidades sin rol y rangos numéricos solo generan sugerencias.
- Las señales desconocidas no se asignan por descarte.
- Los valores faltantes se conservan; no se reemplazan silenciosamente por cero.
- La importación no ordena, interpola ni inventa muestras.
- Las fuentes ECU/logger y dinamómetro siguen siendo dominios distintos.
- Torque y potencia de dinamómetro requieren una base física declarada; no se convierten automáticamente entre motor, rueda, cubo y rodillo.

### Persistencia local y respaldos

Los expedientes usan IndexedDB con compartimentos separados para metadatos, informes, archivos fuente y artefactos derivados. El guardado de originales requiere consentimiento explícito y comprobación de SHA-256. El respaldo JSON restaura como expediente nuevo, valida sus informes y no incluye los bytes CSV. Esto evita que un respaldo de resumen se convierta accidentalmente en una copia de datos de clientes.

IndexedDB no aporta cifrado ni control de acceso de la aplicación. Se debe usar un perfil de navegador confiable, limitar el acceso al dispositivo y descargar respaldos con regularidad. Los CSV originales archivados se deben exportar por separado antes de migrar o eliminar el perfil.

### Integridad y procedencia

Los manifiestos registran información disponible sobre el origen declarado, el rol del registro, las reglas aplicadas y las huellas de los archivos cuando corresponde. Los datos sintéticos tienen esa condición declarada en sus metadatos.

Una huella SHA-256 permite comprobar si los bytes de un archivo coinciden con los bytes usados para calcular esa misma huella. **No demuestra quién creó el archivo, qué vehículo lo produjo, si un sensor estaba calibrado ni si el ensayo fue auténtico.** Tampoco acredita que dos mediciones sean físicamente comparables.

Conservar el archivo original sin modificarlo y registrar la codificación detectada, la versión del parser, las unidades y las transformaciones ayuda a reproducir una importación. No reemplaza una revisión técnica del registro original.

## Qué verifican las pruebas

La CI ejecuta chequeos de sintaxis, pruebas unitarias, pruebas de dominio y un recorrido de navegador con Chromium. Los tests verifican reglas concretas del código, por ejemplo:

- rechazo de archivos CSV mal formados o fuera de los límites;
- tratamiento de faltantes, unidades y encabezados ambiguos;
- separación entre fuentes ECU/logger y dinamómetro;
- ausencia de solicitudes externas durante el uso de la aplicación;
- uso de contenido CSV como texto, no como HTML ejecutable;
- generación y exportación de escenarios sintéticos.

Una CI verde significa que pasaron las comprobaciones automatizadas incluidas en ese commit. **No valida sensores, motores, dinamómetros, calibraciones ni exactitud física de los resultados.** La validez mecánica requiere datos autorizados y revisión por personas con experiencia.

## Reglas para aportar datos y cambios

Antes de agregar una muestra, fixture o captura:

1. Confirmá que tenés autorización para usarla y redistribuirla.
2. Eliminá VIN, patentes, nombres, ubicaciones, identificadores y datos de clientes.
3. Conservá la procedencia, licencia, fecha de consulta y cualquier transformación aplicada.
4. Preferí fixtures pequeños y sintéticos cuando alcancen para probar la estructura.
5. No incluyas credenciales, tokens, archivos privados ni rutas personales.
6. Sumá pruebas negativas además del caso válido: faltantes, valores extremos, unidades incompatibles y formatos parecidos.

No uses un archivo real de cliente como fixture público, aunque se cambie su nombre.

## Lista de revisión antes de integrar cambios

- [ ] El cambio tiene un objetivo claro y un diff acotado.
- [ ] Los datos originales no se modifican ni se completan sin una transformación explícita.
- [ ] Las unidades, el origen y la procedencia quedan identificados.
- [ ] Los errores y las ambigüedades se muestran; no se ocultan.
- [ ] Hay pruebas positivas, negativas y de límites para el comportamiento nuevo.
- [ ] Se revisó que no se agreguen secretos, datos privados ni dependencias innecesarias.
- [ ] La documentación explica los cambios con lenguaje directo.
- [ ] La CI pasó para el commit que se está revisando.

## Controles de GitHub que se revisan en la configuración del repositorio

El código no puede activar por sí solo todas las protecciones de la cuenta. El propietario debe revisar en GitHub:

- habilitar el reporte privado de vulnerabilidades;
- habilitar las alertas de Dependabot;
- impedir el borrado de `main` y los force-push;
- exigir que la validación de CI pase antes de aceptar cambios, cuando se use una política de protección compatible con el flujo del proyecto.

La configuración efectiva de protección de la rama debe verificarse desde la pestaña **Settings** del repositorio. No se debe asumir que existe solo porque el workflow de CI está presente.


### Verificación posterior al guardado

Los CSV archivados se vuelven a leer y verificar mediante SHA-256 antes de cada descarga. El expediente ofrece una auditoría manual de consistencia que comprueba las huellas declaradas, los vínculos entre informes y artefactos, y la existencia de referencias de origen. Si detecta una diferencia, no reescribe el contenido ni intenta repararlo silenciosamente: informa el problema. SHA-256 detecta cambios respecto de una huella previamente registrada, pero no prueba quién generó el archivo ni que la medición física sea auténtica.
