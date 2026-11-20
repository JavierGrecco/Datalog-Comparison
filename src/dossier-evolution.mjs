/**
 * Evolución descriptiva de candidatos dentro de un expediente.
 * No alinea muestras ni atribuye cambios a una modificación concreta.
 */
export const DOSSIER_EVOLUTION_SCHEMA = "datalog-dossier-evolution/1";

const finite = value => typeof value === "number" && Number.isFinite(value);

export function buildDossierEvolution(reports = []) {
  if (!Array.isArray(reports)) throw new TypeError("Los informes deben ser una lista.");
  const channels = new Map();
  const excludedReports = [];
  for (const stored of [...reports].sort((a, b) =>
    String(a.storedAt ?? "").localeCompare(String(b.storedAt ?? "")))) {
    const report = stored?.report;
    if (!report || report.schema !== "datalog-imported-run-comparison/1" ||
        report.status === "blocked" || !Array.isArray(report.channels)) {
      excludedReports.push({ reportId: stored?.id ?? null, reason: "Informe inválido o comparación bloqueada." });
      continue;
    }
    const reference = report.reference ?? {};
    const candidate = report.candidate ?? {};
    if (!reference.domain || reference.domain !== candidate.domain ||
        !["ecu", "dyno"].includes(reference.domain)) {
      excludedReports.push({ reportId: stored?.id ?? null, reason: "Dominio de origen ausente o incompatible." });
      continue;
    }
    const referenceBasis = reference.measurementBasis ?? null;
    const candidateBasis = candidate.measurementBasis ?? null;
    if (referenceBasis !== candidateBasis) {
      excludedReports.push({ reportId: stored?.id ?? null, reason: "Base de medición distinta entre referencia y candidata." });
      continue;
    }
    for (const channel of report.channels) {
      if (!channel?.key || typeof channel.unit !== "string" ||
          !finite(channel.candidate?.median) || !finite(channel.reference?.median)) continue;
      const key = channel.key + "|" + channel.unit + "|" + reference.domain + "|" + (referenceBasis ?? "no-declarada");
      if (!channels.has(key)) {
        channels.set(key, {
          key: channel.key,
          unit: channel.unit,
          domain: reference.domain,
          measurementBasis: referenceBasis,
          points: [],
        });
      }
      channels.get(key).points.push({
        reportId: stored.id,
        date: report.exportedAt ?? stored.storedAt ?? null,
        candidateName: candidate.name ?? "Candidata",
        referenceName: reference.name ?? "Referencia",
        referenceMedian: channel.reference.median,
        candidateMedian: channel.candidate.median,
        deltaMedian: channel.difference?.median ?? null,
        sampleCount: channel.candidate.sampleCount ?? candidate.sampleCount ?? null,
      });
    }
  }
  return {
    schema: DOSSIER_EVOLUTION_SCHEMA,
    method: "candidate-median-by-compatible-channel/1",
    status: channels.size ? "descriptive_only" : "insufficient_history",
    channels: [...channels.values()].filter(series => series.points.length > 0),
    excludedReports,
    limitations: [
      "Cada punto resume la mediana de la candidata de una comparación; no representa una serie temporal ni un ensayo alineado.",
      "Solo se agrupan canales con la misma clave, unidad, dominio y base de medición declarada.",
      "Las condiciones del vehículo, combustible, hardware, calibración y banco deben revisarse por separado.",
      "La evolución observada no demuestra causalidad ni que una modificación haya producido el cambio.",
    ],
  };
}
