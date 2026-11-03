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
import { assessRunDataQuality } from "../../src/data-quality.mjs";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

async function fixture(name) {
  return readFile(resolve(fixtureDirectory, name), "utf8");
}

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

test("lee el fixture ECU sintético con BOM, punto y coma y decimales explícitos", async () => {
  const csv = await fixture("ecu-synthetic-semicolon.csv");
  const parsed = parseCsvText(csv);

  assert.equal(parsed.schema, CSV_IMPORT_SCHEMA);
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(parsed.headers, ["Elapsed [s]", "Engine speed [rpm]", "Torque [Nm]", "Power [kW]", "Boost actual [kPa]"]);
  assert.equal(parsed.rows.length, 6);

  const run = mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: {
      time_s: "Elapsed [s]",
      rpm: "Engine speed [rpm]",
      torque_nm: "Torque [Nm]",
      power_kw: "Power [kW]",
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

test("lee fixture de dinamómetro sintético y no infiere su dominio", async () => {
  const parsed = parseCsvText(await fixture("dyno-synthetic-comma.csv"));
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    sourceDomain: "dyno",
    channelMapping: {
      time_s: "Time (s)",
      rpm: "RPM",
      torque_nm: "Wheel torque (Nm)",
      power_kw: "Wheel power (kW)",
    },
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
  assert.throws(
    () => parseCsvText("RPM,rpm ,Torque\n1000,1000,100\n"),
    error => error instanceof CsvImportError && error.code === "CSV_DUPLICATE_HEADERS",
  );
});

test("rechaza encabezados vacíos y filas con más celdas que las declaradas", () => {
  assert.throws(
    () => parseCsvText("time_s,,rpm\n0,1000,100\n"),
    error => error.code === "CSV_EMPTY_HEADER",
  );
  assert.throws(
    () => parseCsvText("time_s,rpm\n0,1000,extra\n"),
    error => error.code === "CSV_ROW_TOO_WIDE",
  );
});

test("advierte filas cortas y conserva los campos finales como faltantes", () => {
  const parsed = parseCsvText("time_s,rpm,torque_nm\n0,1000,100\n1,2000\n");
  assert.equal(parsed.rows[1][2], "");
  assert.match(parsed.warnings[0], /fila\(s\).*faltantes/i);
});

test("rechaza comillas mal formadas y contenido después del cierre de comillas", () => {
  assert.throws(
    () => parseCsvText('time_s,rpm\n0,"1000\n'),
    error => error.code === "CSV_UNTERMINATED_QUOTE",
  );
  assert.throws(
    () => parseCsvText('time_s,rpm\n0,"1000"oops\n'),
    error => error.code === "CSV_TRAILING_DATA_AFTER_QUOTE",
  );
});

test("aplica límites de tamaño, filas, columnas y longitud de celda", () => {
  assert.throws(() => parseCsvText("a,b\n1,2\n", { maxTextLength: 3 }), /tamaño de texto/i);
  assert.throws(() => parseCsvText("a,b\n1,2\n3,4\n", { maxRows: 1 }), /máximo de filas/i);
  assert.throws(() => parseCsvText("a,b,c\n1,2,3\n", { maxColumns: 2 }), /máximo de columnas/i);
  assert.throws(() => parseCsvText("a\n12345\n", { maxFieldLength: 4 }), /tamaño máximo/i);
});

test("exige dominio, tiempo, RPM, asignación única y unidades declaradas", async () => {
  const parsed = parseCsvText(await fixture("ecu-synthetic-semicolon.csv"));
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, { sourceDomain: undefined })),
    error => error.code === "CSV_SOURCE_DOMAIN_REQUIRED",
  );
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, { channelMapping: { time_s: "Elapsed [s]" } })),
    error => error.code === "CSV_REQUIRED_CHANNEL_MISSING",
  );
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, {
      channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]" },
      units: {},
    })),
    error => error.code === "CSV_CHANNEL_UNIT_REQUIRED",
  );
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, {
      channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Engine speed [rpm]" },
      units: { torque_nm: "Nm" },
    })),
    error => error.code === "CSV_COLUMN_MAPPED_MORE_THAN_ONCE",
  );
});

test("no transforma unidades ni completa valores faltantes", () => {
  const parsed = parseCsvText("Elapsed [s];Engine speed [rpm];Torque [Nm]\n0,0;1000;100\n0,1;1100;N/A\n0,2;1200;120\n");
  const run = mapCsvToRun(parsed, importOptions(parsed, {
    channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]" },
    units: { torque_nm: "Nm" },
    decimalSeparator: ",",
  }));
  assert.equal(run.samples[1].channels.torque_nm, null);
  assert.equal(run.samples[2].time_s, 0.2);
  assert.equal(run.units.torque_nm, "Nm");
  assert.equal(assessRunDataQuality(run).channels.find(item => item.key === "torque_nm").coveragePct, 66.67);
});

test("rechaza valores numéricos que no respetan el separador decimal seleccionado", async () => {
  const parsed = parseCsvText("Elapsed [s];Engine speed [rpm];Torque [Nm]\n0,0;1000;100\n0,1;1100;1.234,5\n");
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, {
      channelMapping: { time_s: "Elapsed [s]", rpm: "Engine speed [rpm]", torque_nm: "Torque [Nm]" },
      units: { torque_nm: "Nm" },
      decimalSeparator: ",",
    })),
    error => error.code === "CSV_NUMERIC_VALUE_INVALID" &&
      error.details.row === 3 && error.details.column === "Torque [Nm]",
  );
});

test("rechaza datos con coma decimal y coma como delimitador al mismo tiempo", () => {
  const parsed = parseCsvText("time_s,rpm,torque_nm\n0,1000,100\n1,2000,120\n");
  assert.throws(
    () => mapCsvToRun(parsed, importOptions(parsed, {
      channelMapping: { time_s: "time_s", rpm: "rpm", torque_nm: "torque_nm" },
      units: { torque_nm: "Nm" },
      decimalSeparator: ",",
    })),
    error => error.code === "CSV_DECIMAL_DELIMITER_CONFLICT",
  );
});

test("no modifica el orden ni los datos originales del CSV parseado", async () => {
  const parsed = parseCsvText(await fixture("ecu-synthetic-semicolon.csv"));
  const snapshot = structuredClone(parsed);
  mapCsvToRun(parsed, importOptions(parsed, { decimalSeparator: "," }));
  assert.deepEqual(parsed, snapshot);
});
