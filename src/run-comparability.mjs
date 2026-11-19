import { classifyRunSource, SOURCE_DOMAIN } from "./source-policy.mjs";

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

function measurementBasisLabel(basis) {
  return ({
    wheel: "rueda",
    roller: "rodillo",
    hub: "cubo",
    engine: "motor",
  })[basis] ?? "no declarada";
}

function measurementBasisMismatch(referenceRun, candidateRun, key) {
  if (!DYNO_OUTPUT_CHANNELS.has(key)) return null;
  const referenceDomain = classifyRunSource(referenceRun);
  const candidateDomain = classifyRunSource(candidateRun);
  if (referenceDomain !== SOURCE_DOMAIN.DYNO && candidateDomain !== SOURCE_DOMAIN.DYNO) return null;
  if (referenceDomain !== SOURCE_DOMAIN.DYNO || candidateDomain !== SOURCE_DOMAIN.DYNO) {
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
      reason: "La base física de torque/potencia no está identificada de forma fiable (referencia: " +
        measurementBasisLabel(referenceBasis) + "; candidata: " + measurementBasisLabel(candidateBasis) + ").",
    };
  }
  if (referenceBasis !== candidateBasis) {
    return {
      referenceMeasurementBasis: referenceBasis,
      candidateMeasurementBasis: candidateBasis,
      reason: "La base física de torque/potencia no coincide (referencia: " +
        measurementBasisLabel(referenceBasis) + "; candidata: " + measurementBasisLabel(candidateBasis) +
        "). No se convierte entre bases físicas.",
    };
  }
  return null;
}

function comparableUnit(run, key) {
  const unitText = String(run?.units?.[key] ?? "").trim();
  if (!unitText || UNKNOWN_UNIT.test(unitText)) return null;
  return unitText.toLocaleLowerCase();
}

function countNumericChannelSamples(samples) {
  const counts = new Map();
  for (const sample of samples) {
    const channels = sample?.channels;
    if (!channels || typeof channels !== "object" || Array.isArray(channels)) continue;
    for (const [key, value] of Object.entries(channels)) {
      if (key === "time_s") continue;
      if (!counts.has(key)) counts.set(key, 0);
      if (Number.isFinite(value)) counts.set(key, counts.get(key) + 1);
    }
  }
  return counts;
}

function coveragePct(validCount, sampleCount) {
  return sampleCount ? validCount / sampleCount * 100 : 0;
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

  const referenceCounts = countNumericChannelSamples(referenceSamples);
  const candidateCounts = countNumericChannelSamples(candidateSamples);
  const channelKeys = [...new Set([...referenceCounts.keys(), ...candidateCounts.keys()])].sort();
  const unsharedChannels = [];

  for (const key of channelKeys) {
    const referenceCount = referenceCounts.get(key) ?? 0;
    const candidateCount = candidateCounts.get(key) ?? 0;
    if (!referenceCount && !candidateCount) continue;

    const referenceCoveragePct = coveragePct(referenceCount, referenceSamples.length);
    const candidateCoveragePct = coveragePct(candidateCount, candidateSamples.length);
    if (!referenceCount || !candidateCount) {
      const availability = !referenceCount ? "missing_in_reference" : "missing_in_candidate";
      const missingRole = !referenceCount ? "referencia" : "candidata";
      const presentRole = !referenceCount ? "candidata" : "referencia";
      unsharedChannels.push({
        key,
        availability,
        referenceCount,
        candidateCount,
        referenceCoveragePct,
        candidateCoveragePct,
        reason: "La señal tiene valores numéricos en la " + presentRole +
          " pero no en la " + missingRole + "; no existe una base compartida para compararla."
      });
      continue;
    }

    const referenceUnitText = String(referenceRun?.units?.[key] ?? "").trim();
    const candidateUnitText = String(candidateRun?.units?.[key] ?? "").trim();
    const referenceUnit = comparableUnit(referenceRun, key);
    const candidateUnit = comparableUnit(candidateRun, key);
    if (!referenceUnit || !candidateUnit) {
      blockedChannels.push({
        key,
        referenceUnit: referenceUnitText || "no declarada",
        candidateUnit: candidateUnitText || "no declarada",
        referenceCount,
        candidateCount,
        referenceCoveragePct,
        candidateCoveragePct,
        reason: "La unidad de una de las señales no está declarada de forma fiable."
      });
      continue;
    }
    if (referenceUnit !== candidateUnit) {
      blockedChannels.push({
        key,
        referenceUnit: referenceUnitText,
        candidateUnit: candidateUnitText,
        referenceCount,
        candidateCount,
        referenceCoveragePct,
        candidateCoveragePct,
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
        referenceCount,
        candidateCount,
        referenceCoveragePct,
        candidateCoveragePct,
        ...basisMismatch,
      });
      continue;
    }

    commonChannels.push({
      key,
      unit: referenceUnitText,
      referenceCount,
      candidateCount,
      referenceCoveragePct,
      candidateCoveragePct
    });
  }

  if (!commonChannels.length) {
    warnings.push("No hay señales compartidas con unidades declaradas y coincidentes suficientes para una comparación descriptiva.");
  }
  if (blockedChannels.length) {
    warnings.push(blockedChannels.length + " canal(es) con datos quedaron excluidos por unidades o bases de medición ausentes o incompatibles.");
  }
  if (unsharedChannels.length) {
    warnings.push(unsharedChannels.length + " señal(es) tienen valores numéricos en un solo registro; no se comparan.");
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
    unsharedChannels,
    warnings,
    operatingConditionsVerified: false,
    causalInferenceAllowed: false
  };
}
