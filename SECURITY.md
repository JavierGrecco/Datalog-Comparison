# Política de seguridad

## Alcance

Datalog Comparison es una demostración experimental que se ejecuta localmente en el navegador. No es un servicio de producción, no controla hardware y no está certificada para tomar decisiones mecánicas.

Esta política describe cómo informar problemas y qué datos no deben publicarse. No establece un SLA de respuesta ni una garantía de seguridad para uso productivo.

## Cómo informar un problema

No publiques vulnerabilidades explotables, credenciales, datos personales, VIN, matrículas ni registros de clientes en issues o pull requests públicos.

1. Usá la opción **Report a vulnerability** de la pestaña **Security** del repositorio cuando esté habilitada.
2. Si el reporte privado no está disponible, contactá al propietario desde su perfil de GitHub para acordar un canal privado.
3. Incluí el commit afectado, el componente, el impacto observado y una reproducción mínima que no contenga datos reales ni secretos.

No adjuntes logs de vehículos, exportaciones de dinamómetro ni archivos de clientes. Para explicar un problema de importación, prepará un archivo sintético que reproduzca la estructura.

## Datos de prueba

Los escenarios versionados son sintéticos. No agregues archivos ECU/logger, exportaciones de dinamómetro, patentes, VIN, datos de clientes, credenciales ni rutas locales a commits o issues públicos.

Las reglas actuales y sus límites están descritos en [Seguridad e integridad de datos](docs/SECURITY_AND_DATA_INTEGRITY.md).
