import assert from "node:assert/strict";
import test from "node:test";

import {
  compareRunDistributions,
  DEFAULT_DISTRIBUTION_MINIMUM_COVERAGE_PCT,
} from "../../src/distribution-comparison.mjs";

function makeRun(id, {
  domain = "ecu",
  unit = "Nm",
  values = [100, 110, 120, 130],
  rpm = [1800, 1900, 2000, 2100],
  time = [0, 0.1, 0.2, 0.3],
  basis = null,
  sha256 = null,
} = {}) {
  return {
    id,
    name: id + ".csv",
    sourceDomain: domain,
    synthetic: false,
    measurementBasis: basis,
    samples: values.map((value, index) => ({
      time_s: time[index] ?? null,
      channels: { torque_nm: value, rpm: rpm[index] ?? null },
    })),
    units: { torque_nm: unit, rpm: "RPM" },
    ...(sha256 ? {
      runManifest: {
        role: id === "reference" ? "reference" : "candidate",
        lifecycle: "draft",
        sourceFiles: [{ sha256 }],
      },
    } : {}),
  };
}

test("compara distribuciones compatibles sin alinear ni interpolar muestras", () => {
  const reference = makeRun("reference", {
    values: [100, 110, 120, 130],
    time: [0, 0.1, 0.2, 0.3],
  });
  const candidate = makeRun("candidate", {
    values: [120, 130, 140, 150, 160],
    time: [10, 10.2, 10.4, 10.6, 10.8],
    rpm: [2000, 2100, 2200, 2300, 2400],
  });
  const originalReference = structuredClone(reference);
  const originalCandidate = structuredClone(candidate);
  const result = compareRunDistributions(reference, candidate);

  assert.equal(result.status, "review_required");
  assert.equal(result.method, "unpaired-distribution-summary/1");
  assert.equal(result.timeAlignment.performed, false);
  assert.match(result.timeAlignment.reason, /referencia temporal común/i);
  assert.equal(result.causalInferenceAllowed, false);
  assert.equal(result.sourceDataModified, false);
  const torque = result.channels.find(channel => channel.key === "torque_nm");
  assert.ok(torque);
  assert.equal(torque.reference.median, 115);
  assert.equal(torque.candidate.median, 140);
  assert.equal(torque.difference.median, 25);
  assert.ok(Math.abs(torque.difference.medianPct - 21.7391304348) < 1e-8);
  assert.equal(torque.reference.validCount, 4);
  assert.equal(torque.candidate.validCount, 5);
  assert.deepEqual(reference, originalReference);
  assert.deepEqual(candidate, originalCandidate);
});

test("bloquea una comparación ECU frente a dinamómetro", () => {
  const result = compareRunDistributions(
    makeRun("reference", { domain: "ecu" }),
    makeRun("candidate", { domain: "dyno", basis: "wheel" }),
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.channels.length, 0);
  assert.ok(result.blockedReasons.some(reason => /mismo dominio identificado/i.test(reason)));
});

test("bloquea orígenes no identificados", () => {
  const result = compareRunDistributions(
    makeRun("reference", { domain: "unknown" }),
    makeRun("candidate", { domain: "unknown" }),
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockedReasons[0], /mismo dominio identificado/i);
});

test("bloquea unidades incompatibles sin conversiones implícitas", () => {
  const result = compareRunDistributions(
    makeRun("reference", { unit: "Nm" }),
    makeRun("candidate", { unit: "ft-lb" }),
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.channels.length, 0);
});

test("bloquea el mismo archivo en ambos roles mediante SHA-256", () => {
  const hash = "a".repeat(64);
  const result = compareRunDistributions(
    makeRun("reference", { sha256: hash }),
    makeRun("candidate", { sha256: hash }),
  );
  assert.equal(result.status, "blocked");
  assert.ok(result.blockedReasons.some(reason => /mismo identificador o SHA-256/i.test(reason)));
});

test("excluye torque de dinamómetro cuando las bases físicas no coinciden", () => {
  const result = compareRunDistributions(
    makeRun("reference", { domain: "dyno", basis: "wheel" }),
    makeRun("candidate", { domain: "dyno", basis: "engine" }),
  );
  assert.equal(result.status, "review_required");
  assert.equal(result.channels.some(channel => channel.key === "torque_nm"), false);
  assert.ok(result.excludedChannels.some(channel => channel.key === "torque_nm"));
  assert.ok(result.channels.some(channel => channel.key === "rpm"));
});

test("excluye canales debajo del umbral de cobertura", () => {
  const result = compareRunDistributions(
    makeRun("reference", { values: [100, null, null, 130] }),
    makeRun("candidate", { values: [120, 130, 140, 150] }),
  );
  assert.equal(result.channels.some(channel => channel.key === "torque_nm"), false);
  assert.ok(result.excludedChannels.some(channel => channel.key === "torque_nm"));
  assert.ok(result.channels.some(channel => channel.key === "rpm"));
});

test("valida el umbral de cobertura", () => {
  assert.equal(DEFAULT_DISTRIBUTION_MINIMUM_COVERAGE_PCT, 80);
  assert.throws(() => compareRunDistributions(
    makeRun("reference"), makeRun("candidate"), { minimumCoveragePct: 101 },
  ), RangeError);
});
