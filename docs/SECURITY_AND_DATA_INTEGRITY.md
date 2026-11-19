# Seguridad e integridad de datos

## Para qué sirve esta guía

Esta demo permite estudiar registros de motor sin enviar los CSV a un servicio externo. Está pensada para aprender, probar reglas y mostrar decisiones de ingeniería. No es un sistema de calibración ni una herramienta certificada para diagnosticar un vehículo.

La seguridad no depende de una sola función. Se apoya en varias medidas pequeñas y en límites explícitos.

## Qué ocurre con los archivos importados

- El navegador lee el CSV seleccionado y lo mantiene en memoria durante la sesión.
- La aplicación no tiene backend, analítica ni llamadas de red desde la interfaz. La política CSP incluye `connect-src 'none'`.
- Al limpiar la inspección o recargar la página, la aplicación descarta su estado local. No ofrece almacenamiento persistente de esos archivos.
- La inspección no incorpora el CSV a los escenarios sintéticos ni habilita la comparación entre archivos.
- La descarga de un informe sintético es una acción separada; no incluye el contenido completo de un CSV importado.

Hay dos herramientas de terminal que el usuario ejecuta de forma explícita y que sí acceden o escriben archivos:

- `npm run data:obd-sample` consulta Hugging Face para descargar un fragmento limitado del dataset documentado. Es una acción manual, no se ejecuta al abrir la aplicación. Guarda el CSV y su atribución bajo `data/external/`.
- `npm run simulate:telemetry` genera datos sintéticos reproducibles bajo `data/generated/`.

Esas carpetas están excluidas de Git. Revisá siempre el destino y el contenido antes de compartir archivos.

## Medidas implementadas

### Lectura controlada

El importador CSV genérico limita el tamaño del texto a 10 MB, las filas a 100.000, las columnas a 128 y cada celda a 16.384 caracteres. También valida encabezados duplicados, filas más anchas que el encabezado, números no finitos, separadores y unidades incompatibles.

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

### Integridad y procedencia

Los manifiestos registran información disponible sobre el origen declarado, el rol del registro, las reglas aplicadas y las huellas de los archivos cuando corresponde. Los datos sintéticos tienen esa condición declarada en sus metadatos.

Una huella SHA-256 permite comprobar si los bytes de un archivo coinciden con los bytes usados para calcular esa misma huella. **No demuestra quién creó el archivo, qué vehículo lo produjo, si un sensor estaba calibrado ni si el ensayo fue auténtico.** Tampoco acredita que dos mediciones sean físicamente comparables.

Conservar el archivo original sin modificarlo y registrar la versión del parser, las unidades y las transformaciones ayuda a reproducir una importación. No reemplaza una revisión técnica del registro original.

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
