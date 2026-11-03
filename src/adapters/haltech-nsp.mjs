/**
 * Perfil experimental para CSV Haltech NSP con marcador %DataLog%.
 * Se basa en una especificación comunitaria de interoperabilidad, no en
 * una certificación del fabricante. Revisar docs/CSV_IMPORT.md.
 */
import {
  CSV_IMPORT_SCHEMA,
  MAX_CSV_CHARACTERS,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../csv-import.mjs";

export const HALTECH_NSP_ADAPTER_ID = "haltech-nsp-community-spec/1";
const MISSING = new Set(["", "na", "n/a", "null", "nan", "—", "--", "-"]);

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

function resolveChannel(descriptor) {
  const name = normalizeToken(descriptor.name);
  const type = descriptor.type;
  const unit = descriptor.unit;
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
  if (type === "EngineSpeed" && /^(rpm|engine speed|engine rpm)$/.test(name)) key = "rpm";
  else if (type === "AbsPressure" && /(map|manifold pressure)/.test(name)) key = "map_abs_kpa";
  else if (type === "Pressure" && /(boost target|target boost)/.test(name)) key = "boost_target";
  else if (type === "Pressure" && /boost/.test(name)) key = "boost_actual";
  else if (type === "Pressure" && /fuel pressure/.test(name)) key = "fuel_pressure_kpa";
  else if (type === "Percentage" && /(throttle|tps)/.test(name)) key = "throttle_pct";
  else if (type === "Temperature" && /(intake air|iat)/.test(name)) key = "iat_c";
  else if (type === "Temperature" && /coolant/.test(name)) key = "coolant_temp_c";
  else if (type === "Angle" && /(ignition|timing|spark)/.test(name)) key = "ignition_advance_deg";
  else if (type === "BatteryVoltage" && /(battery|batt)/.test(name)) key = "battery_v";
  else if (type === "Speed" && /(vehicle speed|road speed)/.test(name)) key = "speed_kmh";
  // AFR is intentionally not mapped: community sources disagree on whether the exported type carries AFR or lambda.
  else if (type === "Raw" && /torque/.test(name) && unitIs(unit, "Nm", "N.m")) key = "torque_nm";
  else if (type === "Raw" && /power/.test(name) && unitIs(unit, "kW")) key = "power_kw";

  return key ? { key, unit: definition.outputUnit, convert: definition.convert } : null;
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
  const usesChannelList = body.some(line => line.startsWith("channel :"));
  const usesChannelTable = body.some(line => line === "channel,id,type,displaymaxmin");
  if (usesChannelList || usesChannelTable) {
    fail(
      "HALTECH_LAYOUT_UNSUPPORTED",
      "El archivo usa una variante Haltech NSP con bloque de metadatos y definiciones de canales (Channel/ID/Type). Este perfil solo admite encabezados tipados en una única fila CSV; no se reinterpretó el archivo.",
      { detectedLayout: usesChannelList ? "channel-list" : "channel-table" },
    );
  }
  let headerLine = -1;
  for (let index = markerLine + 1; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      headerLine = index;
      break;
    }
  }
  if (headerLine < 0) fail("HALTECH_HEADER_MISSING", "No se encontró el encabezado de canales después de %DataLog%.");
  return { payload: lines.slice(headerLine).join("\n"), sourceHeaderRow: headerLine + 1 };
}

/**
 * Convierte solo los tipos y nombres con semántica implementada. Los canales
 * desconocidos se enumeran en el manifiesto y se excluyen de la serie canónica.
 */
export function importHaltechNspCsv(text, { id, name, importedAt = new Date().toISOString() } = {}) {
  const { payload, sourceHeaderRow } = getHaltechPayload(text);
  const parsed = parseCsvText(payload, { delimiter: "," });
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
    const mapping = resolveChannel(descriptor);
    if (!mapping) {
      unsupported.push({ name: descriptor.name, type: descriptor.type, unit: descriptor.unit });
      continue;
    }
    if (keys.has(mapping.key)) {
      fail("HALTECH_DUPLICATE_CANONICAL_CHANNEL",
        "Dos columnas Haltech intentan alimentar el mismo canal normalizado.",
        { channel: mapping.key, source: descriptor.name });
    }
    keys.add(mapping.key);
    supported.push({ descriptor, ...mapping });
  }
  if (!supported.some(item => item.key === "rpm")) {
    fail("HALTECH_RPM_CHANNEL_REQUIRED", "No se reconoció un canal RPM de tipo EngineSpeed con unidad RPM.");
  }

  const rawTimes = parsed.rows.map((row, index) => parseTimestamp(row[0], index + sourceHeaderRow + 1));
  const firstTime = rawTimes[0];
  const normalizedHeaders = ["Elapsed time [s]", ...supported.map(item => item.key)];
  const normalizedRows = parsed.rows.map((row, rowIndex) => {
    const values = [String(rawTimes[rowIndex] - firstTime)];
    for (const item of supported) {
      const raw = parseRawNumber(row[item.descriptor.index], rowIndex + sourceHeaderRow + 1, item.descriptor);
      values.push(raw === null ? "" : String(item.convert(raw)));
    }
    return values;
  });
  const normalized = {
    schema: CSV_IMPORT_SCHEMA,
    delimiter: ",",
    headers: normalizedHeaders,
    rows: normalizedRows,
    sourceRowCount: parsed.sourceRowCount + sourceHeaderRow - 1,
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
      unsupported.map(item => item.name + " (" + item.type + ": " + item.unit + ")").join(", ") + ".");
  }
  if (descriptors.some(item => item.type === "AFR")) {
    warnings.push("El tipo AFR se dejó fuera del registro canónico: las referencias comunitarias consultadas difieren sobre si sus valores representan AFR o lambda. Se necesita contrastarlo con una exportación NSP real.");
  }
  if (supported.some(item => item.descriptor.type === "Pressure")) {
    warnings.push("Los canales de tipo Pressure se convierten a presión relativa restando una referencia fija de 101,3 kPa, según la especificación comunitaria; no se sustituye por una medición barométrica registrada en el archivo.");
  }
  warnings.push(
    "Perfil Haltech NSP experimental: las conversiones tipadas siguen una especificación comunitaria de interoperabilidad, no una certificación del fabricante. Confirmá los valores con NSP antes de utilizarlos.",
  );

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
    sourceHeaderRow,
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
  run.note = "Haltech NSP CSV reconocido por su marcador y encabezados tipados; requiere validación con la exportación original.";
  return run;
}
