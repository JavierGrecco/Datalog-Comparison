/**
 * Adaptador experimental para exportaciones de texto TunerStudio / MegaSquirt.
 *
 * Lee CSV separado por coma o archivos MSL tabulados, con preámbulo opcional
 * y fila opcional de unidades. No interpreta archivos binarios .mlg ni .ms3.
 * MAP y Boost permanecen ambiguos cuando el archivo no declara su referencia
 * o su rol; requieren asignación humana.
 */
import {
  CSV_IMPORT_SCHEMA,
  MAX_CSV_CHARACTERS,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../csv-import.mjs";
import { resolveUnitToken } from "../unit-registry.mjs";

export const TUNERSTUDIO_ADAPTER_ID = "tunerstudio-msl-text-guided/1";

function fail(code, message, details = {}) {
  throw new CsvImportError(code, message, details);
}

function unquoteLine(value) {
  return String(value ?? "").trim().replace(/^"(.*)"$/, "$1").trim();
}

function isPreamble(line) {
  return /^MS[123]\s+Format\b/i.test(unquoteLine(line));
}

export function detectTunerStudioMsl(text) {
  if (typeof text !== "string") return false;
  if (text.length > MAX_CSV_CHARACTERS) return false;
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find(line => line.trim());
  return Boolean(first && isPreamble(first));
}

function isUnitsRow(values, expectedLength) {
  if (!Array.isArray(values) || values.length !== expectedLength) return false;
  let recognized = 0;
  let nonEmpty = 0;
  for (const cell of values) {
    const value = String(cell ?? "").trim();
    if (!value) continue;
    nonEmpty += 1;
    if (resolveUnitToken(value).status === "matched") recognized += 1;
  }
  // A units row is accepted only when nearly all non-empty cells are known
  // units and at least two independent columns carry unit information.
  return nonEmpty >= 2 && recognized >= 2 && recognized / nonEmpty >= 0.75;
}

function normalizeChannelLabel(header) {
  const normalized = String(header ?? "").normalize("NFKC").trim()
    .toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const aliases = new Map([
    ["sec", "Elapsed Time"],
    ["secl", "Elapsed Time"],
    ["elapsed time", "Elapsed Time"],
    ["rpm", "Engine RPM"],
    ["engine speed", "Engine RPM"],
    ["tps", "Throttle Position"],
    ["throttle", "Throttle Position"],
    ["lambda 1", "Wideband Lambda"],
    ["lambda", "Wideband Lambda"],
    ["mat", "Intake Air Temperature"],
    ["iat", "Intake Air Temperature"],
    ["clt", "Coolant Temperature"],
    ["spark", "Spark Advance"],
    ["spark advance", "Spark Advance"],
    ["vss1", "Vehicle Speed"],
    ["vss", "Vehicle Speed"],
    ["afr1", "Wideband AFR"],
    ["afr 1", "Wideband AFR"],
  ]);
  return aliases.get(normalized) ?? String(header ?? "").trim();
}

function hasExplicitUnit(header) {
  return /[([{]\s*[^)\]}]+\s*[)\]}]\s*$/.test(String(header ?? "").trim());
}

/**
 * Parses a TunerStudio/MSL text export and returns the generic table contract.
 * Source headers, units row and preamble remain attached as adapter metadata.
 */
export function parseTunerStudioMsl(text, { delimiter = "auto" } = {}) {
  if (typeof text !== "string") {
    fail("TUNERSTUDIO_INPUT_NOT_TEXT", "El registro TunerStudio debe recibirse como texto UTF-8.");
  }
  if (text.length > MAX_CSV_CHARACTERS) {
    fail("CSV_TOO_LARGE", "El archivo supera el límite de texto permitido para una importación.");
  }

  const sourceLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstLineIndex = sourceLines.findIndex(line => line.trim());
  if (firstLineIndex < 0) fail("CSV_EMPTY_FILE", "El archivo TunerStudio está vacío.");

  const preamble = isPreamble(sourceLines[firstLineIndex])
    ? unquoteLine(sourceLines[firstLineIndex])
    : null;
  if (!preamble && !detectHeaderSignature(text)) {
    fail("TUNERSTUDIO_SIGNATURE_NOT_FOUND",
      "No se encontró un preámbulo MS1/MS2/MS3 ni una cabecera reconocible de texto TunerStudio.");
  }

  const bodyLines = sourceLines.slice(preamble ? firstLineIndex + 1 : firstLineIndex);
  const body = bodyLines.join("\n");
  const parsed = parseCsvText(body, { delimiter });
  const originalHeaders = [...parsed.headers];
  const firstDataRow = parsed.rows[0];
  const unitsRowPresent = isUnitsRow(firstDataRow, originalHeaders.length);
  const sourceUnits = unitsRowPresent
    ? firstDataRow.map(value => String(value ?? "").trim())
    : originalHeaders.map(() => "");
  const dataOffset = unitsRowPresent ? 1 : 0;
  const enrichedHeaders = originalHeaders.map((header, index) => {
    if (hasExplicitUnit(header)) return header;
    const semanticName = normalizeChannelLabel(header);
    return sourceUnits[index] ? semanticName + " (" + sourceUnits[index] + ")" : semanticName;
  });

  const headerLine = parsed.headerLine + (preamble ? firstLineIndex + 1 : firstLineIndex);
  const sourceLineNumbers = parsed.sourceLineNumbers.slice(dataOffset)
    .map(line => line + (preamble ? firstLineIndex + 1 : firstLineIndex));
  const rows = parsed.rows.slice(dataOffset);
  if (rows.length < 2) {
    fail("CSV_NOT_ENOUGH_SAMPLES", "El log TunerStudio necesita al menos dos muestras, además del encabezado y la fila de unidades opcional.");
  }

  const unitsByColumn = Object.fromEntries(originalHeaders.map((header, index) => [
    header, sourceUnits[index] || null,
  ]));
  const tunerStudioMetadata = {
    preamble,
    layout: parsed.delimiter === "\t" ? "tab-delimited-msl" : "comma-delimited-csv",
    unitsRowPresent,
    unitsRow: unitsRowPresent ? [...firstDataRow] : null,
    sourceHeaders: originalHeaders,
    sourceUnits: unitsByColumn,
    sourceHeaderLine: headerLine,
    dataStartLine: sourceLineNumbers[0],
  };

  return {
    ...parsed,
    schema: CSV_IMPORT_SCHEMA,
    headers: enrichedHeaders,
    rows,
    headerLine,
    sourceLineNumbers,
    skippedEmptyRows: parsed.skippedEmptyRows,
    warnings: [
      ...parsed.warnings,
      ...(unitsRowPresent ? [] : ["El log no incluye una fila de unidades reconocible; declaralas manualmente antes de importar."]),
    ],
    tunerStudioMetadata,
  };
}

function detectHeaderSignature(text) {
  try {
    const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim()).slice(0, 2).join("\n");
    const parsed = parseCsvText(firstLine, { delimiter: "auto", maxRows: 3, maxCells: 512 });
    const headers = parsed.headers.map(value => value.trim().toLocaleLowerCase("en-US"));
    return headers.some(value => ["time", "sec", "secl", "time (s)"].includes(value)) &&
      headers.some(value => value === "rpm" || value === "engine rpm");
  } catch {
    return false;
  }
}

/** Normaliza una tabla previamente parseada sin ocultar el origen TunerStudio. */
export function importTunerStudioMsl(parsed, {
  id, name, channelMapping, units, decimalSeparator = ".",
  importedAt = new Date().toISOString(), sourceEncoding = null,
  sourceDomain = "ecu",
} = {}) {
  if (!parsed || parsed.schema !== CSV_IMPORT_SCHEMA || !parsed.tunerStudioMetadata) {
    fail("TUNERSTUDIO_PARSED_INPUT_REQUIRED",
      "Se necesita la tabla devuelta por parseTunerStudioMsl antes de importar.");
  }
  if (sourceDomain !== "ecu") {
    fail("TUNERSTUDIO_SOURCE_DOMAIN_INVALID",
      "Los registros TunerStudio de ECU deben mantenerse en el dominio ECU/logger.");
  }

  const run = mapCsvToRun(parsed, {
    id,
    name,
    sourceDomain,
    channelMapping,
    units,
    decimalSeparator,
    importedAt,
    sourceEncoding,
    parserId: TUNERSTUDIO_ADAPTER_ID,
    importFormat: "tunerstudio-msl-text/1",
    sourceHeaderRow: parsed.tunerStudioMetadata.sourceHeaderLine,
    adapterMetadata: {
      vendor: "EFI Analytics / MegaSquirt community format",
      profile: TUNERSTUDIO_ADAPTER_ID,
      ...parsed.tunerStudioMetadata,
    },
  });
  run.warnings.push(
    "Perfil de texto TunerStudio/MSL: se normalizó el preámbulo y la fila de unidades cuando estaban presentes; revisá cada asignación y conversión.",
    "MAP, Boost, Knock Retard y canales de corrección no se interpretan automáticamente si falta contexto suficiente.",
    "Este adaptador no lee binarios .mlg ni registros nativos .ms3 de tarjeta SD.",
  );
  run.note = "Exportación de texto TunerStudio/MSL inspeccionada localmente. La aplicación conserva encabezados y unidades originales; confirmá semántica y procedencia en el software de origen.";
  return run;
}
