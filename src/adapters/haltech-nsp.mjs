/**
 * Perfil experimental para exportaciones CSV Haltech NSP.
 *
 * Admite dos layouts observados en exportaciones públicas/comunitarias:
 * - encabezado tipado en una única fila;
 * - bloques Channel / ID / Type / DisplayMaxMin.
 *
 * No es un parser certificado por Haltech. Las reglas de semántica y escala
 * deben contrastarse con el software NSP y el archivo original.
 */
import {
  CSV_IMPORT_SCHEMA,
  MAX_CSV_CHARACTERS,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../csv-import.mjs";

export const HALTECH_NSP_ADAPTER_ID = "haltech-nsp-community-spec/1";
export const HALTECH_NSP_METADATA_ADAPTER_ID = "haltech-nsp-channel-metadata/1";
const MISSING = new Set(["", "na", "n/a", "null", "nan", "—", "--", "-"]);
const HALTECH_MISSING_SENTINEL_FLOOR = -2_000_000_000;

function fail(code, message, details = {}) {
  throw new CsvImportError(code, message, details);
}

function firstNonEmptyLine(lines) {
  return lines.findIndex(line => line.trim() !== "");
}

export function detectHaltechNspCsv(text) {
  if (typeof text !== "string") return false;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = firstNonEmptyLine(lines);
  return first >= 0 && lines[first].trim() === "%DataLog%";
}

function parseDescriptor(header, index) {
  const match = /^(.+?)\(([^():]+):([^()]+)\)$/.exec(String(header).trim());
  if (!match) fail("HALTECH_CHANNEL_HEADER_INVALID",
    "El encabezado Haltech no coincide con Canal(Tipo:Unidad).", { column: index + 1, header });
  return { name: match[1].trim(), type: match[2].trim(), unit: match[3].trim(), index };
}

function parseTimestamp(value, rowNumber) {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?$/.exec(text);
  if (!match) fail("HALTECH_TIMESTAMP_INVALID",
    "La marca de tiempo debe seguir HH:MM:SS.mmm.", { row: rowNumber, value: text.slice(0, 80) });
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number("0." + match[4]) : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function parseRawNumber(value, rowNumber, descriptor) {
  const text = String(value ?? "").trim();
  if (MISSING.has(text.toLocaleLowerCase("en-US"))) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    fail("HALTECH_NUMERIC_VALUE_INVALID",
      "Un valor Haltech no respeta el formato numérico decimal con punto.",
      { row: rowNumber, channel: descriptor.name, value: text.slice(0, 60) });
  }
  const number = Number(text);
  if (!Number.isFinite(number)) fail("HALTECH_NUMERIC_VALUE_INVALID",
    "Un valor Haltech no es finito.", { row: rowNumber, channel: descriptor.name });
  // The public example export contains the NSP no-reading int32 sentinel family.
  if (number <= HALTECH_MISSING_SENTINEL_FLOOR) return null;
  return number;
}

function normalizeToken(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US")
    .replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function unitIs(unit, ...accepted) {
  const normalized = normalizeToken(unit).replace(/°/g, "").replace(/\s/g, "");
  return accepted.some(item => normalized === normalizeToken(item).replace(/°/g, "").replace(/\s/g, ""));
}

function resolveTypedChannel(descriptor) {
  const name = normalizeToken(descriptor.name);
  const type = descriptor.type;
  const unit = descriptor.unit;
  const exact = (...names) => names.includes(name);
  const common = {
    EngineSpeed: { valid: () => unitIs(unit, "rpm"), outputUnit: "RPM", convert: value => value },
    AbsPressure: { valid: () => unitIs(unit, "kPa"), outputUnit: "kPa", convert: value => value / 10 },
    Pressure: { valid: () => unitIs(unit, "kPa"), outputUnit: "kPa", convert: value => value / 10 - 101.3 },
    Percentage: { valid: () => unitIs(unit, "%", "percent"), outputUnit: "%", convert: value => value / 10 },
    Angle: { valid: () => unitIs(unit, "deg", "degrees", "°"), outputUnit: "deg", convert: value => value / 10 },
    Temperature: { valid: () => unitIs(unit, "C", "°C", "celsius"), outputUnit: "°C", convert: value => value / 10 - 273.15 },
    BatteryVoltage: { valid: () => unitIs(unit, "V", "volt", "volts"), outputUnit: "V", convert: value => value / 1000 },
    Speed: { valid: () => unitIs(unit, "km/h", "kph"), outputUnit: "km/h", convert: value => value / 10 },
    AFR: { valid: () => unitIs(unit, "AFR"), outputUnit: "AFR", convert: value => value / 1000 },
    Raw: { valid: () => unit.trim().length > 0, outputUnit: unit, convert: value => value },
  };
  const definition = common[type];
  if (!definition) return null;
  if (!definition.valid()) {
    fail("HALTECH_CHANNEL_UNIT_UNSUPPORTED",
      "La unidad no coincide con la unidad esperada para el tipo de canal Haltech.",
      { channel: descriptor.name, type, unit });
  }

  let key = null;
  if (type === "EngineSpeed" && exact("rpm", "engine speed", "engine rpm")) key = "rpm";
  else if (type === "AbsPressure" && exact("map", "manifold pressure", "manifold absolute pressure")) key = "map_abs_kpa";
  else if (type === "Pressure" && exact("boost target", "target boost", "boost control target pressure corrected")) key = "boost_target";
  else if (type === "Pressure" && exact("boost", "boost pressure", "boost control actual pressure")) key = "boost_actual";
  else if (type === "Pressure" && exact("fuel pressure")) key = "fuel_pressure_kpa";
  else if (type === "Percentage" && exact("throttle", "throttle position", "tps")) key = "throttle_pct";
  else if (type === "Temperature" && exact("intake air", "intake air temperature", "iat")) key = "iat_c";
  else if (type === "Temperature" && exact("coolant", "coolant temperature", "coolant temp")) key = "coolant_temp_c";
  else if (type === "Angle" && exact("ignition", "ignition advance", "ignition timing", "spark advance")) key = "ignition_advance_deg";
  else if (type === "BatteryVoltage" && exact("battery", "battery voltage")) key = "battery_v";
  else if (type === "Speed" && exact("vehicle speed", "road speed")) key = "speed_kmh";
  else if (type === "Raw" && exact("torque", "engine torque") && unitIs(unit, "Nm", "N.m")) key = "torque_nm";
  else if (type === "Raw" && exact("power", "engine power") && unitIs(unit, "kW")) key = "power_kw";

  return key ? { key, unit: definition.outputUnit, convert: definition.convert } : null;
}

/**
 * El layout Channel/ID/Type no tiene unidades impresas por canal. Se aceptan
 * únicamente nombres completos conocidos junto con su tipo; no se usa una
 * coincidencia parcial (por ejemplo, "Manifold Pressure Derivative" no es MAP).
 */
function resolveMetadataChannel(descriptor) {
  const name = normalizeToken(descriptor.name);
  const type = descriptor.type;
  const exact = (...names) => names.includes(name);
  const rule = (key, unit, convert) => ({ key, unit, convert });

  if (type === "EngineSpeed" && exact("rpm", "engine speed", "engine rpm")) {
    return rule("rpm", "RPM", value => value);
  }
  if (type === "AbsPressure" && exact("map", "manifold absolute pressure")) {
    return rule("map_abs_kpa", "kPa", value => value / 10);
  }
  if (type === "Pressure") {
    if (exact("boost control actual pressure", "boost pressure")) {
      return rule("boost_actual", "kPa", value => value / 10 - 101.3);
    }
    if (exact("boost control target pressure (corrected)", "boost control target pressure corrected", "boost target", "target boost")) {
      return rule("boost_target", "kPa", value => value / 10 - 101.3);
    }
    if (exact("fuel pressure")) {
      return rule("fuel_pressure_kpa", "kPa", value => value / 10 - 101.3);
    }
  }
  if (type === "Percentage" && exact("throttle position", "throttle", "tps")) {
    return rule("throttle_pct", "%", value => value / 10);
  }
  if (type === "Temperature" && exact("intake air temperature", "iat")) {
    return rule("iat_c", "°C", value => value / 10 - 273.15);
  }
  if (type === "Temperature" && exact("coolant temperature", "coolant temp")) {
    return rule("coolant_temp_c", "°C", value => value / 10 - 273.15);
  }
  if (type === "Angle" && exact("ignition advance", "ignition timing", "spark advance")) {
    return rule("ignition_advance_deg", "deg", value => value / 10);
  }
  if (type === "BatteryVoltage" && exact("battery voltage", "battery")) {
    return rule("battery_v", "V", value => value / 1000);
  }
  if (type === "Speed" && exact("vehicle speed", "road speed")) {
    return rule("speed_kmh", "km/h", value => value / 10);
  }
  // Only the measured overall wideband channel is mapped. Target Lambda and
  // individual AFR/bank channels stay excluded until their role is explicit.
  if (type === "AFR" && exact("wideband o2 overall")) {
    return rule("lambda", "lambda", value => value / 1000);
  }
  return null;
}

function getHaltechPayload(text) {
  if (typeof text !== "string") fail("HALTECH_INPUT_NOT_TEXT", "El contenido Haltech debe recibirse como texto UTF-8.");
  if (text.length > MAX_CSV_CHARACTERS) fail("CSV_TOO_LARGE", "El archivo supera el tamaño de texto permitido.");
  if (!detectHaltechNspCsv(text)) {
    fail("HALTECH_SIGNATURE_NOT_FOUND", "No se encontró el marcador %DataLog% de la estructura Haltech NSP admitida.");
  }

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const markerLine = firstNonEmptyLine(lines);
  const body = lines.slice(markerLine + 1).map(line => line.trim().toLocaleLowerCase("en-US"));
  const usesChannelTable = body.some(line => line === "channel,id,type,displaymaxmin");
  if (usesChannelTable) {
    fail(
      "HALTECH_LAYOUT_UNSUPPORTED",
      "El archivo usa una tabla de canales Channel,ID,Type,DisplayMaxMin. Este perfil todavía no interpreta esa variante.",
      { detectedLayout: "channel-table" },
    );
  }
  const usesChannelMetadata = body.some(line => /^channel\s*:/.test(line));
  if (usesChannelMetadata) return { layout: "channel-metadata", lines, markerLine };

  let headerLine = -1;
  for (let index = markerLine + 1; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      headerLine = index;
      break;
    }
  }
  if (headerLine < 0) fail("HALTECH_HEADER_MISSING", "No se encontró el encabezado de canales después de %DataLog%.");
  return { layout: "typed-single-header-row", payload: lines.slice(headerLine).join("\n"), sourceHeaderRow: headerLine + 1 };
}

function parseMetadataLayout(lines, markerLine) {
  const metadata = {};
  const descriptors = [];
  let current = null;
  let firstDataIndex = -1;
  let skippedEmptyRows = 0;

  const pushCurrent = () => {
    if (current) descriptors.push(current);
    current = null;
  };

  for (let index = markerLine + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      skippedEmptyRows += 1;
      continue;
    }
    if (/^\d{1,2}:[0-5]\d:[0-5]\d(?:\.\d+)?(?:,|$)/.test(line)) {
      pushCurrent();
      firstDataIndex = index;
      break;
    }

    const channelMatch = /^Channel\s*:\s*(.*)$/i.exec(line);
    if (channelMatch) {
      pushCurrent();
      const name = channelMatch[1].trim();
      if (!name) fail("HALTECH_CHANNEL_METADATA_INVALID", "Se encontró un bloque Channel sin nombre.", { row: index + 1 });
      current = { name, sourceHeaderRow: index + 1 };
      continue;
    }

    const fieldMatch = /^([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (!fieldMatch) {
      fail("HALTECH_METADATA_LINE_INVALID",
        "La cabecera Haltech contiene una línea que no es metadato ni definición de canal.",
        { row: index + 1, value: line.slice(0, 100) });
    }

    const key = fieldMatch[1].trim();
    const value = fieldMatch[2].trim();
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (current && normalizedKey === "id") {
      current.id = value;
    } else if (current && normalizedKey === "type") {
      current.type = value;
    } else if (current && normalizedKey === "displaymaxmin") {
      const values = value.split(",");
      current.displayMax = values.length > 0 && Number.isFinite(Number(values[0])) ? Number(values[0]) : null;
      current.displayMin = values.length > 1 && Number.isFinite(Number(values[1])) ? Number(values[1]) : null;
    } else {
      // File-level fields such as Log Source / Log Number follow channel blocks
      // in actual exports. Flush a pending block before retaining those fields.
      pushCurrent();
      metadata[key] = value;
    }
  }
  pushCurrent();

  if (firstDataIndex < 0) fail("HALTECH_DATA_ROWS_MISSING", "No se encontraron filas de datos con marca de tiempo después de los metadatos.");
  for (const descriptor of descriptors) {
    if (!descriptor.id || !descriptor.type) {
      fail("HALTECH_CHANNEL_METADATA_INCOMPLETE",
        "Cada bloque Channel necesita ID y Type para mantener la alineación de columnas.",
        { channel: descriptor.name, row: descriptor.sourceHeaderRow },
      );
    }
  }
  if (descriptors.length < 2) fail("HALTECH_TOO_FEW_CHANNELS", "El registro Haltech necesita al menos dos definiciones de canal.");

  const dataRows = [];
  for (let index = firstDataIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      skippedEmptyRows += 1;
      continue;
    }
    if (!/^\d{1,2}:[0-5]\d:[0-5]\d(?:\.\d+)?(?:,|$)/.test(line)) {
      fail("HALTECH_DATA_ROW_INVALID", "Se encontró contenido inesperado después del inicio de los datos.", {
        row: index + 1, value: line.slice(0, 100),
      });
    }
    const values = line.split(",");
    if (values.length !== descriptors.length + 1) {
      fail("HALTECH_ROW_COLUMN_COUNT_MISMATCH",
        "La fila de datos no tiene una columna de tiempo más una columna por cada bloque Channel.",
        { row: index + 1, expected: descriptors.length + 1, actual: values.length },
      );
    }
    const time = parseTimestamp(values[0], index + 1);
    const channels = descriptors.map((descriptor, channelIndex) => ({
      descriptor,
      value: parseRawNumber(values[channelIndex + 1], index + 1, descriptor),
    }));
    dataRows.push({ time, channels });
  }
  if (dataRows.length < 2) fail("CSV_NOT_ENOUGH_SAMPLES", "Se necesitan al menos dos filas de datos para crear un registro.");

  return {
    metadata,
    descriptors,
    dataRows,
    firstDataIndex,
    skippedEmptyRows,
  };
}

function unsupportedSummary(unsupported) {
  const preview = unsupported.slice(0, 8).map(item => item.name + " (" + item.type + ")");
  const remainder = unsupported.length - preview.length;
  return preview.join(", ") + (remainder > 0 ? " y " + remainder + " canal(es) más" : "");
}

function importMetadataLayout(payload, { id, name, importedAt }) {
  const parsedLayout = parseMetadataLayout(payload.lines, payload.markerLine);
  const { descriptors, dataRows, metadata, firstDataIndex, skippedEmptyRows } = parsedLayout;
  const supported = [];
  const unsupported = [];
  const keys = new Set(["time_s"]);

  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const mapping = resolveMetadataChannel(descriptor);
    if (!mapping) {
      unsupported.push({
        name: descriptor.name,
        id: descriptor.id,
        type: descriptor.type,
      });
      continue;
    }
    if (keys.has(mapping.key)) {
      fail("HALTECH_DUPLICATE_CANONICAL_CHANNEL",
        "Dos bloques Channel intentan alimentar el mismo canal normalizado.",
        { channel: mapping.key, source: descriptor.name, id: descriptor.id },
      );
    }
    keys.add(mapping.key);
    supported.push({ descriptor, index, ...mapping });
  }
  if (!supported.some(item => item.key === "rpm")) {
    fail("HALTECH_RPM_CHANNEL_REQUIRED", "No se reconoció un bloque RPM de tipo EngineSpeed.");
  }

  const firstTime = dataRows[0].time;
  const normalizedHeaders = ["Elapsed time [s]", ...supported.map(item => item.key)];
  const normalizedRows = dataRows.map(row => {
    const values = [String(row.time - firstTime)];
    for (const item of supported) {
      const raw = row.channels[item.index].value;
      const normalized = raw === null ? null : item.convert(raw);
      if (normalized !== null && !Number.isFinite(normalized)) {
        fail("HALTECH_CHANNEL_CONVERSION_NON_FINITE",
          "La conversión de un canal Haltech produjo un valor no finito.",
          { channel: item.descriptor.name, id: item.descriptor.id },
        );
      }
      values.push(normalized === null ? "" : String(normalized));
    }
    return values;
  });

  const sourceHeaderRows = Array.from(
    { length: firstDataIndex - payload.markerLine },
    (_, index) => payload.markerLine + index + 1,
  );
  const normalized = {
    schema: CSV_IMPORT_SCHEMA,
    delimiter: ",",
    headers: normalizedHeaders,
    rows: normalizedRows,
    sourceRowCount: payload.lines.length,
    skippedEmptyRows,
    warnings: [],
  };
  const channelMapping = { time_s: "Elapsed time [s]" };
  const units = {};
  for (const item of supported) {
    channelMapping[item.key] = item.key;
    units[item.key] = item.unit;
  }

  const warnings = [];
  if (unsupported.length) {
    warnings.push(unsupported.length + " canal(es) de la exportación NSP no se normalizaron porque no tienen una regla semántica explícita: " +
      unsupportedSummary(unsupported) + ".");
  }
  if (supported.some(item => item.descriptor.type === "Pressure")) {
    warnings.push("Los canales Pressure normalizados usan una referencia fija de 101,3 kPa para expresarse como presión relativa; no se sustituye por una medición barométrica del archivo.");
  }
  if (supported.some(item => item.key === "lambda")) {
    warnings.push("Wideband O2 Overall (tipo AFR) se normalizó a lambda solo para este nombre exacto y este layout, consistente con la exportación pública revisada; Target Lambda y otros canales AFR permanecen excluidos.");
  } else if (descriptors.some(item => item.type === "AFR")) {
    warnings.push("Los bloques Type AFR no se normalizaron: no se infiere que una consigna o un canal individual sea lambda medida.");
  }
  warnings.push("Variante NSP Channel/ID/Type experimental: la asignación se limita a nombres y tipos exactos observados; verificá las señales contra el archivo y NSP originales.");

  const run = mapCsvToRun(normalized, {
    id: id ?? "haltech-nsp-metadata-import",
    name,
    sourceDomain: "ecu",
    channelMapping,
    units,
    decimalSeparator: ".",
    importedAt,
    parserId: HALTECH_NSP_METADATA_ADAPTER_ID,
    importFormat: "haltech-nsp-metadata-csv/1",
    sourceHeaderRow: firstDataIndex,
    sourceHeaderRows,
    adapterMetadata: {
      marker: "%DataLog%",
      layout: "channel-metadata-blocks",
      sourceSpecification: "UltraLog · community parser and public NSP export example; not manufacturer-certified",
      timestampFormat: "HH:MM:SS.mmm",
      sourceMetadata: metadata,
      channelDescriptors: descriptors.map(({ name: channelName, id: channelId, type, displayMax, displayMin }) => ({
        name: channelName, id: channelId, type, displayMax, displayMin,
      })),
      supportedChannels: supported.map(item => ({
        key: item.key,
        name: item.descriptor.name,
        id: item.descriptor.id,
        type: item.descriptor.type,
      })),
      unsupportedChannels: unsupported,
      conversionPolicy: "community-channel-type-v1",
      missingSentinelPolicy: "numeric values <= -2000000000 are retained as missing",
      ...(supported.some(item => item.descriptor.type === "Pressure")
        ? { assumedAtmosphericPressureKpa: 101.3 } : {}),
      ...(supported.some(item => item.key === "lambda")
        ? { semanticOverrides: [{ name: "Wideband O2 Overall", sourceType: "AFR", canonicalKey: "lambda", reason: "exact-name mapping reviewed against public export values" }] }
        : {}),
    },
  });
  run.warnings.push(...warnings);
  run.note = "Haltech NSP CSV con bloques Channel/ID/Type inspeccionado localmente; las reglas son experimentales y requieren contrastarse con NSP.";
  return run;
}

function importTypedLayout(payload, { id, name, importedAt }) {
  const parsed = parseCsvText(payload.payload, { delimiter: "," });
  const descriptors = parsed.headers.map(parseDescriptor);
  if (descriptors.length < 2) fail("HALTECH_TOO_FEW_CHANNELS", "El registro Haltech necesita tiempo y al menos un canal de señal.");

  const time = descriptors[0];
  if (normalizeToken(time.name) !== "time" || time.type !== "Time_ms" || !unitIs(time.unit, "ms")) {
    fail("HALTECH_TIME_COLUMN_UNSUPPORTED",
      "La primera columna debe ser Time(Time_ms:ms) en esta variante del perfil.");
  }

  const supported = [];
  const unsupported = [];
  const keys = new Set(["time_s"]);
  for (const descriptor of descriptors.slice(1)) {
    const mapping = resolveTypedChannel(descriptor);
    if (!mapping) {
      unsupported.push({ name: descriptor.name, type: descriptor.type, unit: descriptor.unit });
      continue;
    }
    if (keys.has(mapping.key)) {
      fail("HALTECH_DUPLICATE_CANONICAL_CHANNEL",
        "Dos columnas Haltech intentan alimentar el mismo canal normalizado.",
        { channel: mapping.key, source: descriptor.name },
      );
    }
    keys.add(mapping.key);
    supported.push({ descriptor, ...mapping });
  }
  if (!supported.some(item => item.key === "rpm")) {
    fail("HALTECH_RPM_CHANNEL_REQUIRED", "No se reconoció un canal RPM de tipo EngineSpeed con unidad RPM.");
  }

  const rawTimes = parsed.rows.map((row, index) => parseTimestamp(row[0], index + payload.sourceHeaderRow + 1));
  const firstTime = rawTimes[0];
  const normalizedHeaders = ["Elapsed time [s]", ...supported.map(item => item.key)];
  const normalizedRows = parsed.rows.map((row, rowIndex) => {
    const values = [String(rawTimes[rowIndex] - firstTime)];
    for (const item of supported) {
      const raw = parseRawNumber(row[item.descriptor.index], rowIndex + payload.sourceHeaderRow + 1, item.descriptor);
      values.push(raw === null ? "" : String(item.convert(raw)));
    }
    return values;
  });
  const normalized = {
    schema: CSV_IMPORT_SCHEMA,
    delimiter: ",",
    headers: normalizedHeaders,
    rows: normalizedRows,
    sourceRowCount: parsed.sourceRowCount + payload.sourceHeaderRow - 1,
    skippedEmptyRows: parsed.skippedEmptyRows,
    warnings: [...parsed.warnings],
  };
  const channelMapping = { time_s: "Elapsed time [s]" };
  const units = {};
  for (const item of supported) {
    channelMapping[item.key] = item.key;
    units[item.key] = item.unit;
  }
  const warnings = [];
  if (unsupported.length) {
    warnings.push(unsupported.length + " canal(es) del archivo NSP no se normalizaron porque el perfil no implementa su semántica o conversión: " +
      unsupportedSummary(unsupported) + ".");
  }
  if (descriptors.some(item => item.type === "AFR")) {
    warnings.push("El tipo AFR del encabezado tipado se dejó fuera del registro canónico; no se infiere si representa AFR o lambda.");
  }
  if (supported.some(item => item.descriptor.type === "Pressure")) {
    warnings.push("Los canales de tipo Pressure se convierten a presión relativa restando una referencia fija de 101,3 kPa; no se sustituye por una medición barométrica registrada en el archivo.");
  }
  warnings.push("Perfil Haltech NSP experimental: las conversiones tipadas siguen una especificación comunitaria de interoperabilidad, no una certificación del fabricante. Confirmá los valores con NSP antes de utilizarlos.");

  const run = mapCsvToRun(normalized, {
    id: id ?? "haltech-nsp-import",
    name,
    sourceDomain: "ecu",
    channelMapping,
    units,
    decimalSeparator: ".",
    importedAt,
    parserId: HALTECH_NSP_ADAPTER_ID,
    importFormat: "haltech-nsp-csv/1",
    sourceHeaderRow: payload.sourceHeaderRow,
    adapterMetadata: {
      marker: "%DataLog%",
      layout: "typed-single-header-row",
      sourceSpecification: "UltraLog FORMAT_SPECIFICATIONS.md · community reverse-engineering · document 1.0",
      timestampFormat: "HH:MM:SS.mmm",
      ...(supported.some(item => item.descriptor.type === "Pressure") ? { assumedAtmosphericPressureKpa: 101.3 } : {}),
      channelDescriptors: descriptors.map(({ name: channelName, type, unit }) => ({
        name: channelName, type, unit,
      })),
      supportedChannels: supported.map(item => item.key),
      unsupportedChannels: unsupported,
      conversionPolicy: "community-format-spec-v1",
      ambiguousTypesExcluded: ["AFR"],
    },
  });
  run.warnings.push(...warnings);
  run.note = "Haltech NSP CSV con encabezados tipados; requiere validación con la exportación original.";
  return run;
}

/**
 * Convierte solo tipos y canales con semántica explícita. Las señales sin una
 * regla exacta quedan enumeradas como no soportadas.
 */
export function importHaltechNspCsv(text, options = {}) {
  const payload = getHaltechPayload(text);
  const normalizedOptions = {
    id: options.id,
    name: options.name,
    importedAt: options.importedAt ?? new Date().toISOString(),
  };
  return payload.layout === "channel-metadata"
    ? importMetadataLayout(payload, normalizedOptions)
    : importTypedLayout(payload, normalizedOptions);
}
