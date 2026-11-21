import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TUNERSTUDIO_ADAPTER_ID,
  detectTunerStudioMsl,
  detectTunerStudioText,
  importTunerStudioMsl,
  parseTunerStudioMsl,
} from "../../src/adapters/tunerstudio-msl.mjs";

const fixture = await readFile(
  new URL("../fixtures/tunerstudio-ms3-synthetic.msl", import.meta.url),
  "utf8",
);

test("detecta MSL tabulado con preámbulo opcional, unidad temporal y MARK", () => {
  assert.equal(detectTunerStudioMsl(fixture), true);
  const parsed = parseTunerStudioMsl(fixture);
  assert.equal(parsed.delimiter, "\t");
  assert.equal(parsed.tunerStudioMetadata.layout, "tab-delimited-msl");
  assert.equal(parsed.tunerStudioMetadata.preambleLines.length, 2);
  assert.equal(parsed.tunerStudioMetadata.unitsRowPresent, true);
  assert.equal(parsed.tunerStudioMetadata.markerCount, 1);
  assert.equal(parsed.tunerStudioMetadata.markerLines[0].line, 6);
  assert.equal(parsed.rows.length, 14);
  assert.equal(parsed.sourceLineNumbers[0], 5);
  assert.equal(parsed.sourceLineNumbers[1], 7);
  assert.ok(parsed.headers.includes("Engine RPM (rpm)"));
  assert.ok(parsed.headers.includes("Elapsed Time (sec)"));
  assert.ok(parsed.headers.includes("Secl (s)"));
  assert.ok(parsed.headers.includes("MAP (kPa)"));
  assert.equal(parsed.tunerStudioMetadata.sourceHeaders[2], "RPM");
  assert.equal(parsed.tunerStudioMetadata.sourceUnits.Time, "sec");
  assert.equal(parsed.tunerStudioMetadata.sourceUnits.Secl, "s");
});

test("mapea Time como eje, mantiene SecL como canal y convierte las unidades declaradas", () => {
  const parsed = parseTunerStudioMsl(fixture);
  const run = importTunerStudioMsl(parsed, {
    id: "msl-synthetic",
    name: "tunerstudio-ms3-synthetic.msl",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (sec)",
      rpm: "Engine RPM (rpm)",
      throttle_pct: "Throttle Position (%)",
      lambda: "Wideband Lambda (lambda)",
      iat_c: "Intake Air Temperature (°F)",
      coolant_temp_c: "Coolant Temperature (°F)",
      speed_kmh: "Vehicle Speed (mph)",
      ignition_advance_deg: "Spark Advance (deg)",
    },
    units: {
      time_s: "sec",
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
  assert.equal(run.samples[5].time_s, 0.25);
  assert.equal(run.samples[5].channels.rpm, 2250);
  assert.equal(run.samples[5].channels.throttle_pct, 96);
  assert.ok(Math.abs(run.samples[5].channels.iat_c - 26.111111) < 1e-5);
  assert.ok(Math.abs(run.samples[5].channels.speed_kmh - 35.405568) < 1e-5);
  assert.equal(run.samples[5].sourceValues.rpm, "2250");
  assert.equal(run.importMetadata.adapterMetadata.unitsRowPresent, true);
  assert.ok(run.warnings.some(item => /MAP, Boost, Knock Retard/i.test(item)));
});

test("detecta también un MSL sin preámbulo y rechaza formatos tabulados sin fila de unidades", () => {
  const text = [
    "Time\tSecL\tRPM\tMAP",
    "sec\ts\tRPM\tkPa",
    "0.0\t202.0\t965\t33.0",
    "0.5\t202.0\t970\t34.0",
  ].join("\n");
  assert.equal(detectTunerStudioMsl(text), true);
  const parsed = parseTunerStudioMsl(text);
  assert.equal(parsed.tunerStudioMetadata.preambleLines.length, 0);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.headers[0], "Elapsed Time (sec)");
  assert.equal(parsed.headers[1], "SecL (s)");

  const noUnits = "Time\tRPM\tMAP\n0.0\t965\t33.0\n0.5\t970\t34.0\n";
  assert.equal(detectTunerStudioMsl(noUnits), false);
  const forced = parseTunerStudioMsl(noUnits);
  assert.equal(forced.tunerStudioMetadata.unitsRowPresent, false);
  assert.ok(forced.warnings.some(item => /unidades temporales/i.test(item)));
});

test("admite CSV con coma sin fila de unidades solo en perfil manual y no inventa unidades", () => {
  const text = "Time,RPM,TPS\n0,850,2\n0.1,900,3\n";
  assert.equal(detectTunerStudioMsl(text), false);
  const parsed = parseTunerStudioMsl(text);
  assert.equal(parsed.delimiter, ",");
  assert.equal(parsed.tunerStudioMetadata.unitsRowPresent, false);
  assert.deepEqual(parsed.headers, ["Elapsed Time", "Engine RPM", "Throttle Position"]);
  assert.ok(parsed.warnings.some(item => /unidades temporales/i.test(item)));
  assert.equal(parsed.tunerStudioMetadata.sourceUnits.Time, null);
  assert.equal(parsed.tunerStudioMetadata.sourceUnits.RPM, null);

  const manuallyDeclared = importTunerStudioMsl(parsed, {
    sourceDomain: "ecu",
    channelMapping: { time_s: "Elapsed Time", rpm: "Engine RPM" },
    units: { time_s: "s", rpm: "rpm" },
  });
  assert.equal(manuallyDeclared.units.time_s, "s");
  assert.equal(manuallyDeclared.units.rpm, "RPM");
});


test("detecta export CSV clásico MegaSquirt y conserva metadatos y unidades del encabezado", async () => {
  const text = await readFile(
    new URL("../fixtures/tunerstudio-megasquirt-export-synthetic.csv", import.meta.url),
    "utf8",
  );
  assert.equal(detectTunerStudioText(text), true);
  const parsed = parseTunerStudioMsl(text);
  assert.equal(parsed.delimiter, ",");
  assert.equal(parsed.tunerStudioMetadata.layout, "comma-delimited-megasquirt-export");
  assert.equal(parsed.tunerStudioMetadata.exportMetadata.tuneFile, "synthetic-2.0L-NA.msq");
  assert.equal(parsed.tunerStudioMetadata.exportMetadata.totalFrames, 5);
  assert.equal(parsed.tunerStudioMetadata.exportMetadata.durationText, "00:00:02.000");
  assert.equal(parsed.tunerStudioMetadata.sourceHeaderLine, 5);
  assert.equal(parsed.sourceLineNumbers[0], 6);
  assert.equal(parsed.rows.length, 5);
  assert.ok(parsed.headers.includes("Elapsed Time (s)"));
  assert.ok(parsed.headers.includes("Engine RPM (rpm)"));
  assert.equal(parsed.tunerStudioMetadata.sourceUnits["MAP(mBar)"], "mBar");
  assert.equal(parsed.tunerStudioMetadata.sourceUnits["TPS(%)"], "%");
});

test("importa Duration como eje, convierte MAP mBar y mantiene Frame sin asignar", async () => {
  const text = await readFile(
    new URL("../fixtures/tunerstudio-megasquirt-export-synthetic.csv", import.meta.url),
    "utf8",
  );
  const parsed = parseTunerStudioMsl(text);
  const run = importTunerStudioMsl(parsed, {
    id: "megasquirt-csv-synthetic",
    name: "tunerstudio-megasquirt-export-synthetic.csv",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (s)",
      rpm: "Engine RPM (rpm)",
      throttle_pct: "TPS(%)",
      map_abs_kpa: "MAP(mBar)",
      ignition_advance_deg: "Spark Advance(deg)",
    },
    units: {
      time_s: "s", rpm: "rpm", throttle_pct: "%", map_abs_kpa: "mBar",
      ignition_advance_deg: "deg",
    },
    importedAt: "2026-11-20T00:00:00.000Z",
  });
  assert.equal(run.importMetadata.importFormat, "megasquirt-tunerstudio-csv/1");
  assert.equal(run.samples[2].time_s, 1);
  assert.equal(run.samples[2].channels.rpm, 1800);
  assert.equal(run.samples[2].channels.throttle_pct, 80);
  assert.equal(run.samples[2].channels.map_abs_kpa, 50);
  assert.equal(run.samples[2].sourceValues.map_abs_kpa, "500");
  assert.ok(run.importMetadata.unmappedHeaders.includes("Frame"));
  assert.ok(run.importMetadata.unmappedHeaders.includes("MIL"));
});

test("advierte diferencias de Total Frames y conserva un primer timestamp anómalo", () => {
  const text = [
    "Tune Datalog export of synthetic test",
    "Tune file: test.msq",
    "Total Frames: 9",
    "Duration :00:00:01.000",
    "Frame,Duration,RPM",
    "0,281.816,1800",
    "1,0.020,1850",
    "2,0.520,1900",
  ].join("\n");
  const parsed = parseTunerStudioMsl(text);
  assert.equal(parsed.tunerStudioMetadata.exportMetadata.totalFrames, 9);
  assert.equal(parsed.tunerStudioMetadata.declaredFrameMismatch, true);
  assert.ok(parsed.warnings.some(item => /declara 9 frames/i.test(item)));
  const run = importTunerStudioMsl(parsed, {
    sourceDomain: "ecu",
    channelMapping: { time_s: "Elapsed Time (s)", rpm: "Engine RPM (rpm)" },
    units: { time_s: "s", rpm: "rpm" },
  });
  assert.equal(run.samples[0].time_s, 281.816);
  assert.equal(run.samples[1].time_s, 0.02);
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
