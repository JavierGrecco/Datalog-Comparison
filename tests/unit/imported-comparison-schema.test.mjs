import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compareRunDistributions } from "../../src/distribution-comparison.mjs";
import {
  buildImportedComparisonReport,
  IMPORTED_COMPARISON_REPORT_SCHEMA,
} from "../../src/imported-comparison-report.mjs";
import { validateJsonSchemaInstance } from "../helpers/json-schema-contract.mjs";

const schema = JSON.parse(await readFile(
  new URL("../../schemas/imported-run-comparison-1.schema.json", import.meta.url), "utf8",
));
const example = JSON.parse(await readFile(
  new URL("../../examples/imported-run-comparison-1.example.json", import.meta.url), "utf8",
));

function makeRun(id, { values, hash, domain = "ecu" }) {
  return {
    id,
    name: id + ".csv",
    sourceType: domain === "dyno" ? "Dinamómetro · origen declarado" : "ECU/logger · origen declarado",
    sourceDomain: domain,
    synthetic: false,
    measurementBasis: domain === "dyno" ? "wheel" : null,
    samples: values.map((rpm, index) => ({
      time_s: index / 10,
      channels: { rpm, speed_kmh: 40 + index * 5 },
    })),
    units: { rpm: "RPM", speed_kmh: "km/h" },
    sha256: hash,
    importMetadata: {
      parserId: "csv-generic/1",
      importFormat: "generic-csv/1",
      sourceEncoding: "utf-8",
      unitNormalizationVersion: "datalog-units/2",
      sourceRowCount: values.length + 1,
      headerRows: [1],
      skippedNonEmptyRowCount: 0,
      skippedEmptyRowCount: 0,
      parsedSampleCount: values.length,
      channelMapping: [
        { channel: "rpm", sourceHeader: "Engine speed [rpm]", sourceUnit: "rpm", canonicalUnit: "RPM" },
        { channel: "speed_kmh", sourceHeader: "Vehicle speed (km/h)", sourceUnit: "km/h", canonicalUnit: "km/h" },
      ],
      unitConversions: {},
      unmappedHeaders: [],
    },
  };
}

test("el informe generado y el ejemplo público cumplen el JSON Schema publicado", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "urn:datalog-comparison:imported-run-comparison:1");
  assert.equal(schema.properties.schema.const, IMPORTED_COMPARISON_REPORT_SCHEMA);
  assert.deepEqual(validateJsonSchemaInstance(example, schema), []);

  const referenceRun = makeRun("reference", {
    values: [1800, 2000, 2200], hash: "a".repeat(64),
  });
  const candidateRun = makeRun("candidate", {
    values: [1900, 2100, 2300], hash: "b".repeat(64),
  });
  const report = buildImportedComparisonReport({
    referenceRun,
    candidateRun,
    result: compareRunDistributions(referenceRun, candidateRun),
    exportedAt: "2026-11-20T12:30:00.000Z",
  });
  const errors = validateJsonSchemaInstance(report, schema);
  assert.deepEqual(errors, [], "errores de contrato: " + errors.join("; "));
});

test("el contrato rechaza roles invertidos, alineación temporal, propiedades extra y formatos inválidos", () => {
  for (const mutate of [
    report => { report.reference.role = "candidate"; },
    report => { report.timeAlignment.performed = true; },
    report => { report.privateData = "not part of the public contract"; },
    report => { report.exportedAt = "yesterday"; },
    report => { report.policy.causalInferenceAllowed = true; },
  ]) {
    const invalid = structuredClone(example);
    mutate(invalid);
    assert.ok(validateJsonSchemaInstance(invalid, schema).length > 0);
  }
});
