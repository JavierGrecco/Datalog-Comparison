import assert from "node:assert/strict";
import test from "node:test";

import {
  SIMULATOR_SCHEMA,
  SIMULATOR_VERSION,
  TELEMETRY_COLUMNS,
  generateSimulatedTelemetry,
  serializeSimulatedTelemetryCsv,
} from "../../src/simulated-telemetry.mjs";
import { parseSimulatorCliArgs } from "../../scripts/generate-simulated-telemetry.mjs";
import { parseObdSampleArgs, serializeDatasetRows } from "../../scripts/fetch-obd-sample.mjs";

test("el perfil ECU es determinista y conserva la clasificación sintética", () => {
  const options = { profile: "ecu", durationSeconds: 120, sampleRateHz: 20, seed: 23 };
  const first = generateSimulatedTelemetry(options);
  const second = generateSimulatedTelemetry(options);
  assert.equal(first.schema, SIMULATOR_SCHEMA);
  assert.equal(first.metadata.simulatorVersion, SIMULATOR_VERSION);
  assert.deepEqual(first.rows, second.rows);
  assert.equal(first.rows.length, 2401);
  assert.equal(first.metadata.synthetic, true);
  assert.equal(first.columns[0], "time_s");
  assert.equal(first.rows.some(row => "TORQUE" in row || "POWER" in row), false);
});

test("la secuencia ECU cubre arranque, carga, aceleración, crucero y retención", () => {
  const data = generateSimulatedTelemetry({ durationSeconds: 120, seed: 42 });
  const states = new Set(data.rows.map(row => row.ENGINE_STATUS));
  for (const state of ["cranking", "idle-warmup", "light-load", "wide-open-pull", "cruise", "overrun", "idle"]) {
    assert.ok(states.has(state), "falta el estado " + state);
  }
  const pull = data.rows.filter(row => row.ENGINE_STATUS === "wide-open-pull");
  const overrun = data.rows.filter(row => row.ENGINE_STATUS === "overrun");
  assert.ok(pull.some(row => row.THROTTLE_POS > 90 && row.INTAKE_PRESSURE > 85));
  assert.ok(overrun.some(row => row.DFCO === 1 && row.INJECTOR_PW_MS === 0));
  assert.ok(data.rows.every(row => row.RPM >= 0 && row.RPM <= 6800));
});

test("el perfil OBD mantiene grupos PID asíncronos y celdas sin actualización", () => {
  const data = generateSimulatedTelemetry({ profile: "obd", durationSeconds: 120, seed: 7 });
  const steps = data.rows.slice(1).map((row, index) => row.time_s - data.rows[index].time_s);
  assert.ok(new Set(steps.map(value => value.toFixed(2))).size >= 3);
  const rpmRows = data.rows.filter(row => row.RPM !== null);
  const coolantRows = data.rows.filter(row => row.COOLANT_TEMP !== null);
  assert.ok(rpmRows.length > coolantRows.length);
  assert.ok(data.rows.some(row => row.RPM !== null && row.COOLANT_TEMP === null));
  assert.ok(data.rows.some(row => row.COOLANT_TEMP !== null && row.RPM === null));
  assert.equal(data.metadata.nominalSampleRateHz, null);
  assert.match(data.metadata.samplingDescription, /no interpolation/i);
});

test("la variante sensor-dropout inserta faltantes identificables", () => {
  const data = generateSimulatedTelemetry({ durationSeconds: 120, scenario: "sensor-dropout" });
  assert.ok(data.rows.some(row => row.MAF === null));
  assert.ok(data.rows.some(row => row.INTAKE_PRESSURE === null));
  assert.ok(data.rows.some(row => row.MAF !== null && row.INTAKE_PRESSURE !== null));
});

test("el serializador CSV conserva celdas faltantes y escapa comillas", () => {
  const csv = serializeSimulatedTelemetryCsv({
    columns: ["time_s", "note", "missing"],
    rows: [{ time_s: 0, note: 'sensor, "A"', missing: null }],
  });
  assert.equal(csv, 'time_s,note,missing\n0,"sensor, ""A""",\n');
});

test("el simulador rechaza perfiles, semillas, duraciones y frecuencias inválidas", () => {
  assert.throws(() => generateSimulatedTelemetry({ profile: "other" }), /profile/);
  assert.throws(() => generateSimulatedTelemetry({ scenario: "other" }), /scenario/);
  assert.throws(() => generateSimulatedTelemetry({ durationSeconds: 0 }), /durationSeconds/);
  assert.throws(() => generateSimulatedTelemetry({ sampleRateHz: 101 }), /sampleRateHz/);
  assert.throws(() => generateSimulatedTelemetry({ seed: -1 }), /seed/);
});

test("el parser de CLI admite opciones reproducibles y rechaza argumentos desconocidos", () => {
  assert.deepEqual(parseSimulatorCliArgs(["--profile", "obd", "--seed", "11"]), {
    options: { profile: "obd", scenario: "road-test", durationSeconds: 120, sampleRateHz: 20, seed: 11 },
    outputPath: null,
    help: false,
  });
  assert.equal(parseSimulatorCliArgs(["--help"]).help, true);
  assert.throws(() => parseSimulatorCliArgs(["--rate", "fast"]), /numérico/);
  assert.throws(() => parseSimulatorCliArgs(["--unknown", "x"]), /desconocido/);
});

test("el descargador OBD limita los slices a 100 filas y conserva datos tabulares", () => {
  assert.deepEqual(parseObdSampleArgs(["--offset", "50", "--length", "25"]).options, {
    offset: 50, length: 25, outputDir: "data/external",
  });
  assert.throws(() => parseObdSampleArgs(["--length", "101"]), /entre 1 y 100/);
  assert.throws(() => parseObdSampleArgs(["--offset", "-1"]), /no negativo/);
  assert.equal(parseObdSampleArgs(["--help"]).help, true);
  assert.equal(serializeDatasetRows([{ RPM: 850, label: 'idle, "warm"' }]), 'RPM,label\n850,"idle, ""warm"""\n');
});

test("el catálogo diferencia fuentes medidas, simuladas y con derechos no confirmados", async () => {
  const { default: manifest } = await import("../../data/sources.json", { with: { type: "json" } });
  const ids = manifest.sources.map(source => source.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(manifest.sources.find(source => source.id === "obd2-opel-corsa-2012").license.spdx, "CC-BY-4.0");
  assert.equal(manifest.sources.find(source => source.id === "engine-dyno-h2-cng").license.spdx, "CC-BY-4.0");
  assert.equal(manifest.sources.find(source => source.id === "speeduino-serial-sim").generatedDataLicense, "not separately stated by upstream");
  assert.equal(manifest.sources.find(source => source.id === "rusefi-online").redistribution, "not-cleared");
  assert.equal(TELEMETRY_COLUMNS[0], "time_s");
});
