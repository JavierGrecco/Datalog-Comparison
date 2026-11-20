import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDossierEvolution } from "../../src/dossier-evolution.mjs";

const example = JSON.parse(await readFile(
  new URL("../../examples/imported-run-comparison-1.example.json", import.meta.url), "utf8",
));

const stored = (id, report, storedAt) => ({ id, report, storedAt });

test("agrupa medianas de candidatas solo por canal, unidad, dominio y base compatibles", () => {
  const second = structuredClone(example);
  second.exportedAt = "2026-11-21T12:30:00.000Z";
  second.candidate.name = "ecu-candidate-2.csv";
  second.channels[0].candidate.median = 2200;
  second.channels[0].reference.median = 2000;
  second.channels[0].difference.median = 200;
  const result = buildDossierEvolution([
    stored("later", second, "2026-11-21T12:30:00.000Z"),
    stored("earlier", example, "2026-11-20T12:30:00.000Z"),
  ]);
  assert.equal(result.status, "descriptive_only");
  const rpm = result.channels.find(channel => channel.key === "rpm");
  assert.deepEqual(rpm.points.map(point => point.candidateMedian), [2100, 2200]);
  assert.equal(rpm.domain, "ecu");
  assert.equal(rpm.unit, "RPM");
});

test("excluye comparaciones bloqueadas y bases incompatibles", () => {
  const blocked = structuredClone(example);
  blocked.status = "blocked";
  const mismatch = structuredClone(example);
  mismatch.candidate.measurementBasis = "roller";
  const result = buildDossierEvolution([
    stored("blocked", blocked, "2026-11-20T10:00:00.000Z"),
    stored("basis", mismatch, "2026-11-20T11:00:00.000Z"),
  ]);
  assert.equal(result.status, "insufficient_history");
  assert.equal(result.channels.length, 0);
  assert.equal(result.excludedReports.length, 2);
});

test("mantiene separados los canales con unidades distintas", () => {
  const alternate = structuredClone(example);
  alternate.channels[0].unit = "rpm";
  const result = buildDossierEvolution([
    stored("canonical", example, "2026-11-20T10:00:00.000Z"),
    stored("alternate", alternate, "2026-11-21T10:00:00.000Z"),
  ]);
  assert.equal(result.channels.filter(channel => channel.key === "rpm").length, 2);
});
