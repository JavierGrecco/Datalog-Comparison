import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CSV_IMPORT_SCHEMA,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../../src/csv-import.mjs";
import { importHaltechNspCsv, detectHaltechNspCsv } from "../../src/adapters/haltech-nsp.mjs";
import { importDynojetPowerCoreCsv } from "../../src/adapters/dynojet-powercore.mjs";
import { assessRunDataQuality } from "../../src/data-quality.mjs";
import { assessRunComparability } from "../../src/run-comparability.mjs";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
async function fixture(name) { return readFile(resolve(fixtureDirectory, name), "utf8"); }

function importOptions(parsed, overrides = {}) {
  return {
    id: "fixture-import",
    name: "Fixture sintético",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed [s]",
      rpm: "Engine speed [rpm]",
      torque_nm: "Torque [Nm]",
      power_kw: "Power [kW]",
    },
    units: { torque_nm: "Nm", power_kw: "kW" },
    importedAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

test("lee el fixture ECU sintético con punto y coma y decimales explícitos", async () => {
  const parsed = parseCsvText(await fixture("ecu-synthetic-semicolon.csv"));
  assert.equal(parsed.schema, CSV_IMPORT_SCHEMA);
  assert.equal(parsed.delimiter, ";");
  assert.equal(parsed.rows.length, 6);
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: {
      time_s: "Elapsed [s]", rpm: "Engine speed [rpm]",
      torque_nm: "Torque [Nm]", power_kw: "Power [kW]",
    },
    units: { torque_nm: "Nm", power_kw: "kW" },
    decimalSeparator: ",",
  }));
  assert.equal(run.synthetic, false);
  assert.equal(run.sourceDomain, "ecu");
  assert.equal(run.samples[1].channels.torque_nm, 151.25);
  assert.equal(run.samples[1].channels.rpm, 2100);
  assert.equal(run.runManifest.role, "exploratory");
  assert.equal(assessRunDataQuality(run).status, "no_obvious_issues");
});

test("el perfil Dynojet PowerCore exige base de medición y conserva unidades declaradas", async () => {
  const parsed = parseCsvText(await fixture("dynojet-powercore-synthetic.csv"));
  const options = {
    id: "dynojet-fixture", name: "Dynojet sintético",
    channelMapping: {
      time_s: "Time (s)", rpm: "Engine RPM",
      torque_nm: "Wheel Torque (ft-lb)", power_kw: "Wheel Power (hp)",
    },
    units: { torque_nm: "ft-lb", power_kw: "hp" },
    importedAt: "2026-11-03T00:00:00.000Z",
  };
  assert.throws(() => importDynojetPowerCoreCsv(parsed, options),
    error => error.code === "DYNOJET_MEASUREMENT_BASIS_REQUIRED");
  const run = importDynojetPowerCoreCsv(parsed, { ...options, measurementBasis: "wheel" });
  assert.equal(run.sourceDomain, "dyno");
  assert.equal(run.measurementBasis, "wheel");
  assert.equal(run.measurementBasisLabel, "Rueda");
  assert.equal(run.importMetadata.parserId, "dynojet-powercore-guided-csv/1");
  assert.ok(Math.abs(run.samples[0].channels.torque_nm - 101.8 * 1.3558179483314004) < 1e-9);
  assert.ok(Math.abs(run.samples[0].channels.power_kw - 42.7 * 0.7456998715822702) < 1e-9);
  assert.equal(run.units.torque_nm, "Nm");
  assert.equal(run.units.power_kw, "kW");
  assert.deepEqual(run.importMetadata.sourceUnits, {
    time_s: "s", rpm: "RPM", torque_nm: "ft-lb", power_kw: "hp",
  });
  assert.equal(run.importMetadata.unitConversions.torque_nm.from, "ft-lb");
  assert.equal(run.importMetadata.unitConversions.power_kw.to, "kW");
  assert.ok(run.warnings.some(warning => /canales y la exportación son configurables/i.test(warning)));
});

test("el mapeo genérico de dinamómetro exige base al asignar torque o potencia", async () => {
  const parsed = parseCsvText(await fixture("dynojet-powercore-synthetic.csv"));
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, {
    sourceDomain: "dyno",
    channelMapping: {
      time_s: "Time (s)", rpm: "Engine RPM", torque_nm: "Wheel Torque (ft-lb)",
    },
    units: { torque_nm: "ft-lb" },
  })), error => error.code === "CSV_DYNO_MEASUREMENT_BASIS_REQUIRED");
});

test("identifica y convierte únicamente la variante Haltech NSP documentada por %DataLog%", async () => {
  const text = await fixture("haltech-nsp-synthetic.csv");
  assert.equal(detectHaltechNspCsv(text), true);
  const run = importHaltechNspCsv(text, {
    name: "haltech-nsp-synthetic.csv",
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  assert.equal(run.sourceDomain, "ecu");
  assert.equal(run.sourceType, "Haltech NSP CSV · ECU/logger");
  assert.equal(run.importMetadata.parserId, "haltech-nsp-community-spec/1");
  assert.equal(run.samples.length, 4);
  assert.equal(run.samples[0].time_s, 0);
  assert.ok(Math.abs(run.samples[1].time_s - 0.1) < 1e-9);
  assert.equal(run.samples[0].channels.rpm, 1800);
  assert.equal(run.samples[0].channels.map_abs_kpa, 100);
  assert.ok(Math.abs(run.samples[0].channels.boost_actual - 78.7) < 1e-9);
  assert.equal(run.samples[0].channels.throttle_pct, 25);
  assert.equal(run.samples[0].channels.iat_c, 25);
  assert.equal(run.samples[0].channels.coolant_temp_c, 25.5);
  assert.equal(run.samples[0].channels.ignition_advance_deg, 30);
  assert.equal(run.samples[0].channels.battery_v, 12.8);
  assert.ok(run.warnings.some(warning => /especificación comunitaria/i.test(warning)));
  assert.ok(run.warnings.some(warning => /ExperimentalType/.test(warning)));
  assert.equal(assessRunDataQuality(run).status, "no_obvious_issues");
});

test("el adaptador Haltech rechaza firmas ausentes y encabezados no soportados", () => {
  assert.equal(detectHaltechNspCsv("time_s,rpm\n0,1000\n"), false);
  assert.throws(() => importHaltechNspCsv("time_s,rpm\n0,1000\n1,1100\n"),
    error => error.code === "HALTECH_SIGNATURE_NOT_FOUND");
  assert.throws(() => importHaltechNspCsv("%DataLog%\n\nTime,Speed\n00:00:01.000,1000\n00:00:01.100,1100\n"),
    error => error.code === "HALTECH_CHANNEL_HEADER_INVALID");
});

test("el adaptador Haltech rechaza timestamp mal formado, unidad incorrecta y ausencia de RPM", async () => {
  const text = await fixture("haltech-nsp-synthetic.csv");
  assert.throws(() => importHaltechNspCsv(text.replace("00:00:01.100", "1.1")),
    error => error.code === "HALTECH_TIMESTAMP_INVALID");
  assert.throws(() => importHaltechNspCsv(text.replace("RPM(EngineSpeed:rpm)", "RPM(EngineSpeed:km/h)")),
    error => error.code === "HALTECH_CHANNEL_UNIT_UNSUPPORTED");
  const withoutRpm = text.split(/\r?\n/).map((line, index) => {
    if (index === 2) return line.replace("RPM(EngineSpeed:rpm),", "");
    if (index > 2 && line.trim()) {
      const columns = line.split(",");
      columns.splice(1, 1);
      return columns.join(",");
    }
    return line;
  }).join("\n");
  assert.throws(() => importHaltechNspCsv(withoutRpm),
    error => error.code === "HALTECH_RPM_CHANNEL_REQUIRED");
});

test("el adaptador Haltech conserva orden y alerta de canales tipados no implementados", async () => {
  const run = importHaltechNspCsv(await fixture("haltech-nsp-synthetic.csv"));
  assert.equal(run.samples[0].time_s, 0);
  assert.ok(Math.abs(run.samples[3].time_s - 0.3) < 1e-9);
  assert.deepEqual(run.importMetadata.adapterMetadata.unsupportedChannels, [
    { name: "Custom", type: "ExperimentalType", unit: "raw" },
  ]);
  assert.deepEqual(run.importMetadata.adapterMetadata.supportedChannels, [
    "rpm", "map_abs_kpa", "boost_actual", "throttle_pct", "iat_c",
    "coolant_temp_c", "ignition_advance_deg", "battery_v",
  ]);
});

test("el adaptador Haltech no asume rollover de medianoche", async () => {
  const text = (await fixture("haltech-nsp-synthetic.csv"))
    .replace("00:00:01.200", "00:00:00.050");
  const run = importHaltechNspCsv(text);
  const quality = assessRunDataQuality(run);
  assert.ok(quality.timestamp.retrogressions > 0);
  assert.equal(quality.timestamp.ordered, false);
});

test("lee el fixture de dinamómetro genérico y no infiere su dominio", async () => {
  const parsed = parseCsvText(await fixture("dyno-synthetic-comma.csv"));
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    sourceDomain: "dyno",
    channelMapping: {
      time_s: "Time (s)", rpm: "RPM",
      torque_nm: "Wheel torque (Nm)", power_kw: "Wheel power (kW)",
    },
    measurementBasis: "wheel",
  }));
  assert.equal(run.sourceDomain, "dyno");
  assert.equal(run.sourceType, "Dinamómetro · origen declarado");
  assert.equal(run.samples.length, 6);
});

test("admite BOM, CRLF, comillas escapadas y saltos de línea dentro de celdas", () => {
  const parsed = parseCsvText('\uFEFFname,description,value\r\n"Engine ""A""","line one\r\nline two",1.5\r\n');
  assert.equal(parsed.headers[0], "name");
  assert.equal(parsed.rows[0][0], 'Engine "A"');
  assert.equal(parsed.rows[0][1], "line one\nline two");
  assert.equal(parsed.rows[0][2], "1.5");
});

test("ignora filas completamente vacías y conserva su recuento de origen", () => {
  const parsed = parseCsvText("time_s,rpm\n0,1000\n\n1,2000\n");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.skippedEmptyRows, 1);
  assert.equal(parsed.sourceRowCount, 4);
});

test("normaliza encabezados para detectar duplicados ambiguos", () => {
  assert.throws(() => parseCsvText("RPM,rpm ,Torque\n1000,1000,100\n"),
    error => error instanceof CsvImportError && error.code === "CSV_DUPLICATE_HEADERS");
});

test("rechaza encabezados vacíos y filas con más celdas que las declaradas", () => {
  assert.throws(() => parseCsvText("time_s,,rpm\n0,1000,100\n"),
    error => error.code === "CSV_EMPTY_HEADER");
  assert.throws(() => parseCsvText("time_s,rpm\n0,1000,extra\n"),
    error => error.code === "CSV_ROW_TOO_WIDE");
});

test("advierte filas cortas y conserva los campos finales como faltantes", () => {
  const parsed = parseCsvText("time_s,rpm,torque_nm\n0,1000,100\n1,2000\n");
  assert.equal(parsed.rows[1][2], "");
  assert.match(parsed.warnings[0], /fila\(s\).*faltantes/i);
});

test("rechaza comillas mal formadas y contenido después del cierre de comillas", () => {
  assert.throws(() => parseCsvText('time_s,rpm\n0,"1000\n'),
    error => error.code === "CSV_UNTERMINATED_QUOTE");
  assert.throws(() => parseCsvText('time_s,rpm\n0,"1000"oops\n'),
    error => error.code === "CSV_TRAILING_DATA_AFTER_QUOTE");
});

test("aplica límites de tamaño, filas, columnas y longitud de celda", () => {
  assert.throws(() => parseCsvText("a,b\n1,2\n", { maxTextLength: 3 }), /tamaño de texto/i);
  assert.throws(() => parseCsvText("a,b\n1,2\n3,4\n", { maxRows: 1 }), /máximo de filas/i);
  assert.throws(() => parseCsvText("a,b,c\n1,2,3\n", { maxColumns: 2 }), /máximo de columnas/i);
  assert.throws(() => parseCsvText("a\n12345\n", { maxFieldLength: 4 }), /tamaño máximo/i);
});

test("exige dominio, tiempo, RPM, asignación única y unidades declaradas", async () => {
  const parsed = parseCsvText(await fixture("ecu-synthetic-semicolon.csv"));
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, { sourceDomain: undefined })),
    error => error.code === "CSV_SOURCE_DOMAIN_REQUIRED");
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, { channelMapping: { time_s: "Elapsed [s]" } })),
    error => error.code === "CSV_REQUIRED_CHANNEL_MISSING");
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: {
      time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]",
    },
    units: {},
  })), error => error.code === "CSV_CHANNEL_UNIT_REQUIRED");
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: {
      time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Engine speed [rpm]",
    },
    units: { torque_nm: "Nm" },
  })), error => error.code === "CSV_COLUMN_MAPPED_MORE_THAN_ONCE");
});

test("no transforma unidades ni completa valores faltantes", () => {
  const parsed = parseCsvText("Elapsed [s];Engine speed [rpm];Torque [Nm]\n0,0;1000;100\n0,1;1100;N/A\n0,2;1200;120\n");
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]" },
    units: { torque_nm: "Nm" }, decimalSeparator: ",",
  }));
  assert.equal(run.samples[1].channels.torque_nm, null);
  assert.equal(run.samples[2].time_s, 0.2);
  assert.equal(run.units.torque_nm, "Nm");
  assert.equal(assessRunDataQuality(run).channels.find(item => item.key === "torque_nm").coveragePct, 66.67);
});

test("rechaza valores numéricos que no respetan el separador decimal seleccionado", async () => {
  const parsed = parseCsvText("Elapsed [s];Engine speed [rpm];Torque [Nm]\n0,0;1000;100\n0,1;1100;1.234,5\n");
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]" },
    units: { torque_nm: "Nm" }, decimalSeparator: ",",
  })), error => error.code === "CSV_NUMERIC_VALUE_INVALID" &&
    error.details.row === 3 && error.details.column === "Torque [Nm]");
});

test("rechaza datos con coma decimal y coma como delimitador al mismo tiempo", () => {
  const parsed = parseCsvText("time_s,rpm,torque_nm\n0,1000,100\n1,2000,120\n");
  assert.throws(() => mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: { time_s: "time_s", rpm: "rpm", torque_nm: "torque_nm" },
    units: { torque_nm: "Nm" }, decimalSeparator: ",",
  })), error => error.code === "CSV_DECIMAL_DELIMITER_CONFLICT");
});

test("no modifica el orden ni los datos originales del CSV parseado", async () => {
  const parsed = parseCsvText(await fixture("ecu-synthetic-semicolon.csv"));
  const snapshot = structuredClone(parsed);
  mapCsvToRun(parsed, importOptions(parsed, { decimalSeparator: "," }));
  assert.deepEqual(parsed, snapshot);
});


test("normaliza unidades explícitas a las unidades canónicas y conserva la procedencia", () => {
  const parsed = parseCsvText(
    "Time (s),RPM,Speed (mph),IAT (F),MAP (psi)\n" +
    "0,1000,60,68,14.503773773\n" +
    "0.1,1100,62,86,15\n",
  );
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: {
      time_s: "Time (s)",
      rpm: "RPM",
      speed_kmh: "Speed (mph)",
      iat_c: "IAT (F)",
      map_abs_kpa: "MAP (psi)",
    },
    units: { speed_kmh: "mph", iat_c: "°F", map_abs_kpa: "psi" },
  }));
  assert.equal(run.units.speed_kmh, "km/h");
  assert.equal(run.units.iat_c, "°C");
  assert.equal(run.units.map_abs_kpa, "kPa");
  assert.ok(Math.abs(run.samples[0].channels.speed_kmh - 96.56064) < 1e-8);
  assert.ok(Math.abs(run.samples[0].channels.iat_c - 20) < 1e-9);
  assert.ok(Math.abs(run.samples[0].channels.map_abs_kpa - 100) < 0.001);
  assert.equal(run.importMetadata.unitNormalizationVersion, "datalog-units/1");
  assert.equal(run.importMetadata.sourceUnits.iat_c, "°F");
  assert.equal(run.importMetadata.unitConversions.iat_c.from, "°F");
});

test("rechaza unidades incompatibles con el canal en vez de etiquetar mal los datos", () => {
  const parsed = parseCsvText("Time,RPM,Torque\n0,1000,14\n0.1,1100,15\n");
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, {
      channelMapping: { time_s: "Time", rpm: "RPM", torque_nm: "Torque" },
      units: { torque_nm: "psi" },
    })),
    error => error.code === "CSV_CHANNEL_UNIT_UNSUPPORTED",
  );
});

test("el adaptador Haltech rechaza la variante de metadatos Channel/ID/Type sin reinterpretarla", async () => {
  const channelListVariant = [
    "%DataLog%",
    "Version : 2",
    "Channel : Engine Speed",
    "Channel : Manifold Pressure",
    "00:00:01.000,1800,1000",
    "00:00:01.100,1900,1020",
  ].join("\n");
  assert.throws(
    () => importHaltechNspCsv(channelListVariant),
    error => error.code === "HALTECH_LAYOUT_UNSUPPORTED" &&
      error.details.detectedLayout === "channel-list",
  );

  const channelTableVariant = [
    "%DataLog%",
    "FileVersion,2",
    "Channel,ID,Type,DisplayMaxMin",
    "Time,0,Time_ms,0-10",
    "00:00:01.000,1800",
  ].join("\n");
  assert.throws(
    () => importHaltechNspCsv(channelTableVariant),
    error => error.code === "HALTECH_LAYOUT_UNSUPPORTED" &&
      error.details.detectedLayout === "channel-table",
  );
});

test("el tipo Haltech AFR se conserva como no soportado hasta verificar si representa AFR o lambda", () => {
  const text = [
    "%DataLog%",
    "",
    "Time(Time_ms:ms),RPM(EngineSpeed:rpm),Wideband(AFR:AFR)",
    "00:00:01.000,1800,10000",
    "00:00:01.100,1900,10200",
    "00:00:01.200,2000,10400",
  ].join("\n");
  const run = importHaltechNspCsv(text);
  assert.equal(Object.hasOwn(run.units, "afr"), false);
  assert.deepEqual(run.importMetadata.adapterMetadata.unsupportedChannels, [
    { name: "Wideband", type: "AFR", unit: "AFR" },
  ]);
  assert.ok(run.warnings.some(warning => /AFR o lambda/i.test(warning)));
});


test("dos unidades de origen distintas convergen a Nm antes de comparar canales", async () => {
  const runFromImperial = mapCsvToRun(parseCsvText(
    "Time (s),RPM,Wheel torque (ft-lb)\n0,2000,100\n0.1,2100,110\n",
  ), importOptions(null, {
    sourceDomain: "dyno",
    channelMapping: {
      time_s: "Time (s)", rpm: "RPM", torque_nm: "Wheel torque (ft-lb)",
    },
    units: { torque_nm: "ft-lb" },
    measurementBasis: "wheel",
  }));
  const runFromMetric = mapCsvToRun(parseCsvText(
    "Time (s),RPM,Wheel torque (Nm)\n0,2000,135.58179483314\n0.1,2100,149.1400\n",
  ), importOptions(null, {
    sourceDomain: "dyno",
    channelMapping: {
      time_s: "Time (s)", rpm: "RPM", torque_nm: "Wheel torque (Nm)",
    },
    units: { torque_nm: "Nm" },
    measurementBasis: "wheel",
  }));

  const result = assessRunComparability(runFromImperial, runFromMetric);
  const torque = result.commonChannels.find(channel => channel.key === "torque_nm");
  assert.ok(torque);
  assert.equal(torque.unit, "Nm");
  assert.equal(runFromImperial.units.torque_nm, "Nm");
  assert.equal(runFromMetric.units.torque_nm, "Nm");
  assert.equal(runFromImperial.importMetadata.sourceUnits.torque_nm, "ft-lb");
  assert.equal(runFromMetric.importMetadata.sourceUnits.torque_nm, "Nm");
  assert.ok(Math.abs(
    runFromImperial.samples[0].channels.torque_nm - runFromMetric.samples[0].channels.torque_nm
  ) < 1e-9);
  assert.ok(Math.abs(
    runFromImperial.samples[1].channels.torque_nm - runFromMetric.samples[1].channels.torque_nm
  ) < 1e-4);
});

test("el comparador excluye torque y potencia cuando difiere la base física del dinamómetro", async () => {
  const parsed = parseCsvText(
    "Time (s),RPM,Torque (Nm),Power (kW)\n" +
    "0,2000,100,20\n" +
    "0.1,2100,110,24\n",
  );
  const common = {
    channelMapping: {
      time_s: "Time (s)", rpm: "RPM", torque_nm: "Torque (Nm)", power_kw: "Power (kW)",
    },
    units: { torque_nm: "Nm", power_kw: "kW" },
    sourceDomain: "dyno",
  };
  const wheel = mapCsvToRun(parsed, importOptions(parsed, {
    ...common, measurementBasis: "wheel",
  }));
  const engine = mapCsvToRun(parsed, importOptions(parsed, {
    ...common, measurementBasis: "engine",
  }));
  const result = assessRunComparability(wheel, engine);

  assert.ok(result.commonChannels.some(channel => channel.key === "rpm"));
  assert.equal(result.commonChannels.some(channel => channel.key === "torque_nm"), false);
  assert.equal(result.commonChannels.some(channel => channel.key === "power_kw"), false);
  assert.deepEqual(
    result.blockedChannels.filter(channel => ["torque_nm", "power_kw"].includes(channel.key))
      .map(channel => channel.reason),
    [
      "La base de medición de torque/potencia no coincide (rueda, rodillo, cubo o motor). No se convierte entre bases físicas.",
      "La base de medición de torque/potencia no coincide (rueda, rodillo, cubo o motor). No se convierte entre bases físicas.",
    ],
  );
});

test("el comparador no trata una base de dinamómetro desconocida como equivalente", async () => {
  const parsed = parseCsvText(
    "Time (s),RPM,Torque (Nm)\n0,2000,100\n0.1,2100,110\n",
  );
  const mapping = {
    time_s: "Time (s)", rpm: "RPM", torque_nm: "Torque (Nm)",
  };
  const reference = mapCsvToRun(parsed, importOptions(parsed, {
    sourceDomain: "dyno", measurementBasis: "wheel",
    channelMapping: mapping, units: { torque_nm: "Nm" },
  }));
  const candidate = mapCsvToRun(parsed, importOptions(parsed, {
    sourceDomain: "dyno", measurementBasis: "unknown",
    channelMapping: mapping, units: { torque_nm: "Nm" },
  }));
  const result = assessRunComparability(reference, candidate);
  assert.equal(result.commonChannels.some(channel => channel.key === "torque_nm"), false);
  assert.match(result.blockedChannels.find(channel => channel.key === "torque_nm").reason,
    /no está identificada de forma fiable/i);
});
