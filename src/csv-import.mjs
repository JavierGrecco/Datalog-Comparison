/**
 * Importación CSV genérica y deliberadamente explícita.
 * Los perfiles específicos viven en src/adapters/ y declaran sus conversiones.
 */
import { createRunManifestFromRun } from "./run-manifest.mjs";
import { createEmptyOperatingConditions } from "./operating-conditions.mjs";
import { UNIT_REGISTRY_VERSION, resolveUnitForChannel } from "./unit-registry.mjs";

export const CSV_IMPORT_SCHEMA = "datalog-workbench.csv-import/1";
export const CSV_RUN_SCHEMA = "datalog-workbench.csv-run/1";
export const MAX_CSV_CHARACTERS = 10_000_000;
export const MAX_CSV_ROWS = 100_000;
export const MAX_CSV_COLUMNS = 128;
export const MAX_CSV_FIELD_LENGTH = 16_384;

export const CSV_CHANNEL_DEFINITIONS = Object.freeze([
  { key: "time_s", label: "Tiempo relativo", required: false, axis: true, defaultUnit: "s" },
  { key: "rpm", label: "Velocidad de motor", required: false, axis: true, defaultUnit: "RPM" },
  { key: "distance_km", label: "Distancia recorrida", required: false },
  { key: "torque_nm", label: "Torque", required: false },
  { key: "power_kw", label: "Potencia", required: false },
  { key: "speed_kmh", label: "Velocidad del vehículo", required: false },
  { key: "boost_target", label: "Presión objetivo", required: false },
  { key: "boost_actual", label: "Presión medida", required: false },
  { key: "map_abs_kpa", label: "Presión absoluta de colector", required: false },
  { key: "fuel_pressure_kpa", label: "Presión de combustible", required: false },
  { key: "throttle_pct", label: "Acelerador", required: false },
  { key: "iat_c", label: "Temperatura de admisión", required: false },
  { key: "coolant_temp_c", label: "Temperatura de refrigerante", required: false },
  { key: "ignition_advance_deg", label: "Avance de encendido", required: false },
  { key: "battery_v", label: "Tensión de batería", required: false },
  { key: "lambda", label: "Lambda", required: false },
  { key: "afr", label: "AFR", required: false },
]);

export const DYNO_MEASUREMENT_BASES = Object.freeze({
  wheel: "Rueda",
  roller: "Rodillo",
  hub: "Cubo",
  engine: "Motor",
  unknown: "Sin identificar",
});

const DELIMITERS = [",", ";", "\t"];
const MISSING_NUMERIC_VALUES = new Set(["", "na", "n/a", "null", "nan", "—", "--", "-"]);
const VALID_SOURCE_DOMAINS = new Set(["ecu", "dyno", "unknown"]);

export class CsvImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CsvImportError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details) {
  throw new CsvImportError(code, message, details);
}

function countFirstRecordDelimiters(text) {
  const counts = new Map(DELIMITERS.map(delimiter => [delimiter, 0]));
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) break;
    if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }
  return counts;
}

function detectDelimiter(text) {
  const counts = countFirstRecordDelimiters(text);
  const maximum = Math.max(...counts.values());
  if (maximum === 0) return ",";
  const candidates = [...counts.entries()]
    .filter(([, count]) => count === maximum)
    .map(([delimiter]) => delimiter);
  if (candidates.length !== 1) {
    fail("CSV_DELIMITER_AMBIGUOUS",
      "No se pudo identificar un separador único. Seleccioná o normalizá el delimitador del archivo.",
      { candidates });
  }
  return candidates[0];
}

function parseRecords(text, delimiter, limits) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  let physicalLine = 1;
  let recordStartLine = 1;

  const append = char => {
    field += char;
    if (field.length > limits.maxFieldLength) {
      fail("CSV_FIELD_TOO_LARGE", "Una celda supera el tamaño máximo permitido.", {
        line: recordStartLine, maxFieldLength: limits.maxFieldLength,
      });
    }
  };
  const pushField = () => {
    record.push(field);
    field = "";
    quoteClosed = false;
    if (record.length > limits.maxColumns) {
      fail("CSV_TOO_MANY_COLUMNS", "El archivo supera el máximo de columnas permitido.", {
        line: recordStartLine, maxColumns: limits.maxColumns,
      });
    }
  };
  const pushRecord = () => {
    pushField();
    records.push({ values: record, line: recordStartLine });
    record = [];
    if (records.length > limits.maxRows + 1) {
      fail("CSV_TOO_MANY_ROWS", "El archivo supera el máximo de filas permitido.", {
        maxRows: limits.maxRows,
      });
    }
    recordStartLine = physicalLine + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else if (char === "\r") {
        append("\n");
        if (text[index + 1] === "\n") index += 1;
        physicalLine += 1;
      } else {
        append(char);
        if (char === "\n") physicalLine += 1;
      }
      continue;
    }
    if (quoteClosed) {
      if (char === delimiter) pushField();
      else if (char === "\r" || char === "\n") {
        pushRecord();
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        physicalLine += 1;
      } else {
        fail("CSV_TRAILING_DATA_AFTER_QUOTE",
          "Hay caracteres después del cierre de una celda entrecomillada.",
          { line: physicalLine, recordLine: recordStartLine });
      }
      continue;
    }
    if (char === delimiter) pushField();
    else if (char === "\r" || char === "\n") {
      pushRecord();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      physicalLine += 1;
    } else if (char === '"') {
      if (field.length !== 0) {
        fail("CSV_QUOTE_IN_UNQUOTED_FIELD",
          "Se encontró una comilla dentro de una celda no entrecomillada.",
          { line: physicalLine, recordLine: recordStartLine });
      }
      quoted = true;
    } else append(char);
  }
  if (quoted) {
    fail("CSV_UNTERMINATED_QUOTE", "El archivo termina con una celda entrecomillada sin cerrar.", {
      line: physicalLine, recordLine: recordStartLine,
    });
  }
  if (field.length || record.length || quoteClosed) pushRecord();
  return records;
}

function normalizeHeader(header) {
  return String(header ?? "").replace(/^\uFEFF/, "").trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function isBlankRecord(record) {
  return record.values.every(value => String(value).trim() === "");
}

/** Parser CSV genérico: no asigna semántica a nombres de columnas ni unidades. */
export function parseCsvText(input, options = {}) {
  if (typeof input !== "string") fail("CSV_INPUT_NOT_TEXT", "El contenido CSV debe recibirse como texto UTF-8.");
  const {
    delimiter = "auto",
    maxTextLength = MAX_CSV_CHARACTERS,
    maxRows = MAX_CSV_ROWS,
    maxColumns = MAX_CSV_COLUMNS,
    maxFieldLength = MAX_CSV_FIELD_LENGTH,
  } = options;
  if (input.length > maxTextLength) fail("CSV_TOO_LARGE", "El archivo supera el tamaño de texto permitido.", { maxTextLength });
  if (![...DELIMITERS, "auto"].includes(delimiter)) {
    fail("CSV_DELIMITER_UNSUPPORTED", "El delimitador debe ser auto, coma, punto y coma o tabulación.");
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 ||
      !Number.isSafeInteger(maxColumns) || maxColumns < 1 ||
      !Number.isSafeInteger(maxFieldLength) || maxFieldLength < 1) {
    fail("CSV_LIMIT_INVALID", "Los límites de lectura deben ser enteros positivos.");
  }

  const text = input.replace(/^\uFEFF/, "");
  if (!text.trim()) fail("CSV_EMPTY_FILE", "El archivo CSV está vacío.");
  const selectedDelimiter = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  const allRecords = parseRecords(text, selectedDelimiter, { maxRows, maxColumns, maxFieldLength });
  const skippedEmptyRows = allRecords.filter(isBlankRecord).length;
  const records = allRecords.filter(record => !isBlankRecord(record));
  if (records.length < 2) {
    fail("CSV_HEADER_OR_DATA_MISSING", "El CSV debe incluir una fila de encabezados y al menos una fila de datos.");
  }

  const headers = records[0].values.map(value => String(value).trim());
  if (headers.some(header => !header)) fail("CSV_EMPTY_HEADER", "Todos los encabezados deben tener un nombre.");
  const normalizedHeaders = headers.map(normalizeHeader);
  const duplicates = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicates.length) {
    fail("CSV_DUPLICATE_HEADERS", "Hay encabezados duplicados después de normalizar espacios y mayúsculas.", {
      duplicates: [...new Set(duplicates)],
    });
  }

  const warnings = [];
  let shortRows = 0;
  const rows = records.slice(1).map((sourceRecord, rowIndex) => {
    if (sourceRecord.values.length > headers.length) {
      fail("CSV_ROW_TOO_WIDE",
        "Una fila contiene más celdas que el encabezado; no se puede asignar cada valor sin ambigüedad.",
        { row: rowIndex + 2, expectedColumns: headers.length, actualColumns: sourceRecord.values.length });
    }
    if (sourceRecord.values.length < headers.length) {
      shortRows += 1;
      return [...sourceRecord.values, ...Array(headers.length - sourceRecord.values.length).fill("")];
    }
    return sourceRecord.values;
  });
  if (shortRows) warnings.push(shortRows +
    " fila(s) tenían menos celdas que el encabezado; los campos finales se conservaron como faltantes.");

  return {
    schema: CSV_IMPORT_SCHEMA,
    delimiter: selectedDelimiter,
    delimiterLabel: selectedDelimiter === "\t" ? "tabulación" :
      selectedDelimiter === ";" ? "punto y coma" : "coma",
    headers, rows, sourceRowCount: allRecords.length, skippedEmptyRows, warnings,
  };
}

function parseNumericCell(rawValue, decimalSeparator, rowNumber, columnName) {
  const text = String(rawValue ?? "").trim();
  if (MISSING_NUMERIC_VALUES.has(text.toLocaleLowerCase("en-US"))) return null;
  const decimalMark = decimalSeparator === "," ? "," : ".";
  const numericPattern = decimalMark === ","
    ? /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/
    : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!numericPattern.test(text)) {
    fail("CSV_NUMERIC_VALUE_INVALID",
      "El valor '" + text.slice(0, 60) + "' no es numérico con el separador decimal declarado.",
      { row: rowNumber, column: columnName, decimalSeparator });
  }
  const value = Number(decimalMark === "," ? text.replace(",", ".") : text);
  if (!Number.isFinite(value)) {
    fail("CSV_NUMERIC_VALUE_INVALID", "El valor numérico no es finito.", {
      row: rowNumber, column: columnName, decimalSeparator,
    });
  }
  return value;
}


/**
 * Normaliza unidades con reglas explícitas y dimensionalmente compatibles.
 * Los símbolos se comparan respetando el caso según UCUM; no se hace
 * lower-case global ni se eliminan prefijos que cambian la magnitud.
 */
function resolveCanonicalUnit(channelKey, sourceUnit) {
  const resolved = resolveUnitForChannel(channelKey, sourceUnit);
  if (resolved.status !== "matched") {
    fail("CSV_CHANNEL_UNIT_UNSUPPORTED",
      resolved.status === "dimension_mismatch"
        ? "La unidad '" + String(sourceUnit) + "' no corresponde a la dimensión del canal " + channelKey + "."
        : "La unidad '" + String(sourceUnit) + "' no está reconocida de forma segura para el canal " + channelKey + ". No se convirtió el valor.",
      {
        channel: channelKey,
        sourceUnit,
        status: resolved.status,
        expectedDimension: resolved.expectedDimension,
        actualDimension: resolved.actualDimension ?? resolved.dimension ?? null,
      });
  }
  return {
    sourceUnit: String(sourceUnit).trim(),
    canonicalUnit: resolved.canonicalUnit,
    factor: resolved.factor,
    offset: resolved.offset,
    conversionApplied: resolved.conversionApplied,
  };
}

function convertToCanonical(value, rule) {
  if (value === null) return null;
  const converted = value * rule.factor + rule.offset;
  if (!Number.isFinite(converted)) {
    fail("CSV_UNIT_CONVERSION_NON_FINITE", "La conversión de unidades produjo un valor no finito.");
  }
  return converted;
}

function safeDisplayName(value, fallback) {
  const name = String(value ?? "").split(/[\\/]/).pop().trim();
  return (name || fallback).slice(0, 120);
}

/** Crea un registro exploratorio usando mapeo y unidades explícitos. */
export function mapCsvToRun(parsed, {
  id, name, sourceDomain, channelMapping, units, decimalSeparator = ".",
  importedAt = new Date().toISOString(), parserId = "datalog-csv/1",
  importFormat = "generic-csv", sourceHeaderRow = 1, sourceHeaderRows = null,
  adapterMetadata = null, measurementBasis = null,
} = {}) {
  if (!parsed || parsed.schema !== CSV_IMPORT_SCHEMA || !Array.isArray(parsed.headers) ||
      !Array.isArray(parsed.rows)) {
    fail("CSV_PARSED_INPUT_INVALID", "Se necesita el resultado de parseCsvText o una tabla normalizada por un adaptador.");
  }
  if (!VALID_SOURCE_DOMAINS.has(sourceDomain)) {
    fail("CSV_SOURCE_DOMAIN_REQUIRED", "Seleccioná explícitamente ECU/logger, dinamómetro u origen sin clasificar.");
  }
  if (decimalSeparator !== "." && decimalSeparator !== ",") {
    fail("CSV_DECIMAL_SEPARATOR_INVALID", "El separador decimal debe ser punto o coma.");
  }
  if (!channelMapping || typeof channelMapping !== "object" || Array.isArray(channelMapping)) {
    fail("CSV_MAPPING_REQUIRED", "Definí la asignación de columnas antes de inspeccionar el archivo.");
  }
  if (!units || typeof units !== "object" || Array.isArray(units)) {
    fail("CSV_UNITS_REQUIRED", "Declarar las unidades de los canales es obligatorio.");
  }
  if (!Number.isSafeInteger(sourceHeaderRow) || sourceHeaderRow < 1) {
    fail("CSV_SOURCE_HEADER_ROW_INVALID", "La fila de encabezado de origen debe ser un entero positivo.");
  }
  if (parsed.rows.length < 2) fail("CSV_NOT_ENOUGH_SAMPLES", "Se necesitan al menos dos filas de datos para crear un registro.");

  const definitions = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition]));
  const mappingEntries = Object.entries(channelMapping).filter(([, header]) =>
    header !== null && header !== undefined && header !== "");
  const unknownKeys = mappingEntries.map(([key]) => key).filter(key => !definitions.has(key));
  if (unknownKeys.length) fail("CSV_CHANNEL_UNSUPPORTED", "Hay canales fuera del contrato de importación.", { channels: unknownKeys });

  const mapping = Object.fromEntries(mappingEntries);
  if (!mapping.time_s && !mapping.rpm) {
    fail("CSV_AXIS_REQUIRED",
      "Asigná al menos un eje disponible: tiempo relativo o RPM. No se generarán marcas de tiempo ni RPM artificiales.");
  }
  const usedHeaders = Object.values(mapping);
  const repeatedHeaders = usedHeaders.filter((header, index) => usedHeaders.indexOf(header) !== index);
  if (repeatedHeaders.length) {
    fail("CSV_COLUMN_MAPPED_MORE_THAN_ONCE",
      "Una columna de origen no puede representar dos canales distintos.",
      { columns: [...new Set(repeatedHeaders)] });
  }

  const headerIndexes = new Map(parsed.headers.map((header, index) => [header, index]));
  const unitRules = {};
  for (const [key, header] of Object.entries(mapping)) {
    if (!headerIndexes.has(header)) fail("CSV_MAPPING_HEADER_UNKNOWN",
      "La columna asignada ya no existe en el archivo.", { channel: key, header });
    const definition = definitions.get(key);
    const sourceUnit = definition.fixedUnit ?? String(units[key] ?? definition.defaultUnit ?? "").trim();
    if (!sourceUnit || sourceUnit.length > 32) fail("CSV_CHANNEL_UNIT_REQUIRED",
      "Declarar una unidad válida es obligatorio para cada canal asignado.", { channel: key });
    if (definition.fixedUnit && sourceUnit !== definition.fixedUnit) {
      fail("CSV_FIXED_UNIT_MISMATCH", "El canal " + key + " debe expresarse en " + definition.fixedUnit + ".", {
        channel: key, expectedUnit: definition.fixedUnit, actualUnit: sourceUnit,
      });
    }
    unitRules[key] = definition.fixedUnit
      ? { sourceUnit, canonicalUnit: definition.fixedUnit, factor: 1, offset: 0, conversionApplied: false }
      : resolveCanonicalUnit(key, sourceUnit);
  }
  if (decimalSeparator === "," && parsed.delimiter === ",") {
    fail("CSV_DECIMAL_DELIMITER_CONFLICT",
      "No se admite coma como separador decimal y de columnas al mismo tiempo. Usá punto y coma o normalizá el archivo.");
  }

  const hasDynoOutput = Boolean(mapping.torque_nm || mapping.power_kw);
  if (sourceDomain === "dyno" && hasDynoOutput && !mapping.rpm) {
    fail("CSV_DYNO_RPM_REQUIRED",
      "Para importar torque o potencia de un dinamómetro, asigná el eje RPM. Sin RPM no se puede construir una curva de torque/potencia por régimen.");
  }
  const measurementBasisHints = Object.entries(mapping)
    .filter(([key]) => ["torque_nm", "power_kw"].includes(key))
    .map(([channel, header]) => {
      const normalized = String(header).normalize("NFKD").replace(/\p{M}/gu, "")
        .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
      const basis = /\bwheel\b|\bru(e|é)da\b/.test(normalized) ? "wheel"
        : /\broller\b|\brodillo\b/.test(normalized) ? "roller"
          : /\bhub\b|\bcubo\b/.test(normalized) ? "hub"
            : /\bengine\b|\bmotor\b/.test(normalized) ? "engine" : null;
      return basis ? { channel, header, basis } : null;
    }).filter(Boolean);
  const distinctBasisHints = [...new Set(measurementBasisHints.map(item => item.basis))];
  const measurementBasisHeaderHint = distinctBasisHints.length === 1 ? distinctBasisHints[0] : null;
  if (sourceDomain === "dyno" && hasDynoOutput && distinctBasisHints.length > 1) {
    fail("CSV_DYNO_HEADER_BASIS_CONFLICT",
      "Los encabezados de torque/potencia indican bases físicas diferentes. Revisá los canales antes de importar.",
      { hints: measurementBasisHints });
  }
  if (sourceDomain === "dyno" && hasDynoOutput && measurementBasisHeaderHint &&
      measurementBasis && measurementBasis !== "unknown" && measurementBasis !== measurementBasisHeaderHint) {
    fail("CSV_DYNO_BASIS_HEADER_MISMATCH",
      "La base de medición declarada contradice el calificador del encabezado de torque/potencia.",
      { declaredBasis: measurementBasis, headerBasis: measurementBasisHeaderHint, hints: measurementBasisHints });
  }
  if (sourceDomain === "dyno" && hasDynoOutput) {
    if (!measurementBasis || !Object.hasOwn(DYNO_MEASUREMENT_BASES, measurementBasis)) {
      fail("CSV_DYNO_MEASUREMENT_BASIS_REQUIRED",
        "Para importar torque o potencia de un dinamómetro, declarar si el valor corresponde a rueda, rodillo, cubo, motor o base desconocida.");
    }
  } else if (measurementBasis && !Object.hasOwn(DYNO_MEASUREMENT_BASES, measurementBasis)) {
    fail("CSV_DYNO_MEASUREMENT_BASIS_INVALID", "La base de medición del dinamómetro no es válida.");
  }

  const sampleRows = parsed.rows.map((row, index) => {
    const channels = {};
    const sourceValues = {};
    for (const [key, header] of Object.entries(mapping)) {
      const sourceCell = row[headerIndexes.get(header)] ?? "";
      const rawValue = parseNumericCell(sourceCell, decimalSeparator,
        index + sourceHeaderRow + 1, header);
      channels[key] = convertToCanonical(rawValue, unitRules[key]);
      sourceValues[key] = String(sourceCell);
    }
    return {
      time_s: channels.time_s ?? null,
      channels,
      // Vendor adapters may normalize raw values before this generic mapping stage.
      // Preserve textual cells here only for generic/Dynojet CSV input.
      ...(!String(importFormat).startsWith("haltech-nsp-") ? { sourceValues } : {}),
    };
  });

  const displayName = safeDisplayName(name, "Registro CSV importado");
  const createdAt = Number.isFinite(Date.parse(importedAt)) ? new Date(importedAt).toISOString() : null;
  if (!createdAt) fail("CSV_IMPORT_TIMESTAMP_INVALID", "La fecha de importación debe ser válida.");

  const basisLabel = measurementBasis ? DYNO_MEASUREMENT_BASES[measurementBasis] : null;
  const sourceLabels = {
    ecu: String(importFormat).startsWith("haltech-nsp-") ? "Haltech NSP CSV · ECU/logger" : "ECU/logger · origen declarado",
    dyno: importFormat === "dynojet-powercore-guided-csv/1"
      ? "Dynojet PowerCore/WinPEP · CSV con mapeo guiado"
      : "Dinamómetro · origen declarado",
    unknown: "Origen sin clasificar",
  };
  const run = {
    schema: CSV_RUN_SCHEMA,
    id: String(id ?? "csv-import").slice(0, 128),
    name: displayName,
    filename: displayName,
    sourceDomain,
    sourceType: sourceLabels[sourceDomain],
    synthetic: false,
    measurementBasis: sourceDomain === "dyno" ? measurementBasis : null,
    measurementBasisLabel: sourceDomain === "dyno" ? basisLabel : null,
    samples: sampleRows,
    units: Object.fromEntries(Object.entries(unitRules).map(([key, rule]) => [key, rule.canonicalUnit])),
    importMetadata: {
      parserId,
      importFormat,
      unitNormalizationVersion: UNIT_REGISTRY_VERSION,
      sourceUnits: Object.fromEntries(Object.entries(unitRules).map(([key, rule]) => [key, rule.sourceUnit])),
      unitConversions: Object.fromEntries(Object.entries(unitRules)
        .filter(([, rule]) => rule.conversionApplied)
        .map(([key, rule]) => [key, {
          from: rule.sourceUnit,
          to: rule.canonicalUnit,
          factor: rule.factor,
          offset: rule.offset,
          formula: "canonical = source × factor + offset",
        }])),
      sourceRowCount: parsed.sourceRowCount,
      headerRows: Array.isArray(sourceHeaderRows) ? sourceHeaderRows : [sourceHeaderRow],
      skippedNonEmptyRowCount: 0,
      skippedEmptyRowCount: Number.isSafeInteger(parsed.skippedEmptyRows) ? parsed.skippedEmptyRows : 0,
      parsedSampleCount: sampleRows.length,
      channelMapping: Object.entries(mapping).map(([key, header]) => ({
        channel: key,
        sourceHeader: header,
        sourceUnit: unitRules[key].sourceUnit,
        canonicalUnit: unitRules[key].canonicalUnit,
      })),
      ...(measurementBasisHeaderHint ? { measurementBasisHeaderHint } : {}),
      unmappedHeaders: parsed.headers.filter(header => !usedHeaders.includes(header)),
      ...(adapterMetadata ? { adapterMetadata } : {}),
    },
    operatingConditions: createEmptyOperatingConditions(),
    warnings: [
      ...parsed.warnings,
      ...(!mapping.time_s ? ["El archivo no incluye eje temporal. Se conserva el orden de origen; no se calcula frecuencia, duración ni sincronización temporal."] : []),
      ...(!mapping.rpm ? ["El archivo no incluye RPM. No están disponibles los análisis o curvas que requieren eje de régimen."] : []),
      ...(parsed.headers.some(header => !usedHeaders.includes(header))
        ? [parsed.headers.filter(header => !usedHeaders.includes(header)).length +
          " columna(s) permanecen sin asignar. No se dedujo su significado por rango numérico ni se incorporaron al modelo normalizado."]
        : []),
      ...Object.entries(unitRules).filter(([, rule]) => rule.conversionApplied).map(([key, rule]) =>
        key + ": se normalizó " + rule.sourceUnit + " a " + rule.canonicalUnit + " mediante una conversión explícita y versionada."),
      "El origen y las unidades originales fueron declarados o interpretados por el perfil; no se autentican automáticamente.",
      "El archivo se inspeccionó localmente; no se habilita por sí solo una comparación con otro registro.",
      ...(sourceDomain === "dyno" && measurementBasis === "unknown"
        ? ["La base de medición de torque/potencia del dinamómetro permanece sin identificar.",
          ...(measurementBasisHeaderHint
            ? ["Los encabezados sugieren base " + measurementBasisHeaderHint + ", pero no se toma como confirmación de la base física."]
            : [])]
        : []),
    ],
    note: "Registro CSV inspeccionado localmente. La procedencia declarada requiere revisión.",
    importedAt: createdAt,
  };
  run.runManifest = createRunManifestFromRun(run, { role: "exploratory", createdAt, importedAt: createdAt });
  return run;
}
