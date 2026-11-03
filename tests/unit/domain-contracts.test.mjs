import assert from "node:assert/strict";
import test from "node:test";

import { assessRunDataQuality } from "../../src/data-quality.mjs";
import { assessRunComparability } from "../../src/run-comparability.mjs";
import { assessSourceSet } from "../../src/source-policy.mjs";
import {
  createEmptyOperatingConditions,
  validateOperatingConditions,
} from "../../src/operating-conditions.mjs";
import {
  assessManifestComparability,
  createRunManifest,
  createSourceFileManifest,
  validateRunManifest,
} from "../../src/run-manifest.mjs";
import { assessComparisonReadiness } from "../../src/comparison-readiness.mjs";
import { createPortfolioDemoCase } from "../../src/demo-model.mjs";

function makeRun(id, torqueUnit = "Nm") {
  return {
    id,
    name: id,
    sourceDomain: "ecu",
    samples: [
      { time_s: 0, channels: { rpm: 1000, torque_nm: 100 } },
      { time_s: 1, channels: { rpm: 2000, torque_nm: 120 } },
    ],
    units: { rpm: "RPM", torque_nm: torqueUnit },
  };
}

test("el perfil de calidad detecta faltantes, duplicados y retrocesos sin modificar muestras", () => {
  const run = {
    samples: [
      { time_s: 0, channels: { rpm: 1000, boost: 100 } },
      { time_s: 1, channels: { rpm: 1100, boost: null } },
      { time_s: 1, channels: { rpm: 1200, boost: 110 } },
      { time_s: 0.5, channels: { rpm: 1300, boost: null } },
      { time_s: null, channels: { rpm: 1400, boost: 130 } },
    ],
  };
  const original = structuredClone(run);
  const quality = assessRunDataQuality(run);

  assert.equal(quality.status, "review_required");
  assert.equal(quality.timestamp.validCount, 4);
  assert.equal(quality.timestamp.missingCount, 1);
  assert.equal(quality.timestamp.duplicateAdjacentTimes, 1);
  assert.equal(quality.timestamp.retrogressions, 1);
  assert.equal(quality.timestamp.durationSeconds, null);
  assert.equal(quality.channels.find(channel => channel.key === "boost").coveragePct, 60);
  assert.deepEqual(run, original, "el análisis no debe reordenar ni corregir el registro");
});

test("el perfil de calidad marca metadatos de importación con contadores inválidos", () => {
  const run = {
    samples: [
      { time_s: 0, channels: { rpm: 1000 } },
      { time_s: 1, channels: { rpm: 2000 } },
    ],
    importMetadata: {
      parserId: "fixture/1",
      sourceRowCount: 3,
      headerRows: [1],
      skippedNonEmptyRowCount: -1,
      parsedSampleCount: 2,
    },
  };
  const quality = assessRunDataQuality(run);

  assert.equal(quality.sourceMetadata.countsValid, false);
  assert.equal(quality.sourceMetadata.consistent, false);
  assert.ok(quality.warnings.some(warning => /metadatos de lectura no coinciden/i.test(warning)));
});

test("las filas no vacías omitidas llegan a la puerta de calidad de la matriz", () => {
  const demo = createPortfolioDemoCase("complete");
  demo.candidate.importMetadata = {
    parserId: "fixture/1",
    sourceRowCount: 103,
    headerRows: [1],
    skippedNonEmptyRowCount: 1,
    parsedSampleCount: demo.candidate.samples.length,
  };
  const readiness = assessComparisonReadiness(demo.reference, demo.candidate);
  const dataGate = readiness.gates.find(gate => gate.id === "data");

  assert.equal(readiness.assessments.dataQuality.candidate.sourceMetadata.consistent, true);
  assert.equal(dataGate.status, "review_required");
  assert.ok(dataGate.findings.some(item => /omitió 1 fila/i.test(item)));
});

test("la política de origen bloquea la mezcla numérica entre ECU/logger y dinamómetro", () => {
  const result = assessSourceSet([
    { sourceDomain: "ecu" },
    { sourceDomain: "dyno" },
  ]);

  assert.equal(result.status, "cross-domain");
  assert.equal(result.allowed, false);
  assert.equal(result.domains.length, 2);
});

test("dos orígenes desconocidos permanecen en revisión, no se clasifican por suposición", () => {
  const result = assessSourceSet([{}, {}]);

  assert.equal(result.status, "unclassified");
  assert.equal(result.allowed, true);
});

test("la comparabilidad excluye canales cuyas unidades no coinciden", () => {
  const reference = makeRun("reference", "Nm");
  const candidate = makeRun("candidate", "ft-lb");
  const result = assessRunComparability(reference, candidate);

  assert.ok(result.commonChannels.some(channel => channel.key === "rpm"));
  assert.ok(result.blockedChannels.some(channel =>
    channel.key === "torque_nm" && /unidades no coinciden/i.test(channel.reason)
  ));
  assert.equal(result.operatingConditionsVerified, false);
  assert.equal(result.causalInferenceAllowed, false);
});

test("el contrato de condiciones operativas exige fuente para valores declarados o verificados", () => {
  const conditions = createEmptyOperatingConditions();
  assert.deepEqual(validateOperatingConditions(conditions), []);

  conditions.fields.vehicle_engine = {
    value: "Motor de prueba",
    status: "verified",
    source: "",
    note: "",
  };
  conditions.fields.throttle_pct = {
    value: 101,
    status: "measured",
    source: "sensor",
    note: "",
  };

  const errors = validateOperatingConditions(conditions);
  assert.ok(errors.some(error => /vehicle_engine.*fuente/i.test(error)));
  assert.ok(errors.some(error => /throttle_pct.*por encima/i.test(error)));
});

test("la matriz no considera verificadas condiciones con procedencia inválida", () => {
  const demo = createPortfolioDemoCase("complete");
  for (const run of [demo.reference, demo.candidate]) {
    run.operatingConditions.fields.vehicle_engine.status = "verified";
    run.operatingConditions.fields.vehicle_engine.source = "";
  }

  const readiness = assessComparisonReadiness(demo.reference, demo.candidate);
  const conditionsGate = readiness.gates.find(gate => gate.id === "conditions");

  assert.equal(conditionsGate.status, "review_required");
  assert.ok(conditionsGate.findings.some(item => /vehicle_engine.*fuente/i.test(item)));
  assert.ok(readiness.nextActions.some(item => /contrato de condiciones operativas/i.test(item)));
});

function validReadyManifest(id, role, sha256) {
  const declared = (value) => ({
    value,
    evidence: "user_declared",
    source: "fixture de prueba",
    note: "",
  });
  const manifest = createRunManifest({ id, role });
  manifest.lifecycle = "ready";
  manifest.sourceFiles = [createSourceFileManifest({
    displayName: id + ".csv",
    sha256,
    sizeBytes: 128,
    format: declared("csv"),
    parser: declared("fixture-parser/1"),
    sourceTool: declared("fixture-exporter"),
    exportVersion: declared("1"),
    importedAt: "2026-11-01T00:00:00.000Z",
  })];
  return manifest;
}

test("el manifiesto listo requiere una huella válida para cada archivo de origen", () => {
  const manifest = createRunManifest({ id: "reference", role: "reference" });
  manifest.lifecycle = "ready";
  manifest.sourceFiles = [createSourceFileManifest({ displayName: "reference.csv" })];

  const errors = validateRunManifest(manifest);
  assert.ok(errors.some(error => /necesita SHA-256/i.test(error)));
});

test("la matriz de procedencia detecta dos manifiestos que apuntan a los mismos bytes", () => {
  const sha256 = "a".repeat(64);
  const reference = validReadyManifest("reference", "reference", sha256);
  const candidate = validReadyManifest("candidate", "candidate", sha256);
  assert.deepEqual(validateRunManifest(reference), []);
  assert.deepEqual(validateRunManifest(candidate), []);

  const result = assessManifestComparability(reference, candidate);
  assert.equal(result.status, "possible_duplicate_source");
  assert.equal(result.sourceIdentity.status, "same_bytes");
  assert.equal(result.roleChecks.every(check => check.matches), true);
});

test("el umbral de cobertura rechaza valores fuera del intervalo porcentual", () => {
  assert.throws(
    () => assessComparisonReadiness(null, null, { minimumChannelCoveragePct: 101 }),
    RangeError,
  );
});
