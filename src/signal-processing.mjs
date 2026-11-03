/**
 * Procesamiento determinista de señales derivadas.
 *
 * La salida es un artefacto nuevo: nunca modifica run.samples.
 * V1 soporta decimación temporal entera con FIR y curvas de dinamómetro por RPM.
 */
export const SIGNAL_PROCESSING_SCHEMA = "datalog-derived-signals/1";
export const SIGNAL_PROCESSING_VERSION = "datalog-signal-processing/1";
export const DEFAULT_MAX_INTERVAL_DEVIATION_PCT = 5;
export const DEFAULT_MAX_GAP_FACTOR = 3;
export const DEFAULT_RPM_BIN_WIDTH = 100;

export const DEFAULT_CONTINUOUS_CHANNELS = Object.freeze({
  rpm: "continuous",
  distance_km: "continuous",
  torque_nm: "continuous",
  power_kw: "continuous",
  speed_kmh: "continuous",
  boost_target: "continuous",
  boost_actual: "continuous",
  map_abs_kpa: "continuous",
  fuel_pressure_kpa: "continuous",
  throttle_pct: "continuous",
  iat_c: "continuous",
  coolant_temp_c: "continuous",
  ignition_advance_deg: "continuous",
  battery_v: "continuous",
  lambda: "continuous",
  afr: "continuous",
});

const VALID_MEASUREMENT_BASES = new Set(["wheel", "roller", "hub", "engine", "unknown"]);
const finite = Number.isFinite;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.name = "SignalProcessingError";
  error.code = code;
  error.details = Object.freeze({ ...details });
  throw error;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assertOptionsNumber(value, name, { min, max, exclusiveMin = false }) {
  if (!finite(value) || (exclusiveMin ? value <= min : value < min) || value > max) {
    fail("SIGNAL_PROCESSING_OPTION_INVALID",
      "El parámetro " + name + " está fuera del rango permitido.",
      { parameter: name, value, min, max });
  }
}

function resolveSelectedChannels(run, requested, signalKinds = {}) {
  if (!run?.samples || !Array.isArray(run.samples) || !run.units || typeof run.units !== "object") {
    fail("SIGNAL_PROCESSING_RUN_INVALID", "Se necesita un registro con muestras y unidades normalizadas.");
  }
  const selected = requested ?? Object.keys(DEFAULT_CONTINUOUS_CHANNELS).filter(key => Object.hasOwn(run.units, key));
  if (!Array.isArray(selected) || !selected.length || selected.some(key => typeof key !== "string" || !key)) {
    fail("SIGNAL_PROCESSING_CHANNELS_REQUIRED", "Seleccioná al menos un canal para procesar.");
  }
  if (new Set(selected).size !== selected.length) {
    fail("SIGNAL_PROCESSING_CHANNELS_DUPLICATED", "Un canal no puede procesarse dos veces en la misma operación.");
  }
  return selected.map(key => {
    if (!Object.hasOwn(run.units, key)) {
      fail("SIGNAL_PROCESSING_CHANNEL_UNKNOWN", "El canal " + key + " no tiene unidad canónica declarada.", { channel: key });
    }
    const kind = signalKinds[key] ?? DEFAULT_CONTINUOUS_CHANNELS[key];
    if (kind !== "continuous" && kind !== "discrete") {
      fail("SIGNAL_PROCESSING_CHANNEL_KIND_REQUIRED",
        "Declarar si el canal " + key + " es continuo o discreto antes de procesarlo.",
        { channel: key });
    }
    return { key, kind, unit: String(run.units[key]) };
  });
}

function inspectTimeBase(run, { maxIntervalDeviationPct, maxGapFactor }) {
  if (run.samples.length < 3) {
    fail("SIGNAL_PROCESSING_NOT_ENOUGH_SAMPLES",
      "Se necesitan al menos tres muestras para estimar una base temporal.");
  }
  if (!Object.hasOwn(run.units, "time_s")) {
    fail("SIGNAL_PROCESSING_TIME_AXIS_REQUIRED", "El registro no contiene un eje temporal declarado en segundos.");
  }
  if (run.units.time_s !== "s") {
    fail("SIGNAL_PROCESSING_TIME_UNIT_UNSUPPORTED", "El eje temporal debe estar normalizado a segundos antes de procesar.");
  }
  const times = run.samples.map((sample, index) => {
    const value = sample?.time_s;
    if (!finite(value)) {
      fail("SIGNAL_PROCESSING_TIME_INVALID", "La muestra " + (index + 1) + " no tiene tiempo numérico.", { sourceSampleIndex: index });
    }
    return value;
  });
  const intervals = [];
  for (let index = 1; index < times.length; index += 1) {
    const delta = times[index] - times[index - 1];
    if (!(delta > 0)) {
      fail("SIGNAL_PROCESSING_TIME_NOT_MONOTONIC",
        "El tiempo debe ser estrictamente creciente; no se ordenaron ni corrigieron las muestras.",
        { sourceSampleIndex: index, previousTime: times[index - 1], currentTime: times[index] });
    }
    intervals.push(delta);
  }
  const medianIntervalSeconds = median(intervals);
  const gapThresholdSeconds = medianIntervalSeconds * maxGapFactor;
  const regularIntervals = intervals.filter(value => value <= gapThresholdSeconds);
  const maxObservedIntervalDeviationPct = regularIntervals.reduce((maximum, value) =>
    Math.max(maximum, Math.abs(value - medianIntervalSeconds) / medianIntervalSeconds * 100), 0);
  if (maxObservedIntervalDeviationPct > maxIntervalDeviationPct) {
    fail("SIGNAL_PROCESSING_TIMEBASE_IRREGULAR",
      "La base temporal es demasiado irregular para esta decimación uniforme. Se conserva el registro sin transformar.",
      {
        medianIntervalSeconds,
        estimatedSourceRateHz: 1 / medianIntervalSeconds,
        maxObservedIntervalDeviationPct,
        allowedMaxIntervalDeviationPct: maxIntervalDeviationPct,
      });
  }
  const gapBefore = new Set();
  intervals.forEach((value, index) => {
    if (value > gapThresholdSeconds) gapBefore.add(index + 1);
  });
  return {
    times,
    intervals,
    medianIntervalSeconds,
    estimatedSourceRateHz: 1 / medianIntervalSeconds,
    maxObservedIntervalDeviationPct,
    gapThresholdSeconds,
    gapBefore,
  };
}

function designBlackmanLowpass(decimationFactor) {
  const tapCount = 8 * decimationFactor + 1;
  const half = (tapCount - 1) / 2;
  const cutoff = 0.45 / decimationFactor;
  const coefficients = [];
  for (let index = 0; index < tapCount; index += 1) {
    const offset = index - half;
    const ideal = offset === 0
      ? 2 * cutoff
      : Math.sin(2 * Math.PI * cutoff * offset) / (Math.PI * offset);
    const window = 0.42
      - 0.5 * Math.cos(2 * Math.PI * index / (tapCount - 1))
      + 0.08 * Math.cos(4 * Math.PI * index / (tapCount - 1));
    coefficients.push(ideal * window);
  }
  const sum = coefficients.reduce((total, value) => total + value, 0);
  if (!finite(sum) || Math.abs(sum) < Number.EPSILON) {
    fail("SIGNAL_PROCESSING_FILTER_DESIGN_FAILED", "No se pudo normalizar el filtro FIR.");
  }
  return coefficients.map(value => value / sum);
}

function splitChannelSegments(samples, key, timeBase) {
  const segments = [];
  let current = [];
  const close = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (!finite(samples[index]?.channels?.[key])) {
      close();
      continue;
    }
    if (current.length && timeBase.gapBefore.has(index)) close();
    current.push(index);
  }
  close();
  return segments;
}

function resampleContinuousChannel(samples, key, segments, coefficients, decimationFactor) {
  const half = (coefficients.length - 1) / 2;
  const outputSegments = [];
  let skippedShortSegments = 0;
  let trimmedEdgeSamples = 0;
  for (const indices of segments) {
    if (indices.length < coefficients.length) {
      skippedShortSegments += 1;
      continue;
    }
    const first = indices[0];
    const lastExclusive = indices.at(-1) + 1;
    const outputSamples = [];
    for (let center = first + half; center < lastExclusive - half; center += 1) {
      if (center % decimationFactor !== 0) continue;
      let value = 0;
      for (let tap = 0; tap < coefficients.length; tap += 1) {
        const sourceIndex = center + tap - half;
        value += samples[sourceIndex].channels[key] * coefficients[tap];
      }
      if (finite(value)) {
        outputSamples.push({
          time_s: samples[center].time_s,
          value,
          sourceSampleIndex: center,
        });
      }
    }
    trimmedEdgeSamples += half * 2;
    if (outputSamples.length) {
      outputSegments.push({
        sourceStartSampleIndex: first,
        sourceEndSampleIndex: indices.at(-1),
        samples: outputSamples,
      });
    } else {
      skippedShortSegments += 1;
    }
  }
  return { segments: outputSegments, skippedShortSegments, trimmedEdgeSamples };
}

function resampleDiscreteChannel(samples, key, segments, decimationFactor) {
  const outputSegments = [];
  for (const indices of segments) {
    const start = indices[0];
    const endExclusive = indices.at(-1) + 1;
    const firstOnGrid = Math.ceil(start / decimationFactor) * decimationFactor;
    const outputSamples = [];
    for (let targetIndex = firstOnGrid; targetIndex < endExclusive; targetIndex += decimationFactor) {
      outputSamples.push({
        time_s: samples[targetIndex].time_s,
        value: samples[targetIndex].channels[key],
        sourceSampleIndex: targetIndex,
      });
    }
    if (outputSamples.length) {
      outputSegments.push({
        sourceStartSampleIndex: start,
        sourceEndSampleIndex: indices.at(-1),
        samples: outputSamples,
      });
    }
  }
  return { segments: outputSegments };
}

/**
 * Downsample regularly sampled time series. The integer ratio, gap policy,
 * filter and edge trimming are part of the versioned output contract.
 */
export function resampleTimeBasedSignals(run, {
  targetRateHz,
  channels = null,
  signalKinds = {},
  maxIntervalDeviationPct = DEFAULT_MAX_INTERVAL_DEVIATION_PCT,
  maxGapFactor = DEFAULT_MAX_GAP_FACTOR,
} = {}) {
  assertOptionsNumber(maxIntervalDeviationPct, "maxIntervalDeviationPct", { min: 0, max: 25 });
  assertOptionsNumber(maxGapFactor, "maxGapFactor", { min: 1, max: 20, exclusiveMin: true });
  assertOptionsNumber(targetRateHz, "targetRateHz", { min: 0, max: 10000, exclusiveMin: true });

  const selectedChannels = resolveSelectedChannels(run, channels, signalKinds);
  const timeBase = inspectTimeBase(run, { maxIntervalDeviationPct, maxGapFactor });
  const sourceRateHz = timeBase.estimatedSourceRateHz;
  const rawFactor = sourceRateHz / targetRateHz;
  const decimationFactor = Math.round(rawFactor);
  if (decimationFactor < 2 || decimationFactor > 32 ||
      Math.abs(rawFactor - decimationFactor) > Math.max(1, rawFactor) * 1e-4) {
    fail("SIGNAL_PROCESSING_RATIO_UNSUPPORTED",
      "La tasa objetivo debe ser una reducción por factor entero entre 2 y 32 de la tasa observada.",
      { sourceRateHz, targetRateHz, requestedRatio: rawFactor, supportedFactors: "2..32" });
  }

  const coefficients = designBlackmanLowpass(decimationFactor);
  const signals = {};
  const warnings = [];
  for (const channel of selectedChannels) {
    const sourceSegments = splitChannelSegments(run.samples, channel.key, timeBase);
    const processed = channel.kind === "continuous"
      ? resampleContinuousChannel(run.samples, channel.key, sourceSegments, coefficients, decimationFactor)
      : resampleDiscreteChannel(run.samples, channel.key, sourceSegments, decimationFactor);
    const outputCount = processed.segments.reduce((total, segment) => total + segment.samples.length, 0);
    const method = channel.kind === "continuous"
      ? "blackman-windowed-sinc-fir-zero-phase-decimation"
      : "zero-order-hold-on-observed-source-grid";
    const channelWarnings = [];
    if (!outputCount) {
      channelWarnings.push("No hubo segmentos con muestras suficientes para generar una salida segura.");
    }
    if (processed.skippedShortSegments) {
      channelWarnings.push(processed.skippedShortSegments +
        " segmento(s) continuo(s) no procesados por ser más cortos que el filtro FIR.");
    }
    if (processed.trimmedEdgeSamples) {
      channelWarnings.push("Se recortaron bordes de segmentos para no extrapolar fuera del soporte del filtro.");
    }
    if (channelWarnings.length) warnings.push(channel.key + ": " + channelWarnings.join(" "));
    signals[channel.key] = {
      kind: channel.kind,
      unit: channel.unit,
      method,
      sourceValidSampleCount: sourceSegments.reduce((total, segment) => total + segment.length, 0),
      outputSampleCount: outputCount,
      segments: processed.segments,
      warnings: channelWarnings,
    };
  }

  return {
    schema: SIGNAL_PROCESSING_SCHEMA,
    algorithm: SIGNAL_PROCESSING_VERSION,
    operation: "time-series-decimation",
    sourceRunId: String(run.id ?? ""),
    sourceSampleCount: run.samples.length,
    axis: { key: "time_s", unit: "s", estimatedSourceRateHz: sourceRateHz, targetRateHz },
    parameters: {
      decimationFactor,
      maxIntervalDeviationPct,
      observedMaxIntervalDeviationPct: timeBase.maxObservedIntervalDeviationPct,
      maxGapFactor,
      gapThresholdSeconds: timeBase.gapThresholdSeconds,
      filter: {
        type: "FIR low-pass",
        window: "Blackman",
        taps: coefficients.length,
        cutoffHz: targetRateHz * 0.45,
        phase: "zero-phase symmetric",
        edgePolicy: "trim",
        coefficients,
      },
      discreteSignalPolicy: "zero-order hold at observed target-grid instants; missing cells split segments",
      continuousSignalPolicy: "FIR anti-alias filter before integer decimation; missing cells split segments",
    },
    signals,
    warnings,
    sourceUnmodified: true,
  };
}

function validRpm(value) {
  return finite(value) && value >= 0;
}

function inferTimeGaps(samples, maxGapFactor) {
  const times = samples.map(sample => sample?.time_s);
  if (times.some(value => !finite(value))) {
    return { gapBefore: new Set(), warning: "El eje temporal está incompleto; la segmentación usa solo RPM y orden de origen." };
  }
  const intervals = [];
  for (let index = 1; index < times.length; index += 1) {
    const delta = times[index] - times[index - 1];
    if (!(delta > 0)) {
      return { gapBefore: new Set(), warning: "El tiempo no es estrictamente creciente; no se usa para dividir barridos." };
    }
    intervals.push(delta);
  }
  if (!intervals.length) return { gapBefore: new Set(), warning: null };
  const typical = median(intervals);
  const gapBefore = new Set();
  intervals.forEach((value, index) => {
    if (value > typical * maxGapFactor) gapBefore.add(index + 1);
  });
  return { gapBefore, warning: null };
}

function splitIncreasingSweeps(samples, {
  minimumSweepSpanRpm,
  reversalThresholdRpm,
  confirmationRiseRpm,
  gapBefore,
}) {
  const sweeps = [];
  let active = null;
  let pending = [];
  let peakRpm = -Infinity;

  const finish = () => {
    if (active?.length >= 2) {
      const rpms = active.map(item => item.rpm);
      const span = Math.max(...rpms) - Math.min(...rpms);
      if (span >= minimumSweepSpanRpm) sweeps.push(active);
    }
    active = null;
    peakRpm = -Infinity;
  };

  for (let index = 0; index < samples.length; index += 1) {
    const rpm = samples[index]?.channels?.rpm;
    if (!validRpm(rpm) || gapBefore.has(index)) {
      finish();
      pending = [];
      continue;
    }
    const point = { index, rpm };
    if (active) {
      if (rpm < peakRpm - reversalThresholdRpm) {
        finish();
        pending = [point];
      } else {
        active.push(point);
        peakRpm = Math.max(peakRpm, rpm);
      }
      continue;
    }

    pending.push(point);
    let minimumIndex = 0;
    for (let cursor = 1; cursor < pending.length; cursor += 1) {
      if (pending[cursor].rpm < pending[minimumIndex].rpm) minimumIndex = cursor;
    }
    const lowest = pending[minimumIndex];
    if (rpm >= lowest.rpm + confirmationRiseRpm) {
      active = pending.slice(minimumIndex);
      peakRpm = active.reduce((maximum, item) => Math.max(maximum, item.rpm), -Infinity);
      pending = [];
    }
  }
  finish();
  return sweeps;
}

function binSweepChannel(samples, sweep, key, rpmBinWidth, minimumSamplesPerBin) {
  const buckets = new Map();
  for (const point of sweep) {
    const value = samples[point.index]?.channels?.[key];
    if (!finite(value)) continue;
    const lowerRpm = Math.floor(point.rpm / rpmBinWidth) * rpmBinWidth;
    if (!buckets.has(lowerRpm)) buckets.set(lowerRpm, []);
    buckets.get(lowerRpm).push({ rpm: point.rpm, value, sourceSampleIndex: point.index });
  }
  const bins = [...buckets.entries()].sort(([a], [b]) => a - b)
    .filter(([, values]) => values.length >= minimumSamplesPerBin)
    .map(([lowerRpm, values]) => {
      const valuesOnly = values.map(item => item.value);
      const rpmsOnly = values.map(item => item.rpm);
      const medianValue = median(valuesOnly);
      return {
        rpmLower: lowerRpm,
        rpmUpper: lowerRpm + rpmBinWidth,
        rpmMedian: median(rpmsOnly),
        valueMedian: medianValue,
        valueMin: Math.min(...valuesOnly),
        valueMax: Math.max(...valuesOnly),
        sampleCount: values.length,
        sourceSampleIndices: values.map(item => item.sourceSampleIndex),
      };
    });
  let peak = null;
  for (const bin of bins) {
    if (!peak || bin.valueMedian > peak.value) {
      peak = { rpm: bin.rpmMedian, value: bin.valueMedian, binLowerRpm: bin.rpmLower };
    }
  }
  return { bins, peak };
}

/**
 * Split dyno data into separate rising sweeps, then summarize observed values
 * in explicit RPM bands. No interpolation, smoothing or pull mixing is done.
 */
export function buildRpmSweepCurves(run, {
  channels = null,
  rpmBinWidth = DEFAULT_RPM_BIN_WIDTH,
  minimumSweepSpanRpm = 500,
  reversalThresholdRpm = 150,
  confirmationRiseRpm = 100,
  minimumSamplesPerBin = 1,
  maxGapFactor = DEFAULT_MAX_GAP_FACTOR,
} = {}) {
  if (run?.sourceDomain !== "dyno") {
    fail("SIGNAL_PROCESSING_DYNO_REQUIRED", "Las curvas por RPM requieren un registro declarado como dinamómetro.");
  }
  if (!Object.hasOwn(run?.units ?? {}, "rpm")) {
    fail("SIGNAL_PROCESSING_RPM_AXIS_REQUIRED", "El registro de dinamómetro no declara el canal RPM.");
  }
  if (run.units.rpm !== "RPM") {
    fail("SIGNAL_PROCESSING_RPM_UNIT_UNSUPPORTED", "El eje RPM debe estar normalizado a RPM antes de construir curvas.");
  }
  if (!run.samples || !Array.isArray(run.samples) || run.samples.length < 2) {
    fail("SIGNAL_PROCESSING_NOT_ENOUGH_SAMPLES", "Se necesitan al menos dos muestras para buscar un barrido.");
  }
  if (!VALID_MEASUREMENT_BASES.has(run.measurementBasis)) {
    fail("SIGNAL_PROCESSING_DYNO_BASIS_REQUIRED", "La base física de torque/potencia debe declararse antes de construir curvas.");
  }
  assertOptionsNumber(rpmBinWidth, "rpmBinWidth", { min: 0, max: 10000, exclusiveMin: true });
  assertOptionsNumber(minimumSweepSpanRpm, "minimumSweepSpanRpm", { min: 0, max: 20000, exclusiveMin: true });
  assertOptionsNumber(reversalThresholdRpm, "reversalThresholdRpm", { min: 0, max: 5000, exclusiveMin: true });
  assertOptionsNumber(confirmationRiseRpm, "confirmationRiseRpm", { min: 0, max: 2000, exclusiveMin: true });
  assertOptionsNumber(minimumSamplesPerBin, "minimumSamplesPerBin", { min: 1, max: 10000 });
  assertOptionsNumber(maxGapFactor, "maxGapFactor", { min: 1, max: 20, exclusiveMin: true });

  const selectedChannels = channels ?? ["torque_nm", "power_kw"].filter(key => Object.hasOwn(run.units, key));
  if (!Array.isArray(selectedChannels) || !selectedChannels.length ||
      selectedChannels.some(key => typeof key !== "string" || !Object.hasOwn(run.units, key)) ||
      new Set(selectedChannels).size !== selectedChannels.length) {
    fail("SIGNAL_PROCESSING_DYNO_CHANNELS_INVALID",
      "Seleccioná canales de torque o potencia normalizados y sin duplicados.");
  }
  const wrongUnits = selectedChannels.filter(key => run.units[key] !== (key === "torque_nm" ? "Nm" : "kW"));
  if (wrongUnits.length) {
    fail("SIGNAL_PROCESSING_DYNO_UNIT_UNSUPPORTED", "Torque y potencia deben estar normalizados a Nm y kW.", { channels: wrongUnits });
  }
  const nonDynoChannels = selectedChannels.filter(key => !["torque_nm", "power_kw"].includes(key));
  if (nonDynoChannels.length) {
    fail("SIGNAL_PROCESSING_DYNO_CHANNEL_UNSUPPORTED",
      "La curva por RPM solo admite torque y potencia en esta versión.", { channels: nonDynoChannels });
  }

  const timeGaps = inferTimeGaps(run.samples, maxGapFactor);
  const sweepPoints = splitIncreasingSweeps(run.samples, {
    minimumSweepSpanRpm,
    reversalThresholdRpm,
    confirmationRiseRpm,
    gapBefore: timeGaps.gapBefore,
  });
  const curves = sweepPoints.map((sweep, index) => {
    const rpms = sweep.map(point => point.rpm);
    const minRpm = Math.min(...rpms);
    const maxRpm = Math.max(...rpms);
    const channelCurves = {};
    for (const key of selectedChannels) {
      channelCurves[key] = {
        unit: String(run.units[key]),
        ...binSweepChannel(run.samples, sweep, key, rpmBinWidth, minimumSamplesPerBin),
      };
    }
    return {
      sweepIndex: index + 1,
      direction: "increasing",
      sourceStartSampleIndex: sweep[0].index,
      sourceEndSampleIndex: sweep.at(-1).index,
      sourceSampleCount: sweep.length,
      rpmRange: { min: minRpm, max: maxRpm, span: maxRpm - minRpm },
      channels: channelCurves,
    };
  }).filter(curve => Object.values(curve.channels).some(channel => channel.bins.length >= 2));

  const warnings = [];
  if (timeGaps.warning) warnings.push(timeGaps.warning);
  if (run.measurementBasis === "unknown") {
    warnings.push("La curva conserva la base física desconocida; no debe equipararse con una curva de base identificada.");
  }
  if (!curves.length) {
    warnings.push("No se encontró un barrido ascendente con extensión y cobertura suficientes; no se fabricaron puntos.");
  }
  warnings.push("Las bandas de RPM resumen solo muestras observadas; no se interpolaron bandas vacías ni se suavizó la curva.");
  warnings.push("No se aplicó corrección atmosférica ni un procedimiento de certificación SAE.");
  return {
    schema: SIGNAL_PROCESSING_SCHEMA,
    algorithm: SIGNAL_PROCESSING_VERSION,
    operation: "dyno-rpm-sweep-binning",
    sourceRunId: String(run.id ?? ""),
    sourceSampleCount: run.samples.length,
    measurementBasis: run.measurementBasis,
    axis: { key: "rpm", unit: String(run.units.rpm), binWidth: rpmBinWidth },
    parameters: {
      minimumSweepSpanRpm,
      reversalThresholdRpm,
      confirmationRiseRpm,
      minimumSamplesPerBin,
      maxGapFactor,
      aggregation: "median with min/max envelope",
      emptyBinPolicy: "omit; do not interpolate",
      sweepPolicy: "increasing only; split on sustained RPM reversal or time gap",
    },
    curves,
    warnings,
    status: curves.length
      ? run.measurementBasis === "unknown" ? "review_required" : "ready"
      : "insufficient_data",
    sourceUnmodified: true,
  };
}
