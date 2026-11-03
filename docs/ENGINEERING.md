# Notas de ingeniería

## Entorno

- Node.js 22 o posterior y npm para validar el repositorio.
- Playwright 1.64.1 está fijado como dependencia de desarrollo para la prueba Chromium.
- No existe un framework de frontend, proceso de build ni dependencia JavaScript en tiempo de ejecución.
- Python es opcional y se utiliza solo como servidor HTTP estático local.

## Comandos reproducibles

```bash
npm ci
npx playwright install chromium
npm test
```

Para abrir la demo localmente:

```bash
python3 -m http.server 8000
```

Visitar http://127.0.0.1:8000/.

## Consistencia del repositorio

La rama canónica de este proyecto es `main`.

- Mantener una sola rama activa; no dejar ramas de trabajo, pruebas o integración abiertas cuando el cambio ya esté resuelto.
- Para este repositorio de portfolio, integrar los cambios pequeños y revisados directamente en `main`, en commits atómicos y descriptivos.
- Antes de publicar un commit, actualizar la referencia de `main` y comprobar que el SHA esperado sigue siendo el mismo. Si la referencia cambió, inspeccionar el nuevo estado antes de intentar otra actualización.
- No mantener avances importantes solo en ramas locales, worktrees, PRs o archivos sin commit.
- Después de cada cambio, verificar que el árbol de `main` corresponde al último commit, que no quedan PRs abiertos ni ramas residuales y que CI terminó correctamente para ese mismo SHA.
- Un commit cuyo CI falla no se considera terminado. Corregirlo en `main` y volver a ejecutar todas las validaciones.
- La protección de rama de GitHub es una configuración independiente de este flujo operativo; revisar su estado en la configuración del repositorio.

## Convenciones de dominio

1. Preservar el orden y los valores de las muestras recibidas.
2. No convertir ni inferir unidades sin una regla explícita y verificable.
3. No tratar ECU/logger y dinamómetro como fuentes numéricamente intercambiables.
4. Mantener separados los valores desconocidos, informados, medidos y verificados por quien los carga.
5. Conservar la procedencia sin exportar rutas locales ni registros completos en el informe de portfolio.
6. Toda salida basada en fixtures debe permanecer marcada como sintética.
7. Un CSV genérico requiere mapeo explícito de columnas y unidades; no se deduce semántica desde el encabezado.
8. Todo error de lectura debe identificar el código y, cuando corresponda, la fila y columna afectadas.
9. La inspección CSV local no habilita comparaciones entre archivos hasta validar sincronización, canal, método y base física.
10. Los archivos de vehículos reales solo se incorporan a pruebas con autorización, procedencia y permisos de redistribución claros.

## Definición de terminado

Un cambio que afecte reglas de dominio debe incluir pruebas de contrato y cubrir, cuando corresponda:

- caso válido;
- faltantes o datos mal formados;
- incompatibilidades que deben bloquearse;
- entradas desconocidas o no verificadas;
- preservación de datos originales;
- resultado y explicación visibles para la persona usuaria.

Un cambio de interfaz debe conservar el uso por teclado, estados accesibles, diseño móvil y ausencia de solicitudes externas. Los cambios no deben debilitar la política CSP ni incorporar recursos remotos sin justificación y revisión.

## Alcance

Este repositorio es una demo de portfolio. No debe recibir logs privados, archivos de clientes, identificadores personales ni datos de vehículos reales. No se aceptan formatos propietarios sin documentación verificable y fixtures cuyo uso esté autorizado. La ampliación a comparación de importaciones, adaptadores ECU, persistencia y validación física pertenece a etapas posteriores del producto y requiere controles adicionales.
