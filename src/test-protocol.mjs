import { OPERATING_CONDITION_FIELDS, validateOperatingConditions } from "./operating-conditions.mjs";

/**
 * Protocolos y repetibilidad de ensayos.
 * Los perfiles son criterios de revisión del laboratorio, no una certificación
 * ni una transcripción de normas técnicas protegidas.
 */
export const TEST_PROTOCOL_SCHEMA = "datalog-test-protocol/1";

const ECU_STEADY_FIELDS = [
  "calibration_id", "fuel", "intake_temp_c", "coolant_temp_c",
];
const ECU_TRANSIENT_FIELDS = [
  "vehicle_engine", "calibration_id", "fuel", "ambient_temp_c",
];
const DYNO_COMMON_FIELDS = [
  "vehicle_engine", "fuel", "test_method", "dyno_model", "dyno_type",
  "dyno_measurement_basis", "dyno_load_mode", "dyno_correction_standard",
  "dyno_fan_setup", "instrument_calibration", "ambient_temp_c",
  "ambient_pressure_kpa", "relative_humidity_pct",
];
const DYNO_CHASSIS_FIELDS = ["gear", "dyno_strapping"];
const DYNO_TIRE_FIELDS = ["tire_size", "tire_pressure_kpa", "tire_condition"];
const DYNO_HUB_FIELDS = ["dyno_hub_fixture"];
const DYNO_SWEEP_FIELDS = ["dyno_ramp_rate_rpm_s", "dyno_smoothing_setting"];

const usable = entry => entry && ["measured", "verified"].includes(entry.status) &&
  entry.value !== null && entry.value !== "" && typeof entry.source === "string" && entry.source.trim();
const sameValue = (a, b) => typeof a === "string" && typeof b === "string"
  ? a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
  : Object.is(a, b);

const METRIC_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const NUMERIC_CONDITION_UNITS = new Map(
  OPERATING_CONDITION_FIELDS
    .filter(field => field.type === "number")
    .map(field => [field.key, field.unit]),
);

function normalizeExpectedMetrics(expectedMetrics) {
  if (!Array.isArray(expectedMetrics)) {
    throw new TypeError("expectedMetrics debe ser una lista de claves de métricas.");
  }
  if (expectedMetrics.length > 128) {
    throw new RangeError("expectedMetrics no puede declarar más de 128 métricas.");
  }
  const normalized = expectedMetrics.map(key => {
    if (typeof key !== "string" || !METRIC_KEY_PATTERN.test(key)) {
      throw new TypeError("Cada métrica esperada debe usar una clave técnica válida (snake_case).");
    }
    return key;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("expectedMetrics no debe contener claves duplicadas.");
  }
  return normalized;
}

function normalizeSetupTolerances(setupTolerances) {
  if (!setupTolerances || typeof setupTolerances !== "object" || Array.isArray(setupTolerances)) {
    throw new TypeError("setupTolerances debe ser un objeto con tolerancias por condición.");
  }
  const normalized = {};
  for (const [key, tolerance] of Object.entries(setupTolerances)) {
    if (!NUMERIC_CONDITION_UNITS.has(key)) {
      throw new TypeError("No se puede aplicar tolerancia a la condición " + key + "; solo se admiten campos numéricos conocidos.");
    }
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      throw new RangeError("La tolerancia de " + key + " debe ser un número finito no negativo.");
    }
    normalized[key] = tolerance;
  }
  return normalized;
}

function normalizeMetricCvLimits(maximumCvPctByMetric) {
  if (!maximumCvPctByMetric || typeof maximumCvPctByMetric !== "object" ||
      Array.isArray(maximumCvPctByMetric)) {
    throw new TypeError("maximumCvPctByMetric debe ser un objeto con límites por métrica.");
  }
  const entries = Object.entries(maximumCvPctByMetric);
  if (entries.length > 128) {
    throw new RangeError("No se pueden configurar límites para más de 128 métricas.");
  }
  const normalized = {};
  for (const [key, limit] of entries) {
    if (!METRIC_KEY_PATTERN.test(key)) {
      throw new TypeError("La clave técnica del límite CV por métrica no tiene un formato válido.");
    }
    if (!Number.isFinite(limit) || limit < 0) {
      throw new RangeError("El límite CV de " + key + " debe ser finito y no negativo.");
    }
    normalized[key] = limit;
  }
  return normalized;
}

function sameStructuredValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameStructuredValue(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && sameStructuredValue(left[key], right[key]));
}

function getCondition(run, key) {
  return run?.operatingConditions?.fields?.[key] ?? null;
}

function assessRequiredConditions(runs, requiredFields) {
  const findings = [];
  for (const [index, run] of runs.entries()) {
    const errors = validateOperatingConditions(run?.operatingConditions);
    if (errors.length) {
      findings.push({ code: "invalid_conditions_contract", runId: run?.id ?? null,
        message: "El registro " + (index + 1) + " tiene un contrato de condiciones inválido: " + errors[0] });
    }
    for (const key of requiredFields) {
      const entry = getCondition(run, key);
      if (!usable(entry)) {
        findings.push({ code: "condition_not_evidenced", runId: run.id ?? null, field: key,
          message: "Falta " + key + " con estado medido o verificado por quien carga y fuente declarada." });
      }
    }
  }
  return findings;
}

function assessStableSetup(runs, keys, setupTolerances = {}) {
  const findings = [];
  if (runs.length < 2) return findings;
  for (const key of keys) {
    const entries = runs.map(run => getCondition(run, key));
    if (entries.some(entry => !usable(entry))) continue;
    const tolerance = setupTolerances[key] ?? 0;
    const values = entries.map(entry => entry.value);
    const allNumeric = values.every(value => typeof value === "number" && Number.isFinite(value));
    const referenceValue = values[0];
    const minValue = allNumeric ? values.reduce((min, value) => Math.min(min, value), Infinity) : null;
    const maxValue = allNumeric ? values.reduce((max, value) => Math.max(max, value), -Infinity) : null;
    const maxDifference = allNumeric ? maxValue - minValue : null;
    const matches = allNumeric
      ? maxDifference <= tolerance
      : values.every(value => sameValue(referenceValue, value));
    if (!matches) {
      const unit = NUMERIC_CONDITION_UNITS.get(key) ?? "";
      findings.push({
        code: "setup_mismatch",
        field: key,
        tolerance,
        unit,
        referenceValue,
        maxDifference,
        values,
        message: "La condición " + key + " cambia más que la tolerancia configurada" +
          (unit ? " (" + tolerance + " " + unit + ")" : "") +
          "; no deben agruparse como un mismo protocolo sin revisión.",
      });
    }
  }
  return findings;
}

function calculateMetricStatistics(values) {
  if (!values.length) return { mean: null, min: null, max: null, cvPct: null, rangePct: null };

  // Scale first so finite inputs near Number.MAX_VALUE do not overflow while summing.
  const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const min = values.reduce((minimum, value) => Math.min(minimum, value), Infinity);
  const max = values.reduce((maximum, value) => Math.max(maximum, value), -Infinity);
  if (scale === 0) {
    return { mean: 0, min, max, cvPct: values.length >= 2 ? null : null, rangePct: null };
  }

  // Welford's method on normalized values keeps the variance calculation bounded.
  let count = 0;
  let meanNormalized = 0;
  let sumSquaredDeviations = 0;
  for (const value of values) {
    const normalized = value / scale;
    count += 1;
    const delta = normalized - meanNormalized;
    meanNormalized += delta / count;
    const deltaAfterUpdate = normalized - meanNormalized;
    sumSquaredDeviations += delta * deltaAfterUpdate;
  }

  const mean = meanNormalized * scale;
  const standardDeviationNormalized = values.length >= 2
    ? Math.sqrt(Math.max(0, sumSquaredDeviations) / (values.length - 1))
    : null;
  const cvRaw = values.length >= 2 && meanNormalized !== 0
    ? standardDeviationNormalized / Math.abs(meanNormalized) * 100
    : null;
  const rangeRaw = meanNormalized !== 0
    ? ((max / scale) - (min / scale)) / Math.abs(meanNormalized) * 100
    : null;

  return {
    mean,
    min,
    max,
    cvPct: Number.isFinite(cvRaw) ? cvRaw : null,
    rangePct: Number.isFinite(rangeRaw) ? rangeRaw : null,
  };
}

export function assessRepeatability(replicates, {
  minimumReplicates = 3,
  maximumCvPct = null,
  maximumCvPctByMetric = {},
  expectedMetrics = [],
} = {}) {
  if (!Array.isArray(replicates)) throw new TypeError("replicates debe ser una lista.");
  if (!Number.isInteger(minimumReplicates) || minimumReplicates < 2) {
    throw new RangeError("minimumReplicates debe ser un entero mayor o igual a 2.");
  }
  if (maximumCvPct !== null && (!Number.isFinite(maximumCvPct) || maximumCvPct < 0)) {
    throw new RangeError("maximumCvPct debe ser un número finito no negativo o null.");
  }
  const normalizedMetricCvLimits = normalizeMetricCvLimits(maximumCvPctByMetric);
  const expectedMetricKeys = normalizeExpectedMetrics(expectedMetrics);
  const declaredMetricKeys = new Set();
  for (const [index, replicate] of replicates.entries()) {
    const sourceMetrics = replicate?.metrics ?? {};
    if (typeof sourceMetrics !== "object" || Array.isArray(sourceMetrics)) {
      throw new TypeError("metrics de la repetición " + (index + 1) + " debe ser un objeto.");
    }
    for (const key of Object.keys(sourceMetrics)) {
      if (!METRIC_KEY_PATTERN.test(key)) {
        throw new TypeError("La clave de métrica " + key + " no tiene un formato técnico válido.");
      }
      declaredMetricKeys.add(key);
    }
  }
  const expectedMetricSet = new Set(expectedMetricKeys);
  const metricKeys = [...new Set([...expectedMetricKeys, ...declaredMetricKeys])].sort();
  if (metricKeys.length > 128) {
    throw new RangeError("No se pueden evaluar más de 128 métricas por grupo.");
  }
  const unknownLimitKeys = Object.keys(normalizedMetricCvLimits)
    .filter(key => !metricKeys.includes(key));
  if (unknownLimitKeys.length) {
    throw new TypeError(
      "Hay límites CV configurados para métricas que no están presentes ni declaradas como esperadas: " +
      unknownLimitKeys.join(", ") + ".",
    );
  }
  const metrics = metricKeys.map(key => {
    const values = replicates.map(item => item?.metrics?.[key]).filter(Number.isFinite);
    const missingCount = replicates.length - values.length;
    const statistics = calculateMetricStatistics(values);
    const metricMaximumCvPct = normalizedMetricCvLimits[key] ?? maximumCvPct;
    const status = values.length < minimumReplicates ? "insufficient_replicates"
      : missingCount > 0 ? "incomplete_replicates"
        : metricMaximumCvPct === null ? "threshold_not_configured"
          : statistics.cvPct === null ? "not_calculable"
            : statistics.cvPct <= metricMaximumCvPct ? "within_user_limit" : "above_user_limit";
    return {
      key,
      expected: expectedMetricSet.has(key),
      count: values.length,
      missingCount,
      ...statistics,
      maximumCvPct: metricMaximumCvPct,
      status,
    };
  });
  const hasNoMetrics = metrics.length === 0;
  const hasInsufficient = metrics.some(item => item.status === "insufficient_replicates");
  const hasNoThreshold = metrics.some(item => item.status === "threshold_not_configured");
  const hasIncomplete = metrics.some(item => item.status === "incomplete_replicates");
  const hasExceeded = metrics.some(item => item.status === "above_user_limit");
  const hasNotCalculable = metrics.some(item => item.status === "not_calculable");
  return {
    schema: TEST_PROTOCOL_SCHEMA,
    method: "sample-standard-deviation-coefficient-of-variation/1",
    replicateCount: replicates.length,
    minimumReplicates,
    maximumCvPct,
    maximumCvPctByMetric: normalizedMetricCvLimits,
    expectedMetrics: expectedMetricKeys,
    status: hasNoMetrics ? "no_metrics" : hasInsufficient ? "insufficient_replicates"
      : hasIncomplete ? "incomplete_replicates"
        : hasExceeded || hasNotCalculable ? "review_required"
          : hasNoThreshold ? "threshold_not_configured" : "within_user_limit",
    metrics,
    limitations: [
      "El CV describe la dispersión entre repeticiones; no demuestra exactitud ni ausencia de sesgo sistemático.",
      "El límite de aceptación debe definirse según equipo, magnitud, método y objetivo; no existe un umbral universal aplicado por esta función.",
      "No se calcula incertidumbre expandida ni trazabilidad metrológica.",
    ],
  };
}

/**
 * run: { id, domain, protocol: { id, mode }, operatingPointId,
 * operatingConditions, metrics: { torque_nm, power_kw, ... } }
 */
export function assessTestProtocol(runs, {
  maximumCvPct = null,
  maximumCvPctByMetric = {},
  minimumReplicates = 3,
  expectedMetrics = [],
  setupTolerances = {},
} = {}) {
  if (!Array.isArray(runs) || !runs.length) throw new TypeError("Se necesita al menos un registro.");
  const normalizedExpectedMetrics = normalizeExpectedMetrics(expectedMetrics);
  const normalizedSetupTolerances = normalizeSetupTolerances(setupTolerances);
  const normalizedMetricCvLimits = normalizeMetricCvLimits(maximumCvPctByMetric);
  const domains = new Set(runs.map(run => run?.domain));
  if (domains.size !== 1 || !["ecu", "dyno"].includes([...domains][0])) {
    return { schema: TEST_PROTOCOL_SCHEMA, status: "blocked",
      findings: [{ code: "mixed_or_unknown_domain", message: "El protocolo requiere registros del mismo dominio identificado: ECU o dinamómetro." }],
      repeatability: assessRepeatability([], {
        minimumReplicates, maximumCvPct, maximumCvPctByMetric: normalizedMetricCvLimits,
        expectedMetrics: normalizedExpectedMetrics,
      }) };
  }
  const domain = [...domains][0];
  const modes = new Set(runs.map(run => run?.protocol?.mode));
  const protocolIds = new Set(runs.map(run => run?.protocol?.id));
  const findings = [];
  const runIds = runs.map(run =>
    typeof run?.id === "string" ? run.id.trim() : ""
  );
  if (runIds.some(id => !id)) {
    findings.push({
      code: "run_id_missing",
      message: "Cada adquisición debe tener un identificador de registro no vacío para contar como repetición independiente.",
    });
  }
  const uniqueRunIds = new Set(runIds.filter(Boolean));
  if (uniqueRunIds.size !== runIds.filter(Boolean).length) {
    findings.push({
      code: "duplicate_run_id",
      message: "Hay identificadores de registro repetidos; una misma adquisición no puede contarse más de una vez como repetición.",
    });
  }
  if (modes.size !== 1 || protocolIds.size !== 1 || runs.some(run => !run?.protocol?.id || !run?.protocol?.mode)) {
    findings.push({ code: "protocol_mismatch", message: "Las repeticiones deben declarar el mismo protocolo y modo de adquisición." });
  }
  const mode = [...modes][0];
  let requiredFields;
  let setupFields;
  let dynoType = null;
  let measurementBasis = null;
  if (domain === "ecu" && mode === "steady_state") {
    requiredFields = ECU_STEADY_FIELDS;
    setupFields = ["calibration_id", "fuel", "intake_temp_c", "coolant_temp_c"];
  } else if (domain === "ecu" && mode === "transient") {
    requiredFields = ECU_TRANSIENT_FIELDS;
    setupFields = ["vehicle_engine", "calibration_id", "fuel", "ambient_temp_c"];
  } else if (domain === "dyno" && ["inertia_sweep", "loaded_sweep", "steady_state"].includes(mode)) {
    const typeEntries = runs.map(run => getCondition(run, "dyno_type"));
    const basisEntries = runs.map(run => getCondition(run, "dyno_measurement_basis"));
    const declared = entry => usable(entry) && typeof entry.value === "string";
    const typeValues = new Set(typeEntries.filter(declared).map(entry => entry.value));
    const basisValues = new Set(basisEntries.filter(declared).map(entry => entry.value));

    if (typeEntries.some(entry => !declared(entry) || !["engine", "chassis"].includes(entry.value))) {
      findings.push({ code: "dyno_type_unknown", message: "Cada registro debe identificar el banco como motor o chasis con una fuente declarada." });
    } else if (typeValues.size !== 1) {
      findings.push({ code: "dyno_type_mismatch", message: "No se pueden agrupar repeticiones de banco de motor y banco de chasis." });
    } else {
      dynoType = [...typeValues][0];
    }

    if (basisEntries.some(entry => !declared(entry) || !["engine", "wheel", "hub", "roller"].includes(entry.value))) {
      findings.push({ code: "dyno_measurement_basis_unknown", message: "Cada registro debe declarar una base física de medición válida." });
    } else if (basisValues.size !== 1) {
      findings.push({ code: "dyno_measurement_basis_mismatch", message: "Las repeticiones usan bases físicas distintas; no deben compararse como una misma medición." });
    } else {
      measurementBasis = [...basisValues][0];
    }

    const hasIncompatiblePhysicalPair = runs.some(run => {
      const typeEntry = getCondition(run, "dyno_type");
      const basisEntry = getCondition(run, "dyno_measurement_basis");
      if (!declared(typeEntry) || !declared(basisEntry)) return false;
      return !((typeEntry.value === "engine" && basisEntry.value === "engine") ||
        (typeEntry.value === "chassis" && ["wheel", "hub", "roller"].includes(basisEntry.value)));
    });
    if (hasIncompatiblePhysicalPair) {
      findings.push({ code: "dyno_measurement_basis_incompatible", message: "Al menos un registro declara una base física que no corresponde al tipo de dinamómetro." });
    }

    requiredFields = [
      ...DYNO_COMMON_FIELDS,
      ...(dynoType === "chassis" ? DYNO_CHASSIS_FIELDS : []),
      ...(dynoType === "chassis" && ["wheel", "roller"].includes(measurementBasis) ? DYNO_TIRE_FIELDS : []),
      ...(dynoType === "chassis" && measurementBasis === "hub" ? DYNO_HUB_FIELDS : []),
      ...(["inertia_sweep", "loaded_sweep"].includes(mode) ? DYNO_SWEEP_FIELDS : []),
    ];
    setupFields = [
      "vehicle_engine", "fuel", "test_method", "dyno_model", "dyno_type",
      "dyno_measurement_basis", "dyno_load_mode", "dyno_correction_standard",
      "dyno_fan_setup", "instrument_calibration",
      "ambient_temp_c", "ambient_pressure_kpa", "relative_humidity_pct",
      ...(dynoType === "chassis" ? DYNO_CHASSIS_FIELDS : []),
      ...(dynoType === "chassis" && ["wheel", "roller"].includes(measurementBasis) ? DYNO_TIRE_FIELDS : []),
      ...(dynoType === "chassis" && measurementBasis === "hub" ? DYNO_HUB_FIELDS : []),
      ...(["inertia_sweep", "loaded_sweep"].includes(mode) ? DYNO_SWEEP_FIELDS : []),
    ];
  } else {
    findings.push({ code: "unsupported_protocol_mode", message: "Modo no reconocido para el dominio. ECU: steady_state/transient; dinamómetro: inertia_sweep/loaded_sweep/steady_state." });
    requiredFields = [];
    setupFields = [];
  }
  findings.push(...assessRequiredConditions(runs, requiredFields));
  findings.push(...assessStableSetup(runs, setupFields, normalizedSetupTolerances));
  const pointIds = new Set(runs.map(run => run?.operatingPointId).filter(Boolean));
  const points = runs.map(run => run?.operatingPoint ?? null);
  const pointIsRequired = (domain === "ecu" && mode === "steady_state") ||
    (domain === "dyno" && ["inertia_sweep", "loaded_sweep", "steady_state"].includes(mode));
  const hasAnyPoint = points.some(point => point && typeof point === "object" && !Array.isArray(point));
  const pointValuesMismatch = (pointIsRequired || hasAnyPoint) &&
    (points.some(point => !point || typeof point !== "object" || Array.isArray(point)) ||
      !points.every(point => sameStructuredValue(points[0], point)));
  if (pointIds.size !== 1 || runs.some(run => !run?.operatingPointId) || pointValuesMismatch) {
    findings.push({ code: "operating_point_mismatch", message: "Cada repetición debe compartir el mismo identificador y los mismos valores efectivos del punto o tramo operativo; no alcanza con reutilizar un ID." });
  }
  const repeatability = assessRepeatability(runs, {
    minimumReplicates, maximumCvPct, maximumCvPctByMetric: normalizedMetricCvLimits,
    expectedMetrics: normalizedExpectedMetrics,
  });
  if (repeatability.status === "insufficient_replicates") {
    findings.push({ code: "insufficient_replicates", message: "Se requieren al menos " + minimumReplicates + " valores válidos por métrica para evaluar dispersión." });
  }
  for (const metric of repeatability.metrics) {
    if (metric.missingCount > 0) {
      findings.push({
        code: "metric_missing_replicate",
        field: metric.key,
        message: "La métrica " + metric.key + " falta en " + metric.missingCount +
          " de " + repeatability.replicateCount + " repeticiones; el cálculo no representa el grupo completo.",
      });
    }
  }
  if (repeatability.status === "incomplete_replicates") {
    findings.push({ code: "incomplete_replicates", message: "Hay métricas con al menos el mínimo de valores, pero faltan datos en una o más repeticiones; no se debe presentar el grupo como completo." });
  }
  for (const metric of repeatability.metrics.filter(item => item.status === "threshold_not_configured")) {
    findings.push({
      code: "repeatability_limit_missing",
      field: metric.key,
      message: "No se configuró un límite de CV para la métrica " + metric.key +
        "; se informa la dispersión, pero no se aprueba.",
    });
  }
  if (repeatability.metrics.some(metric => metric.status === "above_user_limit")) {
    findings.push({ code: "repeatability_limit_exceeded", message: "Al menos una métrica supera el límite de CV definido por el usuario." });
  }
  for (const metric of repeatability.metrics.filter(item => item.status === "not_calculable")) {
    findings.push({
      code: "repeatability_metric_not_calculable",
      field: metric.key,
      message: "No se puede calcular el CV de " + metric.key + " porque su media es cero; el resultado queda pendiente de un criterio absoluto definido para esa métrica.",
    });
  }
  if (!repeatability.metrics.length) {
    findings.push({ code: "no_repeatability_metrics", message: "No hay métricas numéricas para evaluar repetibilidad." });
  }
  if (domain === "ecu" && mode === "steady_state") {
    const stabilizationValues = runs.map(run => run?.protocol?.stabilizationMinutes);
    const stabilization = stabilizationValues[0];
    if (stabilizationValues.some(Number.isFinite) &&
        !stabilizationValues.every(value => Number.isFinite(value) && value === stabilization)) {
      findings.push({ code: "protocol_configuration_mismatch", message: "Las repeticiones declaran tiempos de estabilización distintos; no deben agruparse como un mismo protocolo." });
    }
    if (!Number.isFinite(stabilization) || stabilization <= 0) {
      findings.push({ code: "stabilization_not_declared", message: "Declarar el tiempo de estabilización antes de adquirir cada punto estacionario." });
    } else if (stabilization < 5) {
      findings.push({ code: "stabilization_below_reference_case", message: "La estabilización es menor a 5 minutos. Un estudio publicado utilizó al menos 5 minutos; ese valor es una referencia de caso, no un mínimo universal." });
    }
  }
  if (domain === "ecu" && mode === "steady_state" &&
      runs.some(run => {
        const point = run?.operatingPoint;
        return !Number.isFinite(point?.rpm) || point.rpm <= 0 ||
          (!Number.isFinite(point?.loadPct) && !Number.isFinite(point?.throttlePct));
      })) {
    findings.push({ code: "operating_point_incomplete", message: "Un punto ECU estacionario debe declarar RPM y carga o posición de acelerador." });
  }
  if (domain === "dyno" && ["inertia_sweep", "loaded_sweep"].includes(mode) &&
      runs.some(run => {
        const point = run?.operatingPoint;
        return !Number.isFinite(point?.rpmStart) || !Number.isFinite(point?.rpmEnd) || point.rpmEnd <= point.rpmStart;
      })) {
    findings.push({ code: "sweep_range_incomplete", message: "Un barrido de dinamómetro debe declarar RPM inicial y final válidas." });
  }
  if (domain === "dyno" && mode === "steady_state" &&
      runs.some(run => {
        const point = run?.operatingPoint;
        return !Number.isFinite(point?.rpm) || point.rpm <= 0 ||
          (!Number.isFinite(point?.loadNm) && !Number.isFinite(point?.loadPct));
      })) {
    findings.push({ code: "operating_point_incomplete", message: "Un punto estacionario de dinamómetro debe declarar RPM y carga." });
  }
  const blocked = findings.some(item => [
    "mixed_or_unknown_domain", "unsupported_protocol_mode", "dyno_type_unknown",
    "run_id_missing", "duplicate_run_id",
    "protocol_mismatch", "protocol_configuration_mismatch", "operating_point_mismatch",
    "dyno_type_mismatch", "dyno_measurement_basis_unknown",
    "dyno_measurement_basis_mismatch", "dyno_measurement_basis_incompatible",
  ].includes(item.code));
  const status = blocked ? "blocked" : findings.length ? "review_required" : "supported";
  return {
    schema: TEST_PROTOCOL_SCHEMA,
    domain,
    mode,
    protocolId: [...protocolIds][0] ?? null,
    operatingPointId: [...pointIds][0] ?? null,
    status,
    findings,
    requiredConditions: requiredFields,
    setupTolerances: normalizedSetupTolerances,
    repeatability,
    interpretation: "supported significa que se completaron los controles configurados; no equivale a certificación de norma, calibración trazable ni validación física.",
  };
}
