/**
 * Selección de muestras originales para vistas de resumen.
 *
 * No interpola, promedia, reordena ni modifica las muestras del registro.
 */
export const SAMPLE_SELECTION_VERSION = "datalog-sample-selection/1";
export const DEFAULT_PREVIEW_SAMPLE_LIMIT = 8;

/**
 * Devuelve referencias a muestras reales distribuidas por orden de captura.
 * Los índices son cero-based respecto del array original.
 */
export function selectPreviewSamples(samples, { limit = DEFAULT_PREVIEW_SAMPLE_LIMIT } = {}) {
  if (!Array.isArray(samples)) {
    throw new TypeError("Las muestras deben recibirse como un array.");
  }
  if (!Number.isSafeInteger(limit) || limit < 2) {
    throw new RangeError("El límite de vista previa debe ser un entero igual o mayor que 2.");
  }
  if (samples.length === 0) return [];

  const selectedCount = Math.min(samples.length, limit);
  return Array.from({ length: selectedCount }, (_, position) => {
    const index = selectedCount === samples.length
      ? position
      : Math.round(position * (samples.length - 1) / (selectedCount - 1));
    return { index, sample: samples[index] };
  });
}
