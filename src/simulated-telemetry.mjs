/**
 * Deterministic, dependency-free telemetry generator for software QA.
 * Illustrative generic 2.0 L naturally aspirated I4 model, not a calibrated ECU.
 */
export const SIMULATOR_SCHEMA = "datalog-simulated-telemetry/1";
export const SIMULATOR_VERSION = "0.1.0";
export const TELEMETRY_COLUMNS = Object.freeze([
  "time_s", "RPM", "SPEED", "THROTTLE_POS", "ACCELERATOR_POS_D",
  "ENGINE_LOAD", "INTAKE_PRESSURE", "INTAKE_TEMP", "MAF",
  "SHORT_FUEL_TRIM_1", "LONG_FUEL_TRIM_1", "O2_B1S1", "COOLANT_TEMP",
  "ELM_VOLTAGE", "IGNITION_ADVANCE", "INJECTOR_PW_MS", "VE", "GEAR",
  "DFCO", "ENGINE_STATUS",
]);

const FAST = ["RPM", "SPEED", "THROTTLE_POS", "ACCELERATOR_POS_D", "ENGINE_LOAD",
  "INTAKE_PRESSURE", "MAF", "IGNITION_ADVANCE", "INJECTOR_PW_MS", "DFCO", "ENGINE_STATUS"];
const MEDIUM = ["SHORT_FUEL_TRIM_1", "LONG_FUEL_TRIM_1", "O2_B1S1"];
const SLOW = ["INTAKE_TEMP", "COOLANT_TEMP", "ELM_VOLTAGE"];
const GEAR_RATIO = [0, 3.55, 2.10, 1.45, 1.12, 0.90];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, n = 2) => Math.round(v * (10 ** n)) / (10 ** n);

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function phaseAt(time, duration) {
  const p = time / duration;
  if (p < 0.06) return { state: "cranking", rpm: 850, throttle: 3, gear: 0 };
  if (p < 0.24) return { state: "idle-warmup", rpm: 840, throttle: 2.6, gear: 0 };
  if (p < 0.40) {
    const q = (p - 0.24) / 0.16;
    return { state: "light-load", rpm: 1450 + q * 1250, throttle: 15 + 4 * Math.sin(q * Math.PI * 3), gear: 2 };
  }
  if (p < 0.63) {
    const q = (p - 0.40) / 0.23;
    return { state: "wide-open-pull", rpm: q < 0.53 ? 2450 + q / 0.53 * 3950 : 3550 + (q - 0.53) / 0.47 * 2850,
      throttle: 96, gear: q < 0.53 ? 2 : 3 };
  }
  if (p < 0.78) {
    const q = (p - 0.63) / 0.15;
    return { state: "cruise", rpm: 2850 + 100 * Math.sin(q * Math.PI * 4), throttle: 20 + 2.5 * Math.sin(q * Math.PI * 3), gear: 4 };
  }
  if (p < 0.90) {
    const q = (p - 0.78) / 0.12;
    return { state: "overrun", rpm: 2950 - q * 1950, throttle: 0.4, gear: 4 };
  }
  return { state: "idle", rpm: 830, throttle: 2.5, gear: 0 };
}

function sampleAt(time, duration, random) {
  const phase = phaseAt(time, duration);
  const rpm = clamp(phase.rpm + Math.sin(time * 7.1) * 6 + (random() - 0.5) * 12, 0, 6800);
  const throttle = clamp(phase.throttle + (random() - 0.5) * 0.22, 0, 100);
  const map = clamp(28 + throttle * 0.68 + rpm * 0.0012 + (random() - 0.5) * 0.7, 20, 99);
  const iat = 25 + map * 0.075 + 1.5 * Math.sin(time / 18);
  const coolant = 24 + 66 * (1 - Math.exp(-time / 78));
  const ve = clamp(78 + 8 * Math.sin((rpm - 3200) / 1700) - Math.max(0, 65 - map) * 0.08, 55, 96);
  const airDensity = (map * 1000) / (287.05 * (iat + 273.15));
  const maf = Math.max(0, airDensity * 0.002 * rpm / 120 * (ve / 100) * 1000);
  const dfco = phase.state === "overrun" && rpm > 1350 ? 1 : 0;
  const injector = dfco ? 0 : clamp(maf / (phase.state === "wide-open-pull" ? 12.6 : 14.7) / Math.max(1, rpm / 30), 0.2, 18);
  const oxygen = dfco ? 0.12 : (phase.state === "wide-open-pull" ? 0.82 : 0.45 + 0.34 * Math.sin(time * 3.4));
  const gear = phase.gear;
  const speed = gear ? rpm * 1.96 * 60 / (GEAR_RATIO[gear] * 4.1 * 1000) : 0;

  return {
    time_s: round(time, 3), RPM: round(rpm, 1), SPEED: round(speed),
    THROTTLE_POS: round(throttle), ACCELERATOR_POS_D: round(phase.throttle),
    ENGINE_LOAD: round(clamp(map * 0.96 + (random() - 0.5), 0, 100)),
    INTAKE_PRESSURE: round(map), INTAKE_TEMP: round(iat),
    MAF: round(maf, 2), SHORT_FUEL_TRIM_1: round(clamp(1.6 * Math.sin(time / 7), -8, 8)),
    LONG_FUEL_TRIM_1: round(1.8 + 0.5 * Math.sin(time / 35)),
    O2_B1S1: round(clamp(oxygen, 0.02, 1.05), 3), COOLANT_TEMP: round(coolant),
    ELM_VOLTAGE: round(phase.state === "cranking" ? 10.9 : 14.05),
    IGNITION_ADVANCE: round(clamp(10 + rpm / 7000 * 22 - throttle * 0.12, 3, 38)),
    INJECTOR_PW_MS: round(injector, 3), VE: round(ve),
    GEAR: gear ? String(gear) : "N", DFCO: dfco, ENGINE_STATUS: phase.state,
  };
}

function applyDropouts(row, time, duration) {
  if (time >= duration * 0.445 && time <= duration * 0.475) row.MAF = null;
  if (time >= duration * 0.72 && time <= duration * 0.75) row.INTAKE_PRESSURE = null;
}

function createEcuRows(config, random) {
  const count = Math.floor(config.durationSeconds * config.sampleRateHz) + 1;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const time = i / config.sampleRateHz;
    const row = sampleAt(time, config.durationSeconds, random);
    if (config.scenario === "sensor-dropout") applyDropouts(row, time, config.durationSeconds);
    rows.push(row);
  }
  return rows;
}

function createObdRows(config, random) {
  const schedule = [
    { interval: 1, offset: 0, columns: FAST },
    { interval: 15, offset: 0.17, columns: MEDIUM },
    { interval: 30, offset: 0.31, columns: SLOW },
  ];
  const events = schedule.flatMap(group => {
    const result = [];
    for (let t = group.offset; t <= config.durationSeconds; t += group.interval) {
      result.push({ time: round(t, 3), columns: group.columns });
    }
    return result;
  }).sort((a, b) => a.time - b.time);
  return events.map(event => {
    const values = sampleAt(event.time, config.durationSeconds, random);
    const row = Object.fromEntries(TELEMETRY_COLUMNS.map(column => [column, null]));
    row.time_s = event.time;
    for (const column of event.columns) row[column] = values[column];
    if (config.scenario === "sensor-dropout") applyDropouts(row, event.time, config.durationSeconds);
    return row;
  });
}

function validateOptions(options) {
  const config = {
    profile: "ecu", scenario: "road-test", durationSeconds: 120, sampleRateHz: 20, seed: 42,
    ...options,
  };
  if (!["ecu", "obd"].includes(config.profile)) throw new TypeError("profile debe ser ecu u obd.");
  if (!["road-test", "sensor-dropout"].includes(config.scenario)) throw new TypeError("scenario no reconocido.");
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) {
    throw new RangeError("seed debe ser un entero entre 0 y 4294967295.");
  }
  if (!Number.isFinite(config.durationSeconds) || config.durationSeconds <= 0 || config.durationSeconds > 1800) {
    throw new RangeError("durationSeconds debe estar entre 0 y 1800.");
  }
  if (!Number.isSafeInteger(config.sampleRateHz) || config.sampleRateHz < 1 || config.sampleRateHz > 100) {
    throw new RangeError("sampleRateHz debe ser un entero entre 1 y 100 Hz.");
  }
  if (config.profile === "ecu" && Math.floor(config.durationSeconds * config.sampleRateHz) + 1 > 100000) {
    throw new RangeError("La salida ECU supera el límite de 100.000 filas.");
  }
  return config;
}

export function generateSimulatedTelemetry(options = {}) {
  const config = validateOptions(options);
  const random = randomFromSeed(config.seed);
  const rows = config.profile === "ecu" ? createEcuRows(config, random) : createObdRows(config, random);
  const channelUpdateCounts = Object.fromEntries(TELEMETRY_COLUMNS.map(column => [
    column, rows.reduce((n, row) => n + (row[column] == null ? 0 : 1), 0),
  ]));
  return {
    schema: SIMULATOR_SCHEMA,
    columns: TELEMETRY_COLUMNS,
    rows,
    metadata: {
      schema: SIMULATOR_SCHEMA,
      simulator: "Datalog Comparison generic engine telemetry model",
      simulatorVersion: SIMULATOR_VERSION,
      synthetic: true,
      measurementType: "simulated-engine-telemetry",
      model: { engine: "generic naturally aspirated inline-four", displacementLitres: 2, cylinders: 4,
        calibration: "illustrative; not fitted to a real engine or ECU" },
      profile: config.profile,
      scenario: config.scenario,
      durationSeconds: config.durationSeconds,
      nominalSampleRateHz: config.profile === "ecu" ? config.sampleRateHz : null,
      samplingDescription: config.profile === "ecu"
        ? "Uniform synthetic ECU/logger samples on a fixed time grid."
        : "Asynchronous OBD-style PID groups: fast 1 s, medium 15 s (+0.17 s), slow 30 s (+0.31 s). Blank cells mean no update; no interpolation.",
      seed: config.seed,
      sampleCount: rows.length,
      channelUpdateCounts,
      units: { time_s: "s", RPM: "RPM", SPEED: "km/h", THROTTLE_POS: "%",
        ENGINE_LOAD: "%", INTAKE_PRESSURE: "kPa abs", INTAKE_TEMP: "°C", MAF: "g/s",
        COOLANT_TEMP: "°C", ELM_VOLTAGE: "V", INJECTOR_PW_MS: "ms", VE: "%",
        GEAR: "state", DFCO: "boolean" },
      omissions: [
        "Torque and power are intentionally not generated; this model is not a dynamometer.",
        "This is not a firmware-level ECU emulator and does not reproduce a manufacturer's calibration.",
      ],
    },
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function serializeSimulatedTelemetryCsv(dataset) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    throw new TypeError("Se esperaba un dataset de generateSimulatedTelemetry().");
  }
  const lines = [dataset.columns.map(csvCell).join(",")];
  for (const row of dataset.rows) lines.push(dataset.columns.map(column => csvCell(row[column])).join(","));
  return lines.join("\n") + "\n";
}
