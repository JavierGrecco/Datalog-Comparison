import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCsvText } from "../../src/csv-import.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../../data/sources.json", import.meta.url), "utf8"),
);

test("el catálogo de datos tiene identificadores únicos y una política explícita de reutilización", () => {
  assert.equal(catalog.schema, "datalog-public-data-sources/1");
  assert.equal(catalog.policy.publicAvailabilityIsNotAReuseLicense, true);
  assert.equal(catalog.policy.rawExternalFilesAreNotCommittedByDefault, true);
  const allowedEvidenceClasses = new Set(catalog.policy.evidenceClasses);
  for (const source of catalog.sources) {
    assert.ok(
      allowedEvidenceClasses.has(source.evidenceClass),
      source.id + " debe usar una clase de evidencia canónica",
    );
    assert.ok(typeof source.evidenceDetail === "string" && source.evidenceDetail.length > 0,
      source.id + " debe explicar los matices de su evidencia");
  }

  const ids = catalog.sources.map(source => source.id);
  assert.ok(ids.every(id => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length, "cada fuente debe tener un ID único");
});

test("los logs MoTeC de HPA quedan limitados a práctica local hasta verificar licencia y archivo", () => {
  const source = catalog.sources.find(item => item.id === "hpa-motec-example-logged-data");

  assert.ok(source, "la fuente de práctica MoTeC debe estar registrada");
  assert.match(source.url, /^https:\/\//);
  assert.match(source.downloadUrl, /^https:\/\//);
  assert.equal(source.localPracticePermission, "invited-by-source-post");
  assert.equal(source.license, null, "no se debe inventar una licencia para el archivo");
  assert.equal(source.redistribution, "not-cleared");
  assert.equal(source.fileSchemaStatus, "not-yet-downloaded");
  assert.match(source.deviceIdentity, /exact ECU\/model.*not been independently verified/i);
  assert.match(source.repositoryPolicy, /Do not commit/i);
});

test("Argonne D3 remains a measured chassis dataset with unresolved redistribution terms", () => {
  const source = catalog.sources.find(item => item.id === "argonne-d3-vehicle-chassis");
  assert.ok(source, "Argonne D3 debe quedar registrado");
  assert.equal(source.evidenceClass, "measured");
  assert.equal(source.license, null, "no se debe inventar una licencia");
  assert.equal(source.attributionRequired, true);
  assert.equal(source.redistribution, "not-cleared-until-terms-confirmed");
  assert.match(source.attributionText, /Advanced Mobility Technology Laboratory/);
  assert.match(source.repositoryPolicy, /d3info@anl.gov/);
  assert.match(source.fileSchemaStatus, /not-yet-inspected/);
  assert.match(source.cautions.join(" "), /not necessarily a wide-open-throttle engine RPM sweep/i);
});

test("OpenBLDC excerpt preserves raw high-rate sensor data and its provenance", async () => {
  const source = catalog.sources.find(item => item.id === "openbldc-sensor-testbench-2026");
  assert.ok(source, "el banco BLDC debe quedar registrado como fuente medida");
  assert.equal(source.license.spdx, "CC-BY-4.0");
  assert.equal(source.upstreamCommit, "1ce35456f83be8f36aec183ab19d6e6e46603023");
  assert.ok(source.sourceFiles[0].inspected);
  assert.equal(source.sourceFiles[0].extractedRows, 64);
  assert.match(source.cautions.join(" "), /No direct engine torque or power/);

  const csvText = await readFile(
    new URL("../fixtures/openbldc-sensor-bench-cc-by-4.0.csv", import.meta.url),
    "utf8",
  );
  const attribution = JSON.parse(await readFile(
    new URL("../fixtures/openbldc-sensor-bench-cc-by-4.0.source.json", import.meta.url),
    "utf8",
  ));
  const parsed = parseCsvText(csvText);
  assert.deepEqual(parsed.headers, [
    "t_us", "ax", "ay", "az", "ax1", "ay1", "az1",
    "shunt_raw", "bus_raw", "curr_raw", "pg_rpm", "seq", "dt",
  ]);
  assert.equal(parsed.rows.length, 64);
  const index = Object.fromEntries(parsed.headers.map((name, i) => [name, i]));
  const times = parsed.rows.map(row => Number(row[index.t_us]));
  const sequence = parsed.rows.map(row => Number(row[index.seq]));
  const intervals = times.slice(1).map((value, i) => value - times[i]);
  assert.ok(intervals.every(value => value >= 900 && value <= 1100));
  assert.ok(sequence.slice(1).every((value, i) => value - sequence[i] === 1));
  assert.equal(parsed.rows[0][index.dt], "");
  assert.ok(parsed.rows.every(row => ["0", "1"].includes(row[index.pg_rpm])));
  assert.equal(parsed.headers.some(header => /torque|power/i.test(header)), false);
  assert.equal(attribution.sourceCommit, sourceCommit);
  assert.equal(attribution.sourceFileGitBlobSha, "90e0df35b17a3b37de9b1267908f8fa578d65fec");
  assert.equal(attribution.sourceLicense, "CC BY 4.0");
  assert.equal(attribution.extractedSourceLines.firstData, 2);
  assert.equal(attribution.extractedSourceLines.lastData, 65);
  assert.equal(attribution.sampleObservations.lastTimestampUs, 62997);
  assert.deepEqual(attribution.sampleObservations.intervalUs, { min: 997, median: 1000, max: 1002 });
  assert.equal(attribution.sampleObservations.sequence.last, 24244);
  assert.equal(attribution.sampleObservations.sequence.allStepsOne, true);
});
