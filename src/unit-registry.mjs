/**
 * Registro explícito de unidades para importación.
 *
 * Los símbolos se comparan respetando mayúsculas/minúsculas. Solo los nombres
 * completos y las variantes documentadas se comparan sin distinguir caso.
 * No se eliminan prefijos ni se aplica lower-case global a los símbolos.
 */
export const UNIT_REGISTRY_VERSION = "datalog-units/2";

const entries = [];
function register(dimension, canonicalUnit, factor, offset, symbols = [], words = []) {
  for (const value of symbols) {
    entries.push({ value, dimension, canonicalUnit, factor, offset, matching: "exact" });
  }
  for (const value of words) {
    entries.push({ value, dimension, canonicalUnit, factor, offset, matching: "folded" });
  }
}

// Tiempo: los valores se normalizan a segundos.
register("time", "s", 1, 0, ["s", "sec", "secs"], ["second", "seconds", "segs"]);
register("time", "s", 0.001, 0, ["ms", "msec"], ["millisecond", "milliseconds"]);
register("time", "s", 0.000001, 0, ["us", "µs", "μs"], ["microsecond", "microseconds"]);
register("time", "s", 60, 0, ["min"], ["minute", "minutes"]);
register("time", "s", 3600, 0, ["h", "hr"], ["hour", "hours"]);

// Velocidad de rotación: el canon interno es RPM.
register("rotational_speed", "RPM", 1, 0,
  ["rpm", "RPM", "Rpm", "rev/min", "r/min", "1/min"],
  ["revolutions per minute", "revolution per minute", "revs per minute", "rev per min"]);

// Distancia lineal: kilómetros.
register("distance", "km", 1, 0, ["km", "KM", "Km"], ["kilometer", "kilometers", "kilometre", "kilometres"]);
register("distance", "km", 1e-12, 0, ["nm"], ["nanometer", "nanometers", "nanometre", "nanometres"]);
register("distance", "km", 0.001, 0, ["m"], ["meter", "meters", "metre", "metres"]);
register("distance", "km", 1.609344, 0, ["mi", "mile", "miles"], ["miles"]);

// Velocidad lineal: km/h. Se aceptan variantes habituales, no cualquier cambio de caso.
register("speed", "km/h", 1, 0, ["km/h", "KM/H", "Km/h", "kmh", "KMH", "Kmh", "kmph", "KMPH", "kph", "KPH", "Kph"],
  ["kilometers per hour", "kilometres per hour"]);
register("speed", "km/h", 1.609344, 0, ["mph", "MPH", "Mph"], ["miles per hour"]);
register("speed", "km/h", 3.6, 0, ["m/s", "M/S", "mps"], ["meters per second", "metres per second"]);

// Torque: newton-metro o libra-pie.
register("torque", "Nm", 1, 0, ["Nm", "N·m", "N.m", "N m"], ["newtonmeter", "newtonmeters", "newtonmetre", "newtonmetres", "newton meter", "newton meters", "newton metre", "newton metres"]);
register("torque", "Nm", 1.3558179483314004, 0, ["ft-lb", "ftlb", "lbft", "lbfft", "ft·lb", "ft lb", "lb-ft", "lb·ft", "lb ft", "lbf-ft", "lbf ft"],
  ["foot pound", "foot pounds", "pound foot", "pound feet"]);

// Potencia: kW. mW y MW se mantienen deliberadamente distintos.
register("power", "kW", 1, 0, ["kW", "kw", "KW", "Kw"], ["kilowatt", "kilowatts"]);
register("power", "kW", 0.001, 0, ["W"], ["watt", "watts"]);
register("power", "kW", 0.000001, 0, ["mW"], ["milliwatt", "milliwatts"]);
register("power", "kW", 1000, 0, ["MW"], ["megawatt", "megawatts"]);
register("power", "kW", 0.7456998715822702, 0, ["hp", "HP", "Hp", "bhp", "BHP"], ["horsepower", "brake horsepower"]);
register("power", "kW", 0.73549875, 0, ["PS", "ps", "CV", "cv"], ["metric horsepower", "cheval vapeur"]);

// Presión: kPa. Pa y pA son símbolos diferentes.
register("pressure", "kPa", 1, 0, ["kPa", "kpa", "KPa", "KPA"], ["kilopascal", "kilopascals"]);
register("pressure", "kPa", 0.001, 0, ["Pa"], ["pascal", "pascals"]);
register("pressure", "kPa", 100, 0, ["bar", "BAR"], ["bars"]);
register("pressure", "kPa", 0.1, 0, ["mbar", "MBAR"], ["millibar", "millibars"]);
register("pressure", "kPa", 6.894757293168, 0, ["psi", "PSI", "Psi"], ["pounds per square inch"]);

// Se conserva una dimensión eléctrica para detectar, no aceptar, pA en canales de presión.
register("electric_current", "A", 1e-12, 0, ["pA"], ["picoampere", "picoamperes"]);

// Temperatura: grados Celsius. El nombre completo acepta variantes de mayúsculas.
register("temperature", "°C", 1, 0, ["°C", "℃", "Cel", "degC", "C"], ["celsius", "degree celsius", "degrees celsius"]);
register("temperature", "°C", 5 / 9, -32 * 5 / 9, ["°F", "℉", "degF", "F"], ["fahrenheit", "degree fahrenheit", "degrees fahrenheit"]);
register("temperature", "°C", 1, -273.15, ["K"], ["kelvin"]);

// Tensión: voltios. mV y MV no son intercambiables.
register("voltage", "V", 1, 0, ["V"], ["volt", "volts"]);
register("voltage", "V", 0.001, 0, ["mV"], ["millivolt", "millivolts"]);
register("voltage", "V", 1e6, 0, ["MV"], ["megavolt", "megavolts"]);

// Porcentaje, ángulo y magnitudes de mezcla.
register("ratio", "%", 1, 0, ["%"], ["percent", "percentage", "pct"]);
register("angle", "deg", 1, 0, ["deg", "°"], ["degree", "degrees"]);
register("angle", "deg", 180 / Math.PI, 0, ["rad"], ["radian", "radians"]);
register("lambda", "lambda", 1, 0, ["λ"], ["lambda"]);
register("afr", "AFR", 1, 0, ["AFR"], ["air fuel ratio", "air-fuel ratio"]);

const channelDimensions = Object.freeze({
  time_s: "time",
  rpm: "rotational_speed",
  distance_km: "distance",
  speed_kmh: "speed",
  torque_nm: "torque",
  power_kw: "power",
  boost_target: "pressure",
  boost_actual: "pressure",
  map_abs_kpa: "pressure",
  fuel_pressure_kpa: "pressure",
  iat_c: "temperature",
  coolant_temp_c: "temperature",
  battery_v: "voltage",
  throttle_pct: "ratio",
  ignition_advance_deg: "angle",
  lambda: "lambda",
  afr: "afr",
});

function normalizeUnitText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Devuelve la dimensión y conversión de una unidad exacta o conocida. */
export function resolveUnitToken(input) {
  const value = normalizeUnitText(input);
  if (!value) return { status: "missing", input: value };

  const exact = entries.filter(entry => entry.matching === "exact" && entry.value === value);
  const folded = entries.filter(entry => entry.matching === "folded" &&
    entry.value.toLocaleLowerCase("en-US") === value.toLocaleLowerCase("en-US"));
  const matches = exact.length ? exact : folded;

  if (matches.length === 0) return { status: "unknown", input: value };
  const distinct = new Map(matches.map(match => [
    [match.dimension, match.canonicalUnit, match.factor, match.offset].join("|"), match,
  ]));
  if (distinct.size > 1) {
    return {
      status: "ambiguous",
      input: value,
      candidates: [...distinct.values()].map(({ dimension, canonicalUnit }) => ({ dimension, canonicalUnit })),
    };
  }
  const match = [...distinct.values()][0];
  return {
    status: "matched",
    input: value,
    symbol: match.value,
    dimension: match.dimension,
    canonicalUnit: match.canonicalUnit,
    factor: match.factor,
    offset: match.offset,
  };
}

/** Comprueba que la unidad pertenece a la dimensión del canal y devuelve la conversión. */
export function resolveUnitForChannel(channelKey, sourceUnit) {
  const expectedDimension = channelDimensions[channelKey];
  if (!expectedDimension) return { status: "unsupported_channel", channelKey, sourceUnit };
  const resolved = resolveUnitToken(sourceUnit);
  if (resolved.status !== "matched") return { ...resolved, channelKey, expectedDimension };
  if (resolved.dimension !== expectedDimension) {
    return {
      status: "dimension_mismatch",
      channelKey,
      sourceUnit: resolved.input,
      expectedDimension,
      actualDimension: resolved.dimension,
      canonicalUnit: resolved.canonicalUnit,
    };
  }
  return {
    ...resolved,
    channelKey,
    sourceUnit: resolved.input,
    conversionApplied: resolved.factor !== 1 || resolved.offset !== 0,
  };
}

export function getKnownUnitSpellings() {
  return [...new Set(entries.map(entry => entry.value))].sort((a, b) => b.length - a.length);
}

export function getChannelDimension(channelKey) {
  return channelDimensions[channelKey] ?? null;
}

export function getChannelKeysForDimension(dimension) {
  return Object.entries(channelDimensions)
    .filter(([, channelDimension]) => channelDimension === dimension)
    .map(([key]) => key);
}
