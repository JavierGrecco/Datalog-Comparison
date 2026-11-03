/**
 * Evaluación descriptiva de comparabilidad entre dos registros.
 *
 * Módulo de dominio independiente de la interfaz y del agregador core.mjs.
 * Solo habilita una descripción de canales con unidades compatibles; no
 * certifica equivalencia física, sincronización ni causalidad.
 */

// A comparación de máximos no equivale a una comparación bajo condiciones controladas.
// Esta función informa límites observables y evita declarar equivalencia física.
const UNKNOWN_UNIT = /^(?:unidad original|unidad del archivo|unidad desconocida|unknown|n\/a|—)$/i;
const DYNO_OUTPUT_CHANNELS = new Set(["torque_nm", "power_kw"]);
const KNOWN_DYNO_BASES = new Set(["wheel", "roller", "hub", "engine"]);

function measurementBasisMismatch(referenceRun, candidateRun, key) {
  if (!DYNO_OUTPUT_CHANNELS.has(key)) return null;
  const referenceDomain = String(referenceRun?.sourceDomain ?? "").trim().toLowerCase();
  const candidateDomain = String(candidateRun?.sourceDomain ?? "").trim().toLowerCase();
  if (referenceDomain !== "dyno" && candidateDomain !== "dyno") return null;
  if (referenceDomain !== "dyno" || candidateDomain !== "dyno") {
    return {
      referenceMeasurementBasis: referenceRun?.measurementBasis ?? null,
      candidateMeasurementBasis: candidateRun?.measurementBasis ?? null,
      reason: "La señal de torque/potencia de una ECU/logger no es intercambiable con una medición de dinamómetro.",
    };
  }
  const referenceBasis = referenceRun?.measurementBasis;
  const candidateBasis = candidateRun?.measurementBasis;
  if (!KNOWN_DYNO_BASES.has(referenceBasis) || !KNOWN_DYNO_BASES.has(candidateBasis)) {
    return {
      referenceMeasurementBasis: referenceBasis ?? "no declarada",
      candidateMeasurementBasis: candidateBasis ?? "no declarada",
      reason: "La base física de torque/potencia de uno de los dinamómetros no está identificada de forma fiable.",
    };
  }
  if (referenceBasis !== candidateBasis) {
    return {
      referenceMeasurementBasis: referenceBasis,
      candidateMeasurementBasis: candidateBasis,
      reason: "La base de medición de torque/potencia no coincide (rueda, rodillo, cubo o motor). No se convierte entre bases físicas.",
    };
  }
  return null;
}

function comparableUnit(run, key) {
  const unitText = String(run?.units?.[key] ?? "").trim();
  if (!unitText || UNKNOWN_UNIT.test(unitText)) return null;
  return unitText.toLocaleLowerCase();
}

function runTimeQuality(run) {
  const samples = Array.isArray(run?.samples) ? run.samples : [];
  const times = samples.map(sample => sample?.time_s).filter(Number.isFinite);
  let retrogressions = 0;
  let duplicates = 0;
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) retrogressions += 1;
    if (times[index] === times[index - 1]) duplicates += 1;
  }
  const ordered = retrogressions === 0;
  const durationSeconds = times.length >= 2 && ordered
    ? times[times.length - 1] - times[0]
    : null;
  return {
    timestampCount: times.length,
    retrogressions,
    duplicates,
    ordered,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null
  };
}

/**
 * Evalúa si dos registros comparten señales utilizables para análisis descriptivo.
 * Nunca certifica que los ensayos sean físicamente equivalentes ni permite deducir causalidad.
 * No convierte unidades: si difieren o no están declaradas, bloquea esa comparación de canal.
 */
export function assessRunComparability(referenceRun, candidateRun) {
  const referenceSamples = Array.isArray(referenceRun?.samples) ? referenceRun.samples : [];
  const candidateSamples = Array.isArray(candidateRun?.samples) ? candidateRun.samples : [];
  const warnings = [];
  const commonChannels = [];
  const blockedChannels = [];

  if (!referenceSamples.length || !candidateSamples.length) {
    warnings.push("Al menos uno de los registros no contiene muestras utilizables.");
  }
  if (referenceRun?.synthetic || candidateRun?.synthetic) {
    warnings.push("Al menos un registro es sintético: la comparación solo verifica el software, no un motor real.");
  }
  if (referenceSamples.length !== candidateSamples.length) {
    warnings.push("Los registros tienen distinto número de muestras; sus máximos pueden proceder de puntos distintos.");
  }

  const referenceTime = runTimeQuality(referenceRun);
  const candidateTime = runTimeQuality(candidateRun);
  if (referenceTime.timestampCount < referenceSamples.length
      || candidateTime.timestampCount < candidateSamples.length) {
    warnings.push("Algunas muestras carecen de un tiempo numérico; la comparación temporal puede estar incompleta.");
  }
  if (referenceTime.retrogressions || candidateTime.retrogressions) {
    warnings.push("Hay tiempos que retroceden en al menos un registro; no se puede asumir una secuencia temporal ordenada.");
  }
  if (referenceTime.duplicates || candidateTime.duplicates) {
    warnings.push("Hay marcas de tiempo duplicadas; revisá la calidad temporal antes de comparar eventos.");
  }
  if (referenceTime.durationSeconds !== null && candidateTime.durationSeconds !== null
      && Math.abs(referenceTime.durationSeconds - candidateTime.durationSeconds) > 1e-9) {
    warnings.push("La duración registrada difiere entre ensayos; los máximos no garantizan que se midan en el mismo tramo operativo.");
  }

  const channelKeys = new Set();
  for (const sample of [...referenceSamples, ...candidateSamples]) {
    if (sample?.channels && typeof sample.channels === "object") {
      for (const key of Object.keys(sample.channels)) {
        if (key !== "time_s") channelKeys.add(key);
      }
    }
  }

  for (const key of [...channelKeys].sort()) {
    const referenceCount = referenceSamples.filter(sample => Number.isFinite(sample?.channels?.[key])).length;
    const candidateCount = candidateSamples.filter(sample => Number.isFinite(sample?.channels?.[key])).length;
    if (!referenceCount || !candidateCount) continue;

    const referenceUnitText = String(referenceRun?.units?.[key] ?? "").trim();
    const candidateUnitText = String(candidateRun?.units?.[key] ?? "").trim();
    const referenceUnit = comparableUnit(referenceRun, key);
    const candidateUnit = comparableUnit(candidateRun, key);
    if (!referenceUnit || !candidateUnit) {
      blockedChannels.push({
        key,
        referenceUnit: referenceUnitText || "no declarada",
        candidateUnit: candidateUnitText || "no declarada",
        reason: "La unidad de una de las señales no está declarada de forma fiable."
      });
      continue;
    }
    if (referenceUnit !== candidateUnit) {
      blockedChannels.push({
        key,
        referenceUnit: referenceUnitText,
        candidateUnit: candidateUnitText,
        reason: "Las unidades no coinciden. El laboratorio no convierte unidades automáticamente."
      });
      continue;
    }

    const basisMismatch = measurementBasisMismatch(referenceRun, candidateRun, key);
    if (basisMismatch) {
      blockedChannels.push({
        key,
        referenceUnit: referenceUnitText,
        candidateUnit: candidateUnitText,
        ...basisMismatch,
      });
      continue;
    }

    commonChannels.push({
      key,
      unit: referenceUnitText,
      referenceCount,
      candidateCount,
      referenceCoveragePct: referenceSamples.length ? referenceCount / referenceSamples.length * 100 : 0,
      candidateCoveragePct: candidateSamples.length ? candidateCount / candidateSamples.length * 100 : 0
    });
  }

  if (!commonChannels.length) {
    warnings.push("No hay señales compartidas con unidades declaradas y coincidentes suficientes para una comparación descriptiva.");
  }
  if (blockedChannels.length) {
    warnings.push(blockedChannels.length + " canal(es) con datos quedaron excluidos por unidades o bases de medición ausentes o incompatibles.");
  }

  // El prototipo aún no registra ni verifica todas las condiciones operativas del ensayo.
  warnings.push("No se verifican automáticamente condiciones equivalentes como marcha, carga, combustible, temperatura, hardware ni método de medición.");
  warnings.push("Toda diferencia es descriptiva: no demuestra causalidad, seguridad ni que un cambio de calibración haya producido el resultado.");

  return {
    status: commonChannels.length ? "descriptive_only" : "insufficient_evidence",
    reference: {
      id: String(referenceRun?.id ?? ""),
      name: String(referenceRun?.name ?? "Registro base"),
      sampleCount: referenceSamples.length,
      time: referenceTime
    },
    candidate: {
      id: String(candidateRun?.id ?? ""),
      name: String(candidateRun?.name ?? "Registro comparado"),
      sampleCount: candidateSamples.length,
      time: candidateTime
    },
    commonChannels,
    blockedChannels,
    warnings,
    operatingConditionsVerified: false,
    causalInferenceAllowed: false
  };
}
