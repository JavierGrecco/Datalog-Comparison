/**
 * Perfil descriptivo de calidad para un registro ya normalizado.
 *
 * No corrige, reordena, interpola ni descarta muestras. Solo muestra alertas
 * observables para que la persona revise la fuente antes de comparar.
 */
function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

const finite = value => Number.isFinite(value);
const pct = (count, total) => total ? Math.round(count / total * 10000) / 100 : 0;

/**
 * Devuelve métricas calculadas desde las muestras actuales, nunca desde un
 * perfil guardado previamente. "Sin alertas" no significa que la medición sea
 * correcta ni que el ensayo sea comparable con otro.
 */
export function assessRunDataQuality(run) {
  const samples = Array.isArray(run?.samples) ? run.samples : [];
  const sampleCount = samples.length;
  const warnings = [];
  const timeValues = samples.map(sample => sample?.time_s);
  const validTimeCount = timeValues.filter(finite).length;
  let missingTimeCount = 0;
  let retrogressions = 0;
  let duplicateAdjacentTimes = 0;
  const positiveIntervals = [];

  for (let index = 0; index < timeValues.length; index += 1) {
    if (!finite(timeValues[index])) {
      missingTimeCount += 1;
      continue;
    }
    if (index === 0 || !finite(timeValues[index - 1])) continue;
    const delta = timeValues[index] - timeValues[index - 1];
    if (delta < 0) retrogressions += 1;
    else if (delta === 0) duplicateAdjacentTimes += 1;
    else positiveIntervals.push(delta);
  }

  const timeOrdered = retrogressions === 0;
  const durationSeconds = sampleCount >= 2
    && validTimeCount === sampleCount
    && timeOrdered
    ? timeValues.at(-1) - timeValues[0]
    : null;

  const channelKeys = new Set();
  for (const sample of samples) {
    if (!sample?.channels || typeof sample.channels !== "object") continue;
    for (const key of Object.keys(sample.channels)) {
      if (key !== "time_s") channelKeys.add(key);
    }
  }

  const channels = [...channelKeys].sort().map(key => {
    let validCount = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const sample of samples) {
      const value = sample?.channels?.[key];
      if (!finite(value)) continue;
      validCount += 1;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return {
      key,
      validCount,
      missingCount: sampleCount - validCount,
      coveragePct: pct(validCount, sampleCount),
      min: validCount ? min : null,
      max: validCount ? max : null
    };
  });

  const meta = run?.importMetadata;
  let sourceMetadata = null;
  if (meta && typeof meta === "object") {
    const headerRows = Array.isArray(meta.headerRows) ? meta.headerRows : [];
    const rowCount = Number.isInteger(meta.sourceRowCount) ? meta.sourceRowCount : null;
    const skipped = Number.isInteger(meta.skippedNonEmptyRowCount)
      ? meta.skippedNonEmptyRowCount
      : null;
    const declaredSamples = Number.isInteger(meta.parsedSampleCount)
      ? meta.parsedSampleCount
      : null;
    const headersInRange = rowCount !== null
      && headerRows.every(row => Number.isInteger(row) && row >= 1 && row <= rowCount);
    const sampleCountMatches = declaredSamples !== null && declaredSamples === sampleCount;
    sourceMetadata = {
      parserId: typeof meta.parserId === "string" ? meta.parserId : null,
      sourceRowCount: rowCount,
      skippedNonEmptyRowCount: skipped,
      declaredSampleCount: declaredSamples,
      sampleCountMatches,
      headersInRange,
      consistent: sampleCountMatches && headersInRange
    };
  }

  if (sampleCount < 2) {
    warnings.push("Hay menos de dos muestras; el registro no alcanza para revisar una secuencia temporal.");
  }
  if (missingTimeCount) {
    warnings.push(missingTimeCount + " muestra(s) no tienen un tiempo numérico válido.");
  }
  if (retrogressions) {
    warnings.push(retrogressions + " retroceso(s) del tiempo entre muestras consecutivas; no se reordenaron los datos.");
  }
  if (duplicateAdjacentTimes) {
    warnings.push(duplicateAdjacentTimes + " par(es) de muestras consecutivas comparten la misma marca de tiempo.");
  }
  const incompleteChannels = channels.filter(channel => channel.missingCount > 0);
  if (incompleteChannels.length) {
    warnings.push(incompleteChannels.length + " canal(es) tienen valores ausentes o no numéricos; revisar su cobertura antes de comparar.");
  }
  const emptyChannels = channels.filter(channel => channel.validCount === 0);
  if (emptyChannels.length) {
    warnings.push(emptyChannels.length + " canal(es) no tienen ningún valor numérico utilizable.");
  }
  if (sourceMetadata?.skippedNonEmptyRowCount > 0) {
    warnings.push("El lector omitió " + sourceMetadata.skippedNonEmptyRowCount + " fila(s) no vacías; revisar el origen si esas filas pueden ser importantes.");
  }
  if (sourceMetadata && !sourceMetadata.consistent) {
    warnings.push("Los metadatos de lectura no coinciden completamente con las muestras o filas declaradas; revisar el informe y el archivo fuente.");
  }
  if (!channels.length) {
    warnings.push("No hay canales de señal para evaluar.");
  }

  const status = sampleCount < 2 || !channels.length
    ? "insufficient_data"
    : warnings.length
      ? "review_required"
      : "no_obvious_issues";

  return {
    schema: "datalog-workbench-data-quality/1",
    status,
    sampleCount,
    timestamp: {
      validCount: validTimeCount,
      missingCount: missingTimeCount,
      retrogressions,
      duplicateAdjacentTimes,
      ordered: timeOrdered,
      durationSeconds: finite(durationSeconds) ? durationSeconds : null,
      positiveIntervalMedianSeconds: median(positiveIntervals)
    },
    channels,
    sourceMetadata,
    warnings
  };
}
