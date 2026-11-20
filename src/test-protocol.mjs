import { validateOperatingConditions } from "./operating-conditions.mjs";

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
const DYNO_FIELDS = [
  "vehicle_engine", "fuel", "gear", "test_method", "dyno_model",
  "dyno_load_mode", "dyno_ramp_rate_rpm_s", "dyno_smoothing_setting",
  "dyno_correction_standard", "dyno_fan_setup", "instrument_calibration",
  "tire_size", "tire_pressure_kpa", "tire_condition", "dyno_strapping",
  "ambient_temp_c", "ambient_pressure_kpa", "relative_humidity_pct",
];

const usable = entry => entry && ["measured", "verified"].includes(entry.status) &&
  entry.value !== null && entry.value !== "" && typeof entry.source === "string" && entry.source.trim();
const sameValue = (a, b) => typeof a === "string" && typeof b === "string"
  ? a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
  : Object.is(a, b);

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
      continue;
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

function assessStableSetup(runs, keys) {
  const findings = [];
  if (runs.length < 2) return findings;
  for (const key of keys) {
    const entries = runs.map(run => getCondition(run, key));
    if (entries.some(entry => !usable(entry))) continue;
    if (!entries.every(entry => sameValue(entries[0].value, entry.value))) {
      findings.push({ code: "setup_mismatch", field: key,
        message: "La condición " + key + " cambia entre repeticiones; no deben agruparse como un mismo protocolo sin revisión." });
    }
  }
  return findings;
}

function coefficientOfVariation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / Math.abs(mean) * 100;
}

export function assessRepeatability(replicates, {
  minimumReplicates = 3,
  maximumCvPct = null,
} = {}) {
  if (!Array.isArray(replicates)) throw new TypeError("replicates debe ser una lista.");
  if (!Number.isInteger(minimumReplicates) || minimumReplicates < 2) {
    throw new RangeError("minimumReplicates debe ser un entero mayor o igual a 2.");
  }
  if (maximumCvPct !== null && (!Number.isFinite(maximumCvPct) || maximumCvPct < 0)) {
    throw new RangeError("maximumCvPct debe ser un número finito no negativo o null.");
  }
  const metricKeys = [...new Set(replicates.flatMap(item =>
    Object.keys(item?.metrics ?? {}).filter(key => Number.isFinite(item.metrics[key]))))].sort();
  const metrics = metricKeys.map(key => {
    const values = replicates.map(item => item?.metrics?.[key]).filter(Number.isFinite);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const cvPct = values.length >= 2 ? coefficientOfVariation(values) : null;
    const rangePct = mean !== null && mean !== 0
      ? (Math.max(...values) - Math.min(...values)) / Math.abs(mean) * 100
      : null;
    const status = values.length < minimumReplicates ? "insufficient_replicates"
      : maximumCvPct === null ? "threshold_not_configured"
        : cvPct === null ? "not_calculable"
          : cvPct <= maximumCvPct ? "within_user_limit" : "above_user_limit";
    return { key, count: values.length, mean, min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null, cvPct, rangePct, status };
  });
  const hasNoMetrics = metrics.length === 0;
  const hasInsufficient = metrics.some(item => item.status === "insufficient_replicates");
  const hasNoThreshold = metrics.some(item => item.status === "threshold_not_configured");
  const hasExceeded = metrics.some(item => item.status === "above_user_limit");
  return {
    schema: TEST_PROTOCOL_SCHEMA,
    method: "sample-standard-deviation-coefficient-of-variation/1",
    replicateCount: replicates.length,
    minimumReplicates,
    maximumCvPct,
    status: hasNoMetrics ? "no_metrics" : hasInsufficient ? "insufficient_replicates"
      : hasExceeded ? "review_required"
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
  minimumReplicates = 3,
} = {}) {
  if (!Array.isArray(runs) || !runs.length) throw new TypeError("Se necesita al menos un registro.");
  const domains = new Set(runs.map(run => run?.domain));
  if (domains.size !== 1 || !["ecu", "dyno"].includes([...domains][0])) {
    return { schema: TEST_PROTOCOL_SCHEMA, status: "blocked",
      findings: [{ code: "mixed_or_unknown_domain", message: "El protocolo requiere registros del mismo dominio identificado: ECU o dinamómetro." }],
      repeatability: assessRepeatability([], { minimumReplicates, maximumCvPct }) };
  }
  const domain = [...domains][0];
  const modes = new Set(runs.map(run => run?.protocol?.mode));
  const protocolIds = new Set(runs.map(run => run?.protocol?.id));
  const findings = [];
  if (modes.size !== 1 || protocolIds.size !== 1 || runs.some(run => !run?.protocol?.id || !run?.protocol?.mode)) {
    findings.push({ code: "protocol_mismatch", message: "Las repeticiones deben declarar el mismo protocolo y modo de adquisición." });
  }
  const mode = [...modes][0];
  let requiredFields;
  let setupFields;
  if (domain === "ecu" && mode === "steady_state") {
    requiredFields = ECU_STEADY_FIELDS;
    setupFields = ["calibration_id", "fuel"];
  } else if (domain === "ecu" && mode === "transient") {
    requiredFields = ECU_TRANSIENT_FIELDS;
    setupFields = ["vehicle_engine", "calibration_id", "fuel"];
  } else if (domain === "dyno" && ["inertia_sweep", "loaded_sweep", "steady_state"].includes(mode)) {
    requiredFields = DYNO_FIELDS;
    setupFields = ["vehicle_engine", "fuel", "gear", "dyno_model", "dyno_load_mode",
      "dyno_ramp_rate_rpm_s", "dyno_smoothing_setting", "dyno_correction_standard",
      "dyno_fan_setup", "instrument_calibration", "tire_size", "tire_pressure_kpa",
      "tire_condition", "dyno_strapping"];
  } else {
    findings.push({ code: "unsupported_protocol_mode", message: "Modo no reconocido para el dominio. ECU: steady_state/transient; dinamómetro: inertia_sweep/loaded_sweep/steady_state." });
    requiredFields = [];
    setupFields = [];
  }
  findings.push(...assessRequiredConditions(runs, requiredFields));
  findings.push(...assessStableSetup(runs, setupFields));
  const pointIds = new Set(runs.map(run => run?.operatingPointId).filter(Boolean));
  if (pointIds.size !== 1 || runs.some(run => !run?.operatingPointId)) {
    findings.push({ code: "operating_point_mismatch", message: "Cada repetición debe compartir un operatingPointId que identifique el mismo punto objetivo (RPM/carga o tramo de barrido)." });
  }
  const repeatability = assessRepeatability(runs, { minimumReplicates, maximumCvPct });
  if (repeatability.status === "insufficient_replicates") {
    findings.push({ code: "insufficient_replicates", message: "Se requieren al menos " + minimumReplicates + " repeticiones válidas para evaluar dispersión." });
  }
  if (repeatability.status === "threshold_not_configured") {
    findings.push({ code: "repeatability_limit_missing", message: "No se configuró un límite de CV específico para este equipo y método; la dispersión se informa sin aprobarla." });
  }
  if (repeatability.status === "review_required") {
    findings.push({ code: "repeatability_limit_exceeded", message: "Al menos una métrica supera el límite de CV definido por el usuario." });
  }
  const blocked = findings.some(item => ["mixed_or_unknown_domain", "unsupported_protocol_mode"].includes(item.code));
  if (!repeatability.metrics.length) {
    findings.push({ code: "no_repeatability_metrics", message: "No hay métricas numéricas para evaluar repetibilidad." });
  }
  if (domain === "ecu" && mode === "steady_state") {
    const stabilization = runs[0]?.protocol?.stabilizationMinutes;
    if (!Number.isFinite(stabilization) || stabilization <= 0) {
      findings.push({ code: "stabilization_not_declared", message: "Declarar el tiempo de estabilización antes de adquirir cada punto estacionario." });
    } else if (stabilization < 5) {
      findings.push({ code: "stabilization_below_reference_case", message: "La estabilización es menor a 5 minutos. Un estudio publicado utilizó al menos 5 minutos; ese valor es una referencia de caso, no un mínimo universal." });
    }
  }
  const point = runs[0]?.operatingPoint;
  if (domain === "ecu" && mode === "steady_state" &&
      (!Number.isFinite(point?.rpm) || point.rpm <= 0 ||
       (!Number.isFinite(point?.loadPct) && !Number.isFinite(point?.throttlePct)))) {
    findings.push({ code: "operating_point_incomplete", message: "Un punto ECU estacionario debe declarar RPM y carga o posición de acelerador." });
  }
  if (domain === "dyno" && ["inertia_sweep", "loaded_sweep"].includes(mode) &&
      (!Number.isFinite(point?.rpmStart) || !Number.isFinite(point?.rpmEnd) || point.rpmEnd <= point.rpmStart)) {
    findings.push({ code: "sweep_range_incomplete", message: "Un barrido de dinamómetro debe declarar RPM inicial y final válidas." });
  }
  if (domain === "dyno" && mode === "steady_state" &&
      (!Number.isFinite(point?.rpm) || point.rpm <= 0 ||
       (!Number.isFinite(point?.loadNm) && !Number.isFinite(point?.loadPct)))) {
    findings.push({ code: "operating_point_incomplete", message: "Un punto estacionario de dinamómetro debe declarar RPM y carga." });
  }
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
    repeatability,
    interpretation: "supported significa que se completaron los controles configurados; no equivale a certificación de norma, calibración trazable ni validación física.",
  };
}
