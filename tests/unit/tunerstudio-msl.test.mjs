import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapCsvToRun } from "../../src/csv-import.mjs";
import {
  TUNERSTUDIO_ADAPTER_ID,
  detectTunerStudioMsl,
  importTunerStudioMsl,
  parseTunerStudioMsl,
} from "../../src/adapters/tunerstudio-msl.mjs";

const fixture = await readFile(
  new URL("../fixtures/tunerstudio-ms3-synthetic.msl", import.meta.url),
  "utf8",
);

test("detecta el preámbulo MS3 y conserva el formato tabulado con fila de unidades", () => {
  assert.equal(detectTunerStudioMsl(fixture), true);
  const parsed = parseTunerStudioMsl(fixture);
  assert.equal(parsed.delimiter, "\t");
  assert.equal(parsed.tunerStudioMetadata.layout, "tab-delimited-msl");
  assert.equal(parsed.tunerStudioMetadata.unitsRowPresent, true);
  assert.equal(parsed.rows.length, 14);
  assert.ok(parsed.headers.includes("Engine RPM (rpm)"));
  assert.ok(parsed.headers.includes("Elapsed Time (s)"));
  assert.ok(parsed.headers.includes("MAP (kPa)"));
  assert.equal(parsed.tunerStudioMetadata.sourceHeaders[1], "RPM");
  assert.equal(parsed.tunerStudioMetadata.sourceUnits.RPM, "rpm");
});

test("mapea canales conocidos y convierte temperatura y velocidad según la fila de unidades", () => {
  const parsed = parseTunerStudioMsl(fixture);
  const run = importTunerStudioMsl(parsed, {
    id: "msl-synthetic",
    name: "tunerstudio-ms3-synthetic.msl",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (s)",
      rpm: "Engine RPM (rpm)",
      throttle_pct: "Throttle Position (%)",
      lambda: "Wideband Lambda (lambda)",
      iat_c: "Intake Air Temperature (°F)",
      coolant_temp_c: "Coolant Temperature (°F)",
      speed_kmh: "Vehicle Speed (mph)",
      ignition_advance_deg: "Spark Advance (deg)",
    },
    units: {
      time_s: "s",
      rpm: "rpm",
      throttle_pct: "%",
      lambda: "lambda",
      iat_c: "°F",
      coolant_temp_c: "°F",
      speed_kmh: "mph",
      ignition_advance_deg: "deg",
    },
    importedAt: "2026-11-20T00:00:00.000Z",
  });
  assert.equal(run.sourceDomain, "ecu");
  assert.equal(run.importMetadata.parserId, TUNERSTUDIO_ADAPTER_ID);
  assert.equal(run.importMetadata.importFormat, "tunerstudio-msl-text/1");
  assert.equal(run.samples[0].time_s, 0);
  assert.equal(run.samples[5].channels.rpm, 2250);
  assert.equal(run.samples[5].channels.throttle_pct, 96);
  assert.ok(Math.abs(run.samples[5].channels.iat_c - 26.111111) < 1e-5);
  assert.ok(Math.abs(run.samples[5].channels.speed_kmh - 35.405568) < 1e-5);
  assert.equal(run.samples[5].sourceValues.rpm, "2250");
  assert.equal(run.importMetadata.adapterMetadata.unitsRowPresent, true);
  assert.ok(run.warnings.some(item => /MAP, Boost, Knock Retard/i.test(item)));
});

test("admite CSV TunerStudio con coma y sin fila de unidades, pero no inventa unidades", () => {
  const text = "Time,RPM,TPS\n0,850,2\n0.1,900,3\n";
  const parsed = parseTunerStudioMsl(text);
  assert.equal(parsed.delimiter, ",");
  assert.equal(parsed.tunerStudioMetadata.unitsRowPresent, false);
  assert.deepEqual(parsed.headers, ["Elapsed Time", "Engine RPM", "TPS"]);
  assert.ok(parsed.warnings.some(item => /no incluye una fila de unidades/i.test(item)));
  assert.throws(() => importTunerStudioMsl(parsed, {
    sourceDomain: "ecu",
    channelMapping: { time_s: "Elapsed Time", rpm: "Engine RPM" },
    units: { time_s: "s" },
  }), /unidad .*no está reconocida/i);
});

test("rechaza archivos demasiado grandes, fuentes mezcladas y tablas sin filas suficientes", () => {
  assert.throws(() => parseTunerStudioMsl("x".repeat(10_000_001)), /límite de texto/i);
  const parsed = parseTunerStudioMsl("Time,RPM\n0,850\n0.1,900\n");
  assert.throws(() => importTunerStudioMsl(parsed, {
    sourceDomain: "dyno",
    channelMapping: { time_s: "Elapsed Time", rpm: "Engine RPM" },
    units: { time_s: "s", rpm: "rpm" },
  }), /dominio ECU/i);
});
