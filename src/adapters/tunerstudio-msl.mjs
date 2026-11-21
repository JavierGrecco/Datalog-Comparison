/**
 * Adaptador experimental para logs de texto TunerStudio / MegaSquirt.
 *
 * La variante MSL se reconoce por su estructura tabulada:
 * Time<TAB>canales, seguida de una fila con la unidad temporal y muestras.
 * Se admiten líneas de preámbulo y eventos MARK. No se fuerza monotonía,
 * no se rellenan faltantes y no se leen binarios .mlg/.ms3.
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

const TIME_UNITS = new Set([
  "sec", "secs", "s", "seconds", "ms", "msec", "msecs", "milliseconds",
]);
const MAX_PREAMBLE_LINES = 8;

function fail(code, message, details = {}) {
  throw new CsvImportError(code, message, details);
}

function unquote(value) {
  return String(value ?? "").trim().replace(/^"(.*)"$/, "$1").trim();
}

function firstNonEmptyIndex(lines) {
  return lines.findIndex(line => line.trim() !== "");
}

function timeUnitFromLine(line) {
  const first = String(line ?? "").split("\t", 1)[0];
  const unit = unquote(first).toLocaleLowerCase("en-US");
  return TIME_UNITS.has(unit) ? unit : null;
}

function isMslHeaderLine(line) {
  const columns = String(line ?? "").split("\t");
  return columns.length >= 2 && unquote(columns[0]).toLocaleLowerCase("en-US") === "time";
}

function findMslHeader(lines) {
  const lastCandidate = Math.min(lines.length - 2, MAX_PREAMBLE_LINES);
  for (let index = 0; index <= lastCandidate; index += 1) {
    if (!isMslHeaderLine(lines[index])) continue;
    const timeUnit = timeUnitFromLine(lines[index + 1]);
    return {
      headerIndex: index,
      unitsIndex: timeUnit ? index + 1 : null,
      timeUnit,
    };
  }
  return null;
}

function isMarkLine(line) {
  return /^MARK(?:\t|[ :]|$)/i.test(String(line ?? "").trimStart());
}

function hasCommaHeaderSignature(text) {
  try {
    const firstLines = String(text).replace(/^\uFEFF/, "")
      .split(/\r?\n/).filter(line => line.trim()).slice(0, 2).join("\n");
    const parsed = parseCsvText(firstLines, { delimiter: ",", maxRows: 3, maxCells: 512 });
    const headers = parsed.headers.map(value => value.trim().toLocaleLowerCase("en-US"));
    return headers.some(value => ["time", "time (s)", "elapsed time", "elapsed [s]"].includes(value)) &&
      headers.some(value => value === "rpm" || value === "engine rpm");
  } catch {
    return false;
  }
}

/**
 * Auto-detection is deliberately narrow: a tab-delimited Time header,
 * time-unit row, and a numeric first field in a later sample. Generic
 * comma-delimited files require the profile to be selected explicitly.
 */
export function detectTunerStudioMsl(text) {
  if (typeof text !== "string" || text.length > MAX_CSV_CHARACTERS) return false;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const structure = findMslHeader(lines);
  if (!structure?.timeUnit) return false;

  for (let index = structure.unitsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trimEnd();
    if (!line.trim() || isMarkLine(line)) continue;
    const first = unquote(line.split("\t", 1)[0]);
    return Number.isFinite(Number(first)) && first !== "";
  }
  return false;
}

function normalizeChannelLabel(header) {
  const normalized = String(header ?? "").normalize("NFKC").trim()
    .toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const aliases = new Map([
    ["time", "Elapsed Time"],
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
  // SecL is intentionally not mapped to time: Time is the MSL axis and
  // SecL remains an independent source channel.
  return aliases.get(normalized) ?? String(header ?? "").trim();
}

function hasExplicitUnit(header) {
  return /[([{]\s*[^)\]}]+\s*[)\]}]\s*$/.test(String(header ?? "").trim());
}

function isUnitsRow(values) {
  return Array.isArray(values) && TIME_UNITS.has(
    String(values[0] ?? "").trim().toLocaleLowerCase("en-US"),
  );
}

function mapOriginalLine(filteredLines, parsedLine) {
  const entry = filteredLines[parsedLine - 1];
  return entry?.lineNumber ?? null;
}

/**
 * Reads a TunerStudio MSL (tab-delimited) log, or a comma-delimited text table
 * when the user explicitly selects this profile. Returns the neutral CSV table
 * contract and preserves the original structure in adapter metadata.
 */
export function parseTunerStudioMsl(text, { delimiter = "auto" } = {}) {
  if (typeof text !== "string") {
    fail("TUNERSTUDIO_INPUT_NOT_TEXT", "El registro TunerStudio debe recibirse como texto UTF-8.");
  }
  if (text.length > MAX_CSV_CHARACTERS) {
    fail("CSV_TOO_LARGE", "El archivo supera el límite de texto permitido para una importación.");
  }

  const sourceLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstLineIndex = firstNonEmptyIndex(sourceLines);
  if (firstLineIndex < 0) fail("CSV_EMPTY_FILE", "El archivo TunerStudio está vacío.");

  const structure = findMslHeader(sourceLines);
  let layout;
  let startLineIndex;
  let selectedDelimiter;
  if (structure) {
    layout = "tab-delimited-msl";
    startLineIndex = structure.headerIndex;
    selectedDelimiter = "\t";
  } else {
    layout = "comma-delimited-text";
    startLineIndex = firstLineIndex;
    selectedDelimiter = delimiter;
    if (!hasCommaHeaderSignature(sourceLines.slice(firstLineIndex).join("\n"))) {
      fail("TUNERSTUDIO_SIGNATURE_NOT_FOUND",
        "No se encontró un MSL tabulado con fila de unidades ni un CSV de texto con encabezados Time y RPM.");
    }
    if (selectedDelimiter === "auto") selectedDelimiter = ",";
  }

  const preambleLines = sourceLines.slice(0, startLineIndex)
    .map((line, index) => ({ text: line.trimEnd(), line: index + 1 }))
    .filter(item => item.text.trim() !== "");

  const retainedLines = [];
  const markerLines = [];
  for (let index = startLineIndex; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    if (index > startLineIndex && isMarkLine(line)) {
      markerLines.push({ line: index + 1, text: line.trim() });
      continue;
    }
    retainedLines.push({ text: line, lineNumber: index + 1 });
  }

  const parsed = parseCsvText(retainedLines.map(item => item.text).join("\n"), {
    delimiter: selectedDelimiter,
  });
  const originalHeaders = [...parsed.headers];
  const firstDataRow = parsed.rows[0];
  const unitsRowPresent = isUnitsRow(firstDataRow);
  const sourceUnits = unitsRowPresent
    ? firstDataRow.map(value => String(value ?? "").trim())
    : originalHeaders.map(() => "");
  const dataOffset = unitsRowPresent ? 1 : 0;

  const enrichedHeaders = originalHeaders.map((header, index) => {
    if (hasExplicitUnit(header)) return header;
    const semanticName = normalizeChannelLabel(header);
    return sourceUnits[index] ? semanticName + " (" + sourceUnits[index] + ")" : semanticName;
  });

  const headerLine = mapOriginalLine(retainedLines, parsed.headerLine);
  const sourceLineNumbers = parsed.sourceLineNumbers
    .slice(dataOffset)
    .map(line => mapOriginalLine(retainedLines, line));
  const rows = parsed.rows.slice(dataOffset);
  if (rows.length < 2) {
    fail("CSV_NOT_ENOUGH_SAMPLES",
      "El log TunerStudio necesita al menos dos muestras después del encabezado y la fila opcional de unidades.");
  }
  if (sourceLineNumbers.some(line => !Number.isSafeInteger(line))) {
    fail("TUNERSTUDIO_SOURCE_LINE_MAPPING_INVALID",
      "No se pudieron conservar las líneas físicas del archivo de origen.");
  }

  const unitsByColumn = Object.fromEntries(originalHeaders.map((header, index) => [
    header, sourceUnits[index] || null,
  ]));
  const tunerStudioMetadata = {
    preambleLines,
    layout,
    unitsRowPresent,
    unitsRow: unitsRowPresent ? [...firstDataRow] : null,
    sourceHeaders: originalHeaders,
    sourceUnits: unitsByColumn,
    sourceHeaderLine: headerLine,
    dataStartLine: sourceLineNumbers[0],
    markerLines,
    markerCount: markerLines.length,
  };

  const warnings = [
    ...parsed.warnings,
    ...(unitsRowPresent ? [] : ["El log no incluye una fila de unidades temporales reconocible; declaralas manualmente antes de importar."]),
    ...(markerLines.length ? [markerLines.length + " evento(s) MARK se conservaron en metadatos y se excluyeron de las muestras numéricas."] : []),
    "Los campos vacíos y no numéricos no se rellenan con el último valor; se conservan como faltantes para no ocultar pérdidas de señal.",
    "No se corrigen retrocesos ni reinicios del reloj. Revisá el eje temporal y sus discontinuidades antes de comparar.",
  ];

  return {
    ...parsed,
    schema: CSV_IMPORT_SCHEMA,
    delimiter: selectedDelimiter,
    headers: enrichedHeaders,
    rows,
    headerLine,
    sourceLineNumbers,
    sourceRowCount: sourceLines.length,
    skippedEmptyRows: parsed.skippedEmptyRows,
    warnings,
    tunerStudioMetadata,
  };
}

/** Normalizes a parsed MSL/text table while retaining source layout metadata. */
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
    "Perfil de texto TunerStudio/MSL: se conservaron el encabezado, las unidades, el preámbulo y los eventos disponibles; revisá cada asignación y conversión.",
    "MAP, Boost, Knock Retard y canales de corrección no se interpretan automáticamente si falta contexto suficiente.",
    "Los campos faltantes no se rellenan. Este perfil no lee binarios .mlg ni registros nativos .ms3 de tarjeta SD.",
  );
  run.note = "Log de texto TunerStudio/MSL inspeccionado localmente. La aplicación conserva encabezados y unidades originales; confirmá semántica y procedencia en el software de origen.";
  return run;
}
