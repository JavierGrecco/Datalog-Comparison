/**
 * Comparación descriptiva de distribuciones entre dos registros importados.
 *
 * Resume muestras independientes; nunca alinea relojes, interpola ni calcula
 * diferencias punto a punto. Las puertas de dominio siguen siendo obligatorias.
 */
import { assessComparisonReadiness } from "./comparison-readiness.mjs";
import { assessRunComparability } from "./run-comparability.mjs";
import { assessSourceSet, SOURCE_DOMAIN } from "./source-policy.mjs";

export const DISTRIBUTION_COMPARISON_SCHEMA = "datalog-comparison.distribution-comparison/1";
export const DEFAULT_DISTRIBUTION_MINIMUM_COVERAGE_PCT = 80;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(run, key) {
  const samples = Array.isArray(run?.samples) ? run.samples : [];
  const values = samples.map(sample => sample?.channels?.[key]).filter(Number.isFinite);
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: samples.length,
    validCount: values.length,
    coveragePct: samples.length ? values.length / samples.length * 100 : 0,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: total / values.length,
    median: median(values),
  };
}

function sourceHash(run) {
  const hash = run?.runManifest?.sourceFiles?.[0]?.sha256 ?? run?.sha256 ?? null;
  return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash)
    ? hash.toLowerCase()
    : null;
}

function brief(run, domain) {
  return {
    id: String(run?.id ?? ""),
    name: String(run?.name ?? run?.filename ?? "Registro sin nombre"),
    domain,
    sampleCount: Array.isArray(run?.samples) ? run.samples.length : 0,
    sha256: sourceHash(run),
  };
}

/**
 * Compara medianas y rangos de muestras no emparejadas.
 * La salida no representa diferencias en el mismo instante ni en el mismo
 * punto operativo. Requiere mismo dominio, unidades compatibles y cobertura.
 */
export function compareRunDistributions(
  reference,
  candidate,
  { minimumCoveragePct = DEFAULT_DISTRIBUTION_MINIMUM_COVERAGE_PCT } = {},
) {
  if (!Number.isFinite(minimumCoveragePct) ||
      minimumCoveragePct < 0 || minimumCoveragePct > 100) {
    throw new RangeError("minimumCoveragePct debe estar entre 0 y 100.");
  }

  const sourceSet = assessSourceSet([reference, candidate]);
  const referenceDomain = sourceSet.domains[0] ?? SOURCE_DOMAIN.UNKNOWN;
  const candidateDomain = sourceSet.domains[1] ?? SOURCE_DOMAIN.UNKNOWN;
  const readiness = assessComparisonReadiness(reference, candidate, {
    minimumChannelCoveragePct: minimumCoveragePct,
  });
  const comparability = assessRunComparability(reference, candidate);
  const warnings = [
    "Se comparan distribuciones de muestras independientes; no se emparejaron instantes ni puntos operativos.",
    "No se alinearon relojes, no se interpolaron datos y no se calcularon deltas muestra a muestra.",
    "Una diferencia de medianas o rangos es descriptiva; no demuestra causalidad ni equivalencia física.",
    ...comparability.warnings,
    ...readiness.nextActions,
  ];
  const blockedReasons = [];

  if (sourceSet.status !== "same-domain" ||
      ![SOURCE_DOMAIN.ECU, SOURCE_DOMAIN.DYNO].includes(referenceDomain) ||
      referenceDomain !== candidateDomain) {
    blockedReasons.push(
      "Los dos registros deben pertenecer al mismo dominio identificado (ECU/logger o dinamómetro).",
    );
  }

  const referenceHash = sourceHash(reference);
  const candidateHash = sourceHash(candidate);
  const sameId = Boolean(reference?.id && candidate?.id && reference.id === candidate.id);
  if (sameId || (referenceHash && candidateHash && referenceHash === candidateHash)) {
    blockedReasons.push(
      "Los archivos de origen tienen el mismo identificador o SHA-256. No se comparan como si fueran dos ensayos independientes.",
    );
  }

  const sourceGate = readiness.gates?.find(gate => gate.id === "source");
  const dataGate = readiness.gates?.find(gate => gate.id === "data");
  const channelsGate = readiness.gates?.find(gate => gate.id === "channels");
  if (sourceGate?.status === "blocked") blockedReasons.push(sourceGate.summary);
  if (dataGate?.status === "blocked") blockedReasons.push(dataGate.summary);
  if (channelsGate?.status === "blocked") blockedReasons.push(channelsGate.summary);

  const channels = [];
  const excludedChannels = [];
  if (!blockedReasons.length) {
    for (const channel of comparability.commonChannels) {
      const referenceStats = summarize(reference, channel.key);
      const candidateStats = summarize(candidate, channel.key);
      if (!referenceStats || !candidateStats) continue;
      if (referenceStats.coveragePct < minimumCoveragePct ||
          candidateStats.coveragePct < minimumCoveragePct) {
        excludedChannels.push({
          key: channel.key,
          reason: "La cobertura es inferior al " + minimumCoveragePct + "% en al menos uno de los registros.",
          referenceCoveragePct: referenceStats.coveragePct,
          candidateCoveragePct: candidateStats.coveragePct,
        });
        continue;
      }

      const medianDelta = candidateStats.median - referenceStats.median;
      const meanDelta = candidateStats.mean - referenceStats.mean;
      channels.push({
        key: channel.key,
        unit: channel.unit,
        reference: referenceStats,
        candidate: candidateStats,
        difference: {
          median: medianDelta,
          mean: meanDelta,
          medianPct: Math.abs(referenceStats.median) > Number.EPSILON
            ? medianDelta / Math.abs(referenceStats.median) * 100
            : null,
          min: candidateStats.min - referenceStats.min,
          max: candidateStats.max - referenceStats.max,
        },
      });
    }
  }

  if (!blockedReasons.length && channels.length === 0) {
    blockedReasons.push(
      "No hay canales compartidos que alcancen la cobertura mínima en ambos registros.",
    );
  }

  const status = blockedReasons.length
    ? "blocked"
    : readiness.status === "review_required"
      ? "review_required"
      : "descriptive_only";

  return {
    schema: DISTRIBUTION_COMPARISON_SCHEMA,
    status,
    headline: status === "blocked"
      ? "Comparación bloqueada"
      : status === "review_required"
        ? "Resumen descriptivo; requiere revisión"
        : "Resumen descriptivo disponible",
    method: "unpaired-distribution-summary/1",
    timeAlignment: {
      performed: false,
      reason: "El sistema no recibió una referencia temporal común verificada. Las estadísticas resumen cada registro por separado.",
    },
    minimumCoveragePct,
    reference: brief(reference, referenceDomain),
    candidate: brief(candidate, candidateDomain),
    channels,
    excludedChannels,
    blockedReasons,
    warnings: [...new Set(warnings)],
    readiness: {
      status: readiness.status,
      headline: readiness.headline,
      gates: readiness.gates,
    },
    nextActions: readiness.nextActions,
    causalInferenceAllowed: false,
    sourceDataModified: false,
  };
}
