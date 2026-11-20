import assert from "node:assert/strict";
import test from "node:test";

import { compareRunDistributions } from "../../src/distribution-comparison.mjs";
import {
  buildImportedComparisonReport,
  IMPORTED_COMPARISON_REPORT_SCHEMA,
} from "../../src/imported-comparison-report.mjs";

function makeImportedRun(id, { values, sha256, name = id + ".csv" }) {
  return {
    id, name, filename: name, sourceDomain: "ecu",
    sourceType: "ECU/logger · origen declarado", synthetic: false, measurementBasis: null,
    samples: values.map((rpm, index) => ({
      time_s: index / 10,
      channels: { rpm, speed_kmh: 40 + index * 5 },
      originalCells: { rpm: "private-raw-cell-" + rpm },
    })),
    units: { rpm: "RPM", speed_kmh: "km/h" }, sha256,
    filePath: "/Users/private/session/source.csv",
    rawCsv: "PRIVATE_RAW_CSV_CONTENT",
    importMetadata: {
      parserId: "csv-generic/1", importFormat: "generic-csv/1",
      sourceEncoding: "utf-8", unitNormalizationVersion: "datalog-units/2",
      sourceRowCount: values.length + 1, headerRows: [1], skippedEmptyRowCount: 0,
      parsedSampleCount: values.length,
      channelMapping: [
        { channel: "rpm", sourceHeader: "Engine speed [rpm]", sourceUnit: "rpm", canonicalUnit: "RPM" },
        { channel: "speed_kmh", sourceHeader: "Vehicle speed [km/h]", sourceUnit: "km/h", canonicalUnit: "km/h" },
      ],
      unitConversions: {}, unmappedHeaders: ["Private workshop note"],
      adapterMetadata: { sourceMetadata: "DO_NOT_EXPORT_THIS_PRIVATE_METADATA" },
    },
  };
}

test("exporta un informe técnico versionado sin muestras, celdas ni contenido de origen", () => {
  const hashReference = "a".repeat(64);
  const hashCandidate = "b".repeat(64);
  const referenceRun = makeImportedRun("reference", {
    values: [1800, 2000, 2200], sha256: hashReference, name: "../private/reference.csv",
  });
  const candidateRun = makeImportedRun("candidate", {
    values: [1900, 2100, 2300], sha256: hashCandidate,
  });
  const result = compareRunDistributions(referenceRun, candidateRun);
  const report = buildImportedComparisonReport({
    referenceRun, candidateRun, result, exportedAt: "2026-11-20T12:30:00.000Z",
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.schema, IMPORTED_COMPARISON_REPORT_SCHEMA);
  assert.equal(report.schema, "datalog-imported-run-comparison/1");
  assert.equal(report.exportedAt, "2026-11-20T12:30:00.000Z");
  assert.equal(report.reference.name, "reference.csv");
  assert.equal(report.reference.sha256, hashReference);
  assert.equal(report.reference.sampleCount, 3);
  assert.equal(report.reference.import.parserId, "csv-generic/1");
  assert.equal(report.reference.import.channelMapping[0].sourceHeader, "Engine speed [rpm]");
  assert.equal(report.reference.import.unmappedHeaderCount, 1);
  assert.ok(report.channels.some(channel => channel.key === "rpm" && channel.reference.median === 2000));
  assert.equal(report.timeAlignment.performed, false);
  assert.equal(report.policy.causalInferenceAllowed, false);
  assert.doesNotMatch(serialized, /"samples"\s*:/);
  assert.doesNotMatch(serialized, /originalCells|PRIVATE_RAW_CSV_CONTENT|private-raw-cell|DO_NOT_EXPORT_THIS_PRIVATE_METADATA/);
  assert.doesNotMatch(serialized, /\/Users\/private|source\.csv/);
});

test("conserva exclusiones y controles de revisión en el informe portable", () => {
  const referenceRun = makeImportedRun("reference", { values: [1800, 2000, 2200], sha256: "c".repeat(64) });
  const candidateRun = makeImportedRun("candidate", { values: [1900, 2100, 2300], sha256: "d".repeat(64) });
  candidateRun.samples.forEach(sample => { delete sample.channels.speed_kmh; });
  const result = compareRunDistributions(referenceRun, candidateRun);
  const report = buildImportedComparisonReport({ referenceRun, candidateRun, result });

  assert.ok(report.excludedChannels.some(channel =>
    channel.key === "speed_kmh" && channel.reasonCode === "missing_in_candidate"
  ));
  assert.ok(report.readiness.gates.length > 0);
  assert.ok(report.warnings.length > 0);
});

test("rechaza entradas sin resultado de distribución o con fecha inválida", () => {
  const referenceRun = makeImportedRun("reference", { values: [1800, 2000], sha256: "e".repeat(64) });
  const candidateRun = makeImportedRun("candidate", { values: [1900, 2100], sha256: "f".repeat(64) });
  assert.throws(() => buildImportedComparisonReport({ referenceRun, candidateRun, result: {} }), TypeError);
  const result = compareRunDistributions(referenceRun, candidateRun);
  assert.throws(() => buildImportedComparisonReport({
    referenceRun, candidateRun, result, exportedAt: "not-a-date",
  }), RangeError);
});
