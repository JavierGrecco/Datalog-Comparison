import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCsvText, mapCsvToRun } from "../../src/csv-import.mjs";
import { assessRunDataQuality } from "../../src/data-quality.mjs";
import { buildRpmSweepCurves } from "../../src/signal-processing.mjs";
import {
  SIMULATED_DYNO_SCHEMA,
  SIMULATED_DYNO_VERSION,
  generateSimulatedDyno,
  serializeSimulatedDynoCsv,
} from "../../src/simulated-dyno.mjs";
import { parseDynoSimulatorCliArgs } from "../../scripts/generate-simulated-dyno.mjs";

function importFixture(csv, id) {
  const parsed = parseCsvText(csv);
  const hasTime = parsed.headers.includes("Time (s)");
  const run = mapCsvToRun(parsed, {
    id, name: id + ".csv", sourceDomain: "dyno", measurementBasis: "wheel",
    channelMapping: {
      ...(hasTime ? { time_s: "Time (s)" } : {}),
      rpm: "Engine RPM", torque_nm: "Wheel Torque (Nm)", power_kw: "Wheel Power (kW)",
    },
    units: {
      ...(hasTime ? { time_s: "s" } : {}),
      rpm: "RPM", torque_nm: "Nm", power_kw: "kW",
    },
    importedAt: "2026-11-20T00:00:00.000Z",
  });
  return { parsed, run };
}

test("el simulador es determinista y declara que los datos son sintéticos", () => {
  const options = { mode: "graph-export", scenario: "reference", seed: 23, rpmStep: 50 };
  const first = generateSimulatedDyno(options);
  const second = generateSimulatedDyno(options);
  assert.equal(first.schema, SIMULATED_DYNO_SCHEMA);
  assert.equal(first.metadata.simulatorVersion, SIMULATED_DYNO_VERSION);
  assert.equal(first.metadata.synthetic, true);
  assert.equal(first.metadata.evidenceClass, "simulated");
  assert.deepEqual(first.rows, second.rows);
  assert.equal(first.rows.length, 95);
  assert.equal(first.rows[0]["Engine RPM"], 1800);
  assert.equal(first.rows.at(-1)["Engine RPM"], 6500);
  assert.equal(first.columns.includes("Time (s)"), false);
  assert.equal(first.metadata.correction.applied, false);
});

test("torque y potencia mantienen la relación dimensional definida por el modelo", () => {
  const data = generateSimulatedDyno({ mode: "graph-export", rpmStep: 100 });
  for (const row of data.rows) {
    const expected = row["Wheel Torque (Nm)"] * row["Engine RPM"] / 9549.29658551372;
    assert.ok(Math.abs(row["Wheel Power (kW)"] - expected) <= 0.002);
  }
});

test("la candidata aplica una variación localizada sin cambiar el rango", () => {
  const reference = generateSimulatedDyno({ mode: "graph-export", scenario: "reference" });
  const candidate = generateSimulatedDyno({ mode: "graph-export", scenario: "candidate" });
  const mid = reference.rows.findIndex(row => row["Engine RPM"] === 4200);
  assert.equal(reference.rows.length, candidate.rows.length);
  assert.ok(candidate.rows[mid]["Wheel Torque (Nm)"] > reference.rows[mid]["Wheel Torque (Nm)"]);
});

test("el fixture Graph Export conserva RPM como eje y permite construir curvas", async () => {
  const csv = await readFile(new URL("../fixtures/dynojet-graph-export-synthetic.csv", import.meta.url), "utf8");
  const { parsed, run } = importFixture(csv, "dyno-graph-fixture");
  const quality = assessRunDataQuality(run);
  const curves = buildRpmSweepCurves(run, { rpmBinWidth: 200, minimumSweepSpanRpm: 1000 });
  assert.equal(parsed.rows.length, 95);
  assert.equal(run.samples[0].time_s, null);
  assert.equal(quality.timestamp.axis, "rpm");
  assert.equal(curves.status, "ready");
  assert.equal(curves.curves.length, 1);
  assert.ok(curves.curves[0].channels.torque_nm.bins.length > 10);
});

test("el fixture Time Export conserva el intervalo y separa dos tiradas", async () => {
  const csv = await readFile(new URL("../fixtures/dynojet-time-export-repeat-pulls-synthetic.csv", import.meta.url), "utf8");
  const { parsed, run } = importFixture(csv, "dyno-time-fixture");
  const quality = assessRunDataQuality(run);
  const curves = buildRpmSweepCurves(run, {
    rpmBinWidth: 200, minimumSweepSpanRpm: 1000,
    reversalThresholdRpm: 150, confirmationRiseRpm: 100,
  });
  assert.equal(parsed.rows.length, 281);
  assert.equal(run.samples[1].time_s, 0.05);
  assert.ok(Math.abs(quality.timestamp.positiveIntervalMedianSeconds - 0.05) < 1e-9);
  assert.equal(curves.status, "ready");
  assert.equal(curves.curves.length, 2);
  assert.ok(curves.curves.every(curve => curve.sourceSampleCount > 20));
});

test("los faltantes del sensor se conservan como null y reducen la cobertura", () => {
  const data = generateSimulatedDyno({ mode: "graph-export", scenario: "sensor-dropout" });
  const run = importFixture(serializeSimulatedDynoCsv(data), "dyno-dropout").run;
  assert.ok(run.samples.some(sample => sample.channels.torque_nm === null));
  const quality = assessRunDataQuality(run);
  assert.ok(quality.channels.find(channel => channel.key === "torque_nm").missingCount > 0);
});

test("el serializador y el CLI conservan parámetros y rechazan opciones inválidas", () => {
  const csv = serializeSimulatedDynoCsv({
    ...generateSimulatedDyno({ mode: "graph-export" }),
    columns: ["Engine RPM", "Note", "Missing"],
    rows: [{ "Engine RPM": 2000, Note: 'roller, "A"', Missing: null }],
  });
  assert.equal(csv, 'Engine RPM,Note,Missing\n2000,"roller, ""A""",\n');
  assert.equal(parseDynoSimulatorCliArgs(["--mode", "time-export", "--interval-ms", "50"]).options.mode, "time-export");
  assert.equal(parseDynoSimulatorCliArgs(["--help"]).help, true);
  assert.throws(() => generateSimulatedDyno(parseDynoSimulatorCliArgs(["--rpm-step", "0"]).options), /rpmStep/);
  assert.throws(() => generateSimulatedDyno(parseDynoSimulatorCliArgs(["--mode", "binary"]).options), /mode/);
  assert.throws(() => generateSimulatedDyno({ scenario: "repeat-pulls", mode: "graph-export" }), /requires mode time-export/i);
});
