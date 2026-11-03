/**
 * Matriz de preparación de comparación de Datalog Workbench.
 *
 * Ensambla contratos propios ya existentes (fuente, calidad, unidades,
 * condiciones y manifiesto) en una evaluación explicable. No calcula un
 * puntaje de confianza ni declara que dos ensayos sean físicamente equivalentes.
 * Un resultado favorable solo permite describir los canales compatibles.
 */
import { assessRunComparability } from "./run-comparability.mjs";
import { assessRunDataQuality } from "./data-quality.mjs";
import {
  compareOperatingConditions,
  validateOperatingConditions,
} from "./operating-conditions.mjs";
import { assessManifestComparability } from "./run-manifest.mjs";
import { assessSourceSet, SOURCE_DOMAIN } from "./source-policy.mjs";

export const COMPARISON_READINESS_SCHEMA = "datalog-workbench.comparison-readiness/1";
export const DEFAULT_MINIMUM_CHANNEL_COVERAGE_PCT = 80;

const CORE_CONDITION_KEYS = Object.freeze([
  "vehicle_engine",
  "calibration_id",
  "fuel",
  "gear",
  "test_method",
  "hardware_notes",
]);
const ECU_RELEVANT_CONDITION_KEYS = Object.freeze([
  "throttle_pct",
  "load_pct",
  "ambient_temp_c",
  "intake_temp_c",
  "coolant_temp_c",
]);
const DYNO_RELEVANT_CONDITION_KEYS = Object.freeze([
  "ambient_temp_c",
  "ambient_pressure_kpa",
  "relative_humidity_pct",
  "vehicle_mass_kg",
  "tire_size",
  "tire_pressure_kpa",
  "dyno_ramp_rate_rpm_s",
  "dyno_smoothing_setting",
  "dyno_load_mode",
]);

const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const unique = values => [...new Set(values)];
const isSynthetic = run => run?.synthetic === true;

function gate(id, label, status, summary, findings = []) {
  return { id, label, status, summary, findings };
}

function conditionAssessment(reference, candidate) {
  const sourceSet = assessSourceSet([reference, candidate]);
  const dynoOnly = sourceSet.domains.every(domain => domain === SOURCE_DOMAIN.DYNO);
  const ecuOnly = sourceSet.domains.every(domain => domain === SOURCE_DOMAIN.ECU);
  // Cuando el origen todavía no está identificado, mantener ambos grupos de
  // condiciones visibles es más seguro que asumir uno de los dominios.
  const relevantKeys = dynoOnly
    ? DYNO_RELEVANT_CONDITION_KEYS
    : ecuOnly
      ? ECU_RELEVANT_CONDITION_KEYS
      : [...ECU_RELEVANT_CONDITION_KEYS, ...DYNO_RELEVANT_CONDITION_KEYS];
  const trackedKeys = new Set([...CORE_CONDITION_KEYS, ...relevantKeys]);
  const all = compareOperatingConditions(reference, candidate);
  const tracked = all.filter(item => trackedKeys.has(item.key));
  const differences = tracked.filter(item => item.status === "different");
  const unknown = tracked.filter(item => item.status === "unknown");
  const unverifiedMatches = tracked.filter(item => item.status === "same_value_unverified");
  const verifiedMatches = tracked.filter(item => item.status === "same_verified");

  // Comparar valores no alcanza: una entrada marcada como verificada debe
  // conservar una fuente y respetar el contrato de operating-conditions/1.
  const validationErrors = [
    ...validateOperatingConditions(
      reference?.operatingConditions,
      "referencia.operatingConditions",
    ),
    ...validateOperatingConditions(
      candidate?.operatingConditions,
      "candidata.operatingConditions",
    ),
  ];

  return {
    status: differences.length || unknown.length || unverifiedMatches.length || validationErrors.length
      ? "review_required"
      : "supported",
    tracked,
    differences,
    unknown,
    unverifiedMatches,
    verifiedMatches,
    validationErrors,
    relevantKeys: [...trackedKeys],
  };
}

function assessTiming(reference, candidate, referenceQuality, candidateQuality) {
  const findings = [];
  const referenceCount = referenceQuality.timestamp.validCount;
  const candidateCount = candidateQuality.timestamp.validCount;
  if (referenceCount < referenceQuality.sampleCount || candidateCount < candidateQuality.sampleCount) {
    findings.push("Hay muestras sin tiempo numérico en uno o ambos registros.");
  }
  if (!referenceQuality.timestamp.ordered || !candidateQuality.timestamp.ordered) {
    findings.push("Al menos una secuencia temporal retrocede; no se reordenaron las muestras.");
  }
  if (referenceQuality.timestamp.duplicateAdjacentTimes || candidateQuality.timestamp.duplicateAdjacentTimes) {
    findings.push("Hay marcas de tiempo consecutivas duplicadas.");
  }
  const referenceDuration = referenceQuality.timestamp.durationSeconds;
  const candidateDuration = candidateQuality.timestamp.durationSeconds;
  if (isFiniteNumber(referenceDuration) && isFiniteNumber(candidateDuration) &&
      Math.abs(referenceDuration - candidateDuration) > 1e-9) {
    findings.push("Las duraciones registradas difieren entre los dos ensayos.");
  }
  if (referenceQuality.sampleCount !== candidateQuality.sampleCount) {
    findings.push("Los registros tienen distinto número de muestras.");
  }
  return { status: findings.length ? "review_required" : "supported", findings };
}

function getDataFindings(referenceQuality, candidateQuality) {
  const findings = [];
  for (const [label, quality] of [
    ["Referencia", referenceQuality],
    ["Candidata", candidateQuality],
  ]) {
    if (quality.status === "insufficient_data") {
      addUnique(findings, label + ": hay menos de dos muestras o no hay canales analizables.");
    }
    // El perfil de calidad es la fuente de verdad de sus advertencias. No
    // descartar hallazgos que no estén duplicados en la lógica de comparabilidad
    // (por ejemplo, filas no vacías omitidas durante la importación).
    for (const warning of Array.isArray(quality.warnings) ? quality.warnings : []) {
      addUnique(findings, label + ": " + warning);
    }
  }
  return findings;
}

function addUnique(target, message) {
  if (message && !target.includes(message)) target.push(message);
}

/**
 * Devuelve puertas de evidencia explicables, hallazgos observables y próximos
 * pasos. "descriptive_only" nunca significa validación de dominio o equivalencia
 * física. El umbral de cobertura es una política visible y configurable.
 */
export function assessComparisonReadiness(
  reference,
  candidate,
  { minimumChannelCoveragePct = DEFAULT_MINIMUM_CHANNEL_COVERAGE_PCT } = {},
) {
  if (!isFiniteNumber(minimumChannelCoveragePct) ||
      minimumChannelCoveragePct < 0 || minimumChannelCoveragePct > 100) {
    throw new RangeError("minimumChannelCoveragePct debe estar entre 0 y 100.");
  }

  if (!reference || !candidate) {
    const message = "Se necesitan una referencia y una candidata para revisar una comparación.";
    return {
      schema: COMPARISON_READINESS_SCHEMA,
      status: "blocked",
      headline: "Comparación bloqueada",
      summary: message,
      minimumChannelCoveragePct,
      gates: [
        gate("source", "Origen", "review_required", "Faltan dos registros para evaluar el origen."),
        gate("data", "Datos y tiempo", "blocked", message),
        gate("channels", "Canales y unidades", "blocked", message),
        gate("conditions", "Condiciones", "review_required", "No se pueden comparar condiciones sin ambos registros."),
        gate("provenance", "Procedencia", "review_required", "No se puede evaluar la trazabilidad sin ambos registros."),
      ],
      nextActions: [message],
      assessments: null,
    };
  }

  const source = assessSourceSet([reference, candidate]);
  const comparison = assessRunComparability(reference, candidate);
  const referenceQuality = assessRunDataQuality(reference);
  const candidateQuality = assessRunDataQuality(candidate);
  const timing = assessTiming(reference, candidate, referenceQuality, candidateQuality);
  const dataFindings = getDataFindings(referenceQuality, candidateQuality);
  const conditions = conditionAssessment(reference, candidate);
  const manifest = assessManifestComparability(reference.runManifest, candidate.runManifest);

  const channelsWithLowCoverage = comparison.commonChannels.filter(channel =>
    channel.referenceCoveragePct < minimumChannelCoveragePct ||
    channel.candidateCoveragePct < minimumChannelCoveragePct
  );
  const channelFindings = [];
  if (comparison.blockedChannels.length) {
    channelFindings.push(comparison.blockedChannels.length +
      " canal(es) se excluyeron por unidades ausentes o incompatibles.");
  }
  if (channelsWithLowCoverage.length) {
    channelFindings.push(channelsWithLowCoverage.length + " canal(es) compartidos tienen cobertura inferior al " +
      minimumChannelCoveragePct + "% en al menos un registro.");
  }
  if (!comparison.commonChannels.length) {
    channelFindings.push("No hay canales numéricos compartidos con unidades coincidentes y declaradas.");
  }

  const sourceStatus = !source.allowed
    ? "blocked"
    : source.status === "unclassified" || source.status === "single-source"
      ? "review_required"
      : "supported";

  const dataBlocked = referenceQuality.sampleCount < 2 || candidateQuality.sampleCount < 2 ||
    referenceQuality.status === "insufficient_data" || candidateQuality.status === "insufficient_data";
  const dataStatus = dataBlocked
    ? "blocked"
    : dataFindings.length || timing.findings.length
      ? "review_required"
      : "supported";

  const channelStatus = comparison.commonChannels.length === 0
    ? "blocked"
    : comparison.blockedChannels.length || channelsWithLowCoverage.length
      ? "review_required"
      : "supported";

  const conditionStatus = conditions.status;
  const provenanceStatus = manifest.status === "no_documented_differences"
    ? "supported"
    : "review_required";

  const syntheticRuns = [reference, candidate].filter(isSynthetic).map(run => String(run.name ?? run.id ?? "Registro sintético"));
  const gates = [
    gate(
      "source", "Origen de datos", sourceStatus,
      source.allowed ? source.message : "No se autoriza la comparación numérica entre estos orígenes.",
      source.reasons,
    ),
    gate(
      "data", "Calidad de datos y tiempo", dataStatus,
      dataBlocked
        ? "No hay suficientes datos para una comparación descriptiva."
        : dataStatus === "review_required"
          ? "Hay problemas observables que deben revisarse antes de interpretar diferencias."
          : "No se detectaron problemas evidentes de estructura/tiempo en las comprobaciones aplicadas.",
      unique([...dataFindings, ...timing.findings]),
    ),
    gate(
      "channels", "Canales, unidades y cobertura", channelStatus,
      comparison.commonChannels.length
        ? comparison.commonChannels.length + " canal(es) permiten una comparación numérica descriptiva."
        : "No se habilita ningún canal compartido para comparar.",
      channelFindings,
    ),
    gate(
      "conditions", "Condiciones de ensayo", conditionStatus,
      conditionStatus === "supported"
        ? "Las condiciones clave registradas coinciden y están marcadas como verificadas por quien las carga."
        : "Hay condiciones críticas desconocidas, no verificadas, distintas o con un contrato inválido.",
      [
        ...conditions.differences.map(item => item.label + ": valores distintos."),
        ...conditions.unknown.map(item => item.label + ": falta un valor usable en al menos un registro."),
        ...conditions.unverifiedMatches.map(item => item.label + ": coincide el valor registrado, pero no está marcado como verificado en ambos."),
        ...conditions.validationErrors,
      ],
    ),
    gate(
      "provenance", "Procedencia y roles", provenanceStatus,
      manifest.status === "no_documented_differences"
        ? "Los campos de procedencia disponibles no muestran diferencias importantes; no se autentican independientemente."
        : "Revisá los roles, hashes, metadatos y campos críticos del manifiesto.",
      manifest.warnings,
    ),
  ];

  if (syntheticRuns.length) {
    gates.push(gate(
      "real-world-validation", "Validación con datos reales", "review_required",
      "Hay datos sintéticos: sirven para probar el software, no para validar un motor.",
      ["Registros sintéticos: " + syntheticRuns.join(", ") + "."],
    ));
  }

  const hardBlock = sourceStatus === "blocked" || dataStatus === "blocked" || channelStatus === "blocked";
  const needsReview = gates.some(item => item.status === "review_required");
  const status = hardBlock ? "blocked" : needsReview ? "review_required" : "descriptive_only";
  const headline = status === "blocked"
    ? "Comparación bloqueada"
    : status === "review_required"
      ? "Revisión de evidencia necesaria"
      : "Solo comparación descriptiva";

  const nextActions = [];
  if (!source.allowed) {
    addUnique(nextActions, "Separá los registros ECU/logger y dinamómetro. Podés documentar su relación en un expediente, pero una asociación declarada no habilita deltas entre fuentes.");
  } else if (source.status === "unclassified") {
    addUnique(nextActions, "Confirmá el origen de ambos registros antes de interpretar la comparación.");
  }

  if (dataBlocked) addUnique(nextActions, "Cargá registros con al menos dos muestras y un canal numérico utilizable por ensayo.");
  if (timing.findings.some(item => /tiempo numérico|secuencia temporal|marcas de tiempo/.test(item))) {
    addUnique(nextActions, "Revisá las marcas de tiempo originales. No se reordenan, interpolan ni sincronizan automáticamente.");
  }
  if (timing.findings.some(item => /distinto número de muestras|duraciones/.test(item))) {
    addUnique(nextActions, "Inspeccioná la cobertura temporal y el tramo común antes de comparar máximos.");
  }
  if (dataFindings.length) addUnique(nextActions, "Revisá los valores ausentes y los metadatos de importación; no se imputan mediciones faltantes.");
  if (!comparison.commonChannels.length) {
    addUnique(nextActions, "Verificá el mapeo de canales y las unidades de origen; no conviertas unidades automáticamente.");
  }
  if (comparison.blockedChannels.length) addUnique(nextActions, "Documentá o corregí los canales con unidades desconocidas/incompatibles antes de habilitarlos.");
  if (channelsWithLowCoverage.length) {
    addUnique(nextActions, "Inspeccioná la cobertura de " + channelsWithLowCoverage.slice(0, 5).map(item => item.key).join(", ") +
      " (mínimo de revisión configurado: " + minimumChannelCoveragePct + "%).");
  }
  if (conditions.validationErrors.length) {
    addUnique(nextActions, "Corregí el contrato de condiciones operativas y documentá la fuente de cada valor informado, medido o marcado como verificado.");
  }
  if (conditions.differences.length) {
    addUnique(nextActions, "Revisá las condiciones registradas que difieren: " +
      conditions.differences.slice(0, 5).map(item => item.label).join(", ") + ".");
  }
  if (conditions.unknown.length) {
    addUnique(nextActions, "Registrá la fuente/estado de las condiciones clave que faltan; un dato desconocido no debe tratarse como equivalente.");
  }
  if (conditions.unverifiedMatches.length) {
    addUnique(nextActions, "Confirmá la documentación de condiciones que solo coinciden por valor declarado; la aplicación no autentica esos datos.");
  }
  if (provenanceStatus !== "supported") {
    addUnique(nextActions, "Completá los roles referencia/candidata, SHA-256 y metadatos críticos de ambos manifiestos. La huella vincula bytes, no prueba que el ensayo sea válido.");
  }
  if (syntheticRuns.length) {
    addUnique(nextActions, "Para validar el comportamiento del dominio, sustituí los ejemplos sintéticos por registros reales autorizados y revisados por una persona experta.");
  }
  if (!nextActions.length) {
    addUnique(nextActions, "La comparación sigue siendo descriptiva. Antes de extraer conclusiones mecánicas, confirmá la base física, el método de medición y la equivalencia de las condiciones con un profesional.");
  }

  const summaries = gates.map(item => item.status === "blocked" ? item.label + " bloqueado" :
    item.status === "review_required" ? item.label + " requiere revisión" : null).filter(Boolean);
  const summary = status === "blocked"
    ? "No se habilita una comparación numérica fiable: " + summaries.join("; ") + "."
    : status === "review_required"
      ? "La comparación puede servir para explorar los datos, pero quedan comprobaciones pendientes: " + summaries.join("; ") + "."
      : "Las puertas automatizadas revisadas no encontraron bloqueos. El resultado continúa siendo descriptivo y no certifica equivalencia física ni causalidad.";

  return {
    schema: COMPARISON_READINESS_SCHEMA,
    status,
    headline,
    summary,
    minimumChannelCoveragePct,
    gates,
    nextActions,
    assessments: {
      source,
      comparison,
      dataQuality: { reference: referenceQuality, candidate: candidateQuality },
      timing,
      operatingConditions: conditions,
      manifest,
      syntheticRuns,
    },
  };
}
