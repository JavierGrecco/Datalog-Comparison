import { DISTRIBUTION_COMPARISON_SCHEMA } from "./distribution-comparison.mjs";

export const IMPORTED_COMPARISON_REPORT_SCHEMA = "datalog-imported-run-comparison/1";

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MEASUREMENT_BASES = new Set(["wheel", "roller", "hub", "engine", "unknown"]);
const MEASUREMENT_BASIS_LABELS = Object.freeze({
  wheel: "rueda", roller: "rodillo", hub: "cubo", engine: "motor", unknown: "desconocida",
});

function safeString(value, maximumLength = 500) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function safeFileName(value) {
  const normalized = safeString(value, 512) ?? "Registro sin nombre";
  const basename = normalized.split(/[\\/]/).pop()?.trim();
  return (basename || "Registro sin nombre").slice(0, 180);
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function safeStringList(value, limit = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map(item => safeString(item, 1200)).filter(Boolean);
}

function safeMeasurementBasis(value) {
  return MEASUREMENT_BASES.has(value) ? value : null;
}

function sourceSha256(run, comparisonRun) {
  const candidate = comparisonRun?.sha256
    ?? run?.runManifest?.sourceFiles?.[0]?.sha256
    ?? run?.sha256;
  return typeof candidate === "string" && /^[a-f0-9]{64}$/i.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function exportUnits(units) {
  if (!units || typeof units !== "object" || Array.isArray(units)) return {};
  return Object.fromEntries(Object.entries(units)
    .filter(([key, unit]) => SAFE_KEY.test(key) && typeof unit === "string" && unit.trim())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, unit]) => [key, safeString(unit, 48)]));
}

function exportImportMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const output = {};
  for (const [key, maximumLength] of [
    ["parserId", 120], ["importFormat", 120], ["sourceEncoding", 40],
    ["unitNormalizationVersion", 80],
  ]) {
    const value = safeString(metadata[key], maximumLength);
    if (value) output[key] = value;
  }

  for (const key of ["sourceRowCount", "skippedNonEmptyRowCount", "skippedEmptyRowCount", "parsedSampleCount"]) {
    const value = safeInteger(metadata[key]);
    if (value !== null) output[key] = value;
  }

  if (Array.isArray(metadata.headerRows)) {
    output.headerRows = metadata.headerRows.slice(0, 8).map(safeInteger).filter(value => value !== null);
  }

  if (Array.isArray(metadata.channelMapping)) {
    output.channelMapping = metadata.channelMapping.slice(0, 128).flatMap(item => {
      if (!item || typeof item !== "object" || !SAFE_KEY.test(item.channel ?? "")) return [];
      const mapping = { channel: item.channel };
      for (const [key, maximumLength] of [
        ["sourceHeader", 180], ["sourceUnit", 48], ["canonicalUnit", 48],
      ]) {
        const value = safeString(item[key], maximumLength);
        if (value) mapping[key] = value;
      }
      return [mapping];
    });
  }

  if (metadata.unitConversions && typeof metadata.unitConversions === "object" &&
      !Array.isArray(metadata.unitConversions)) {
    const conversions = {};
    for (const [key, conversion] of Object.entries(metadata.unitConversions)) {
      if (!SAFE_KEY.test(key) || !conversion || typeof conversion !== "object") continue;
      const from = safeString(conversion.from, 48);
      const to = safeString(conversion.to, 48);
      if (!from || !to) continue;
      conversions[key] = {
        from, to,
        factor: finiteOrNull(conversion.factor),
        offset: finiteOrNull(conversion.offset),
      };
    }
    if (Object.keys(conversions).length) output.unitConversions = conversions;
  }

  if (Array.isArray(metadata.unmappedHeaders)) output.unmappedHeaderCount = metadata.unmappedHeaders.length;
  return Object.keys(output).length ? output : null;
}

function exportRun(run, comparisonRun, role) {
  const basis = safeMeasurementBasis(run?.measurementBasis);
  return {
    role,
    id: safeString(comparisonRun?.id ?? run?.id, 128),
    name: safeFileName(run?.name ?? run?.filename ?? comparisonRun?.name),
    domain: safeString(comparisonRun?.domain, 40) ?? "unknown",
    sourceType: safeString(run?.sourceType, 160),
    sampleCount: safeInteger(comparisonRun?.sampleCount) ?? 0,
    sha256: sourceSha256(run, comparisonRun),
    measurementBasis: basis,
    measurementBasisLabel: basis ? MEASUREMENT_BASIS_LABELS[basis] : null,
    units: exportUnits(run?.units),
    import: exportImportMetadata(run?.importMetadata),
  };
}

function exportStatistics(statistics) {
  if (!statistics || typeof statistics !== "object") return null;
  return {
    sampleCount: safeInteger(statistics.sampleCount),
    validCount: safeInteger(statistics.validCount),
    coveragePct: finiteOrNull(statistics.coveragePct),
    min: finiteOrNull(statistics.min),
    max: finiteOrNull(statistics.max),
    mean: finiteOrNull(statistics.mean),
    median: finiteOrNull(statistics.median),
  };
}

function exportGate(gate) {
  if (!gate || typeof gate !== "object") return null;
  return {
    id: safeString(gate.id, 80),
    label: safeString(gate.label, 160),
    status: safeString(gate.status, 40),
    summary: safeString(gate.summary, 1200),
    findings: safeStringList(gate.findings, 40),
  };
}

/** Serializes a comparison without raw samples, CSV rows, source cells, paths, or full adapter metadata. */
export function buildImportedComparisonReport({
  referenceRun, candidateRun, result, exportedAt = new Date().toISOString(),
} = {}) {
  if (!referenceRun || !candidateRun || !result ||
      result.schema !== DISTRIBUTION_COMPARISON_SCHEMA) {
    throw new TypeError("Se necesitan dos registros importados y un resultado de comparación de distribuciones válido.");
  }
  const timestamp = Date.parse(exportedAt);
  if (!Number.isFinite(timestamp)) throw new RangeError("exportedAt debe ser una fecha válida.");

  const channels = (Array.isArray(result.channels) ? result.channels : []).map(channel => ({
    key: safeString(channel?.key, 64),
    unit: safeString(channel?.unit, 48),
    reference: exportStatistics(channel?.reference),
    candidate: exportStatistics(channel?.candidate),
    difference: {
      median: finiteOrNull(channel?.difference?.median),
      mean: finiteOrNull(channel?.difference?.mean),
      medianPct: finiteOrNull(channel?.difference?.medianPct),
      min: finiteOrNull(channel?.difference?.min),
      max: finiteOrNull(channel?.difference?.max),
    },
  })).filter(channel => channel.key);

  const excludedChannels = (Array.isArray(result.excludedChannels) ? result.excludedChannels : [])
    .map(channel => ({
      key: safeString(channel?.key, 64),
      reasonCode: safeString(channel?.reasonCode, 80),
      reason: safeString(channel?.reason, 1200),
      referenceUnit: safeString(channel?.referenceUnit, 48),
      candidateUnit: safeString(channel?.candidateUnit, 48),
      referenceMeasurementBasis: safeMeasurementBasis(channel?.referenceMeasurementBasis),
      candidateMeasurementBasis: safeMeasurementBasis(channel?.candidateMeasurementBasis),
      referenceCount: safeInteger(channel?.referenceCount),
      candidateCount: safeInteger(channel?.candidateCount),
      referenceCoveragePct: finiteOrNull(channel?.referenceCoveragePct),
      candidateCoveragePct: finiteOrNull(channel?.candidateCoveragePct),
    })).filter(channel => channel.key);

  const gates = (Array.isArray(result.readiness?.gates) ? result.readiness.gates : [])
    .map(exportGate).filter(Boolean);

  return {
    schema: IMPORTED_COMPARISON_REPORT_SCHEMA,
    exportedAt: new Date(timestamp).toISOString(),
    status: safeString(result.status, 40),
    headline: safeString(result.headline, 200),
    method: safeString(result.method, 100),
    minimumCoveragePct: finiteOrNull(result.minimumCoveragePct),
    reference: exportRun(referenceRun, result.reference, "reference"),
    candidate: exportRun(candidateRun, result.candidate, "candidate"),
    timeAlignment: {
      performed: result.timeAlignment?.performed === true,
      reason: safeString(result.timeAlignment?.reason, 1200),
    },
    channels,
    excludedChannels,
    blockedReasons: safeStringList(result.blockedReasons, 100),
    readiness: {
      status: safeString(result.readiness?.status, 40),
      headline: safeString(result.readiness?.headline, 200),
      gates,
    },
    warnings: safeStringList(result.warnings, 100),
    nextActions: safeStringList(result.nextActions, 100),
    policy: {
      causalInferenceAllowed: result.causalInferenceAllowed === true,
      sourceDataModified: result.sourceDataModified === true,
    },
    limitations: [
      "Cada archivo se resume por separado; las estadísticas no emparejan muestras ni puntos operativos.",
      "No se alinearon relojes, no se interpolaron señales y no se calcularon diferencias punto a punto.",
      "Una diferencia estadística no demuestra causalidad ni equivalencia física.",
      "El SHA-256 identifica igualdad de bytes; no autentica el archivo, su origen, sensores ni condiciones de medición.",
      "Las unidades, el dominio y la base física provienen de la importación y requieren revisión contra la fuente original.",
    ],
  };
}
