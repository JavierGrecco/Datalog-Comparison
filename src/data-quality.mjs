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

// Envelopes amplios para alertas de plausibilidad, no límites universales del hardware.
const PLAUSIBILITY_ENVELOPES = Object.freeze({
  rpm: { min: 0, max: 25000, unit: "RPM" },
  speed_kmh: { min: 0, max: 500, unit: "km/h" },
  throttle_pct: { min: 0, max: 100, unit: "%" },
  iat_c: { min: -80, max: 250, unit: "°C" },
  coolant_temp_c: { min: -80, max: 250, unit: "°C" },
  battery_v: { min: 0, max: 40, unit: "V" },
  boost_target: { min: -150, max: 1000, unit: "kPa" },
  boost_actual: { min: -150, max: 1000, unit: "kPa" },
  map_abs_kpa: { min: 0, max: 1000, unit: "kPa" },
  fuel_pressure_kpa: { min: 0, max: 1000, unit: "kPa" },
  ignition_advance_deg: { min: -90, max: 120, unit: "deg" },
  lambda: { min: 0.4, max: 3, unit: "lambda" },
  afr: { min: 4, max: 45, unit: "AFR" },
});

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
  const hasTimeAxis = Object.hasOwn(run?.units ?? {}, "time_s") || timeValues.some(finite);
  const hasRpmAxis = Object.hasOwn(run?.units ?? {}, "rpm") ||
    samples.some(sample => finite(sample?.channels?.rpm));
  const validTimeCount = hasTimeAxis ? timeValues.filter(finite).length : 0;
  let missingTimeCount = 0;
  let retrogressions = 0;
  let duplicateAdjacentTimes = 0;
  const positiveIntervals = [];

  for (let index = 0; hasTimeAxis && index < timeValues.length; index += 1) {
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
  const durationSeconds = hasTimeAxis && sampleCount >= 2
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
    const observedIntervals = [];
    for (let index = 0; index < samples.length; index += 1) {
      const value = samples[index]?.channels?.[key];
      if (finite(value)) {
        validCount += 1;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      if (!hasTimeAxis || index === 0) continue;
      const previousTime = samples[index - 1]?.time_s;
      const currentTime = samples[index]?.time_s;
      const previousValue = samples[index - 1]?.channels?.[key];
      if (finite(previousTime) && finite(currentTime) && currentTime > previousTime &&
          finite(previousValue) && finite(value)) {
        observedIntervals.push(currentTime - previousTime);
      }
    }
    const orderedIntervals = [...observedIntervals].sort((a, b) => a - b);
    const medianInterval = median(orderedIntervals);
    const intervalMad = median(orderedIntervals.map(interval => Math.abs(interval - medianInterval)));
    const envelope = PLAUSIBILITY_ENVELOPES[key] ?? null;
    let outsideEnvelopeCount = 0;
    if (envelope) {
      for (const sample of samples) {
        const value = sample?.channels?.[key];
        if (finite(value) && (value < envelope.min || value > envelope.max)) outsideEnvelopeCount += 1;
      }
    }
    return {
      key,
      validCount,
      missingCount: sampleCount - validCount,
      coveragePct: pct(validCount, sampleCount),
      min: validCount ? min : null,
      max: validCount ? max : null,
      plausibility: envelope ? {
        status: outsideEnvelopeCount ? "outside_broad_envelope" : "within_broad_envelope",
        min: envelope.min,
        max: envelope.max,
        unit: envelope.unit,
        outsideCount: outsideEnvelopeCount,
      } : { status: "not_assessed", outsideCount: 0 },
      sampling: {
        observedAdjacentIntervalCount: observedIntervals.length,
        medianIntervalSeconds: medianInterval,
        medianObservedRateHz: medianInterval > 0 ? 1 / medianInterval : null,
        minimumAdjacentIntervalSeconds: orderedIntervals.length ? orderedIntervals[0] : null,
        maximumAdjacentIntervalSeconds: orderedIntervals.length ? orderedIntervals.at(-1) : null,
        medianAbsoluteDeviationSeconds: intervalMad,
        relativeJitterPct: medianInterval > 0 ? intervalMad / medianInterval * 100 : null,
      },
    };
  });

  const meta = run?.importMetadata;
  let sourceMetadata = null;
  if (meta && typeof meta === "object") {
    const headerRows = Array.isArray(meta.headerRows) ? meta.headerRows : null;
    const rowCount = Number.isSafeInteger(meta.sourceRowCount) && meta.sourceRowCount >= 0
      ? meta.sourceRowCount
      : null;
    const skipped = Number.isSafeInteger(meta.skippedNonEmptyRowCount) && meta.skippedNonEmptyRowCount >= 0
      ? meta.skippedNonEmptyRowCount
      : null;
    const declaredSamples = Number.isSafeInteger(meta.parsedSampleCount) && meta.parsedSampleCount >= 0
      ? meta.parsedSampleCount
      : null;
    const headersInRange = rowCount !== null && headerRows !== null &&
      headerRows.every(row => Number.isSafeInteger(row) && row >= 1 && row <= rowCount) &&
      new Set(headerRows).size === headerRows.length;
    const countsValid = rowCount !== null && skipped !== null && declaredSamples !== null;
    const sampleCountMatches = declaredSamples !== null && declaredSamples === sampleCount;
    sourceMetadata = {
      parserId: typeof meta.parserId === "string" ? meta.parserId : null,
      sourceRowCount: rowCount,
      skippedNonEmptyRowCount: skipped,
      declaredSampleCount: declaredSamples,
      countsValid,
      sampleCountMatches,
      headersInRange,
      consistent: countsValid && sampleCountMatches && headersInRange
    };
  }

  if (sampleCount < 2) {
    warnings.push("Hay menos de dos muestras; el registro no alcanza para revisar una secuencia temporal.");
  }
  if (hasTimeAxis && missingTimeCount) {
    warnings.push(missingTimeCount + " muestra(s) no tienen un tiempo numérico válido.");
  }
  if (!hasTimeAxis && !hasRpmAxis) {
    warnings.push("No hay eje temporal ni eje RPM declarado; no se pueden interpretar ni comparar las muestras como una serie de motor.");
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
  const outOfEnvelopeChannels = channels.filter(channel => channel.plausibility?.outsideCount > 0);
  if (outOfEnvelopeChannels.length) {
    warnings.push(outOfEnvelopeChannels.length +
      " canal(es) tienen valores fuera de un rango amplio de plausibilidad; revisar sensor, unidad y escala. No se descartaron ni corrigieron muestras.");
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
      available: hasTimeAxis,
      axis: hasTimeAxis ? "time_s" : hasRpmAxis ? "rpm" : null,
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
