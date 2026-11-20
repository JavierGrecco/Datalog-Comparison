/**
 * Generador determinista de curvas de dinamómetro para pruebas de software.
 * Sus CSV imitan la resolución de exportación Graph/Time descrita por Dynojet,
 * no un esquema nativo del fabricante ni una medición calibrada.
 */
export const SIMULATED_DYNO_SCHEMA = "datalog-simulated-dyno/1";
export const SIMULATED_DYNO_VERSION = "0.1.0";
export const SIMULATED_DYNO_MODES = Object.freeze(["graph-export", "time-export"]);
export const SIMULATED_DYNO_SCENARIOS = Object.freeze(["reference", "candidate", "sensor-dropout", "repeat-pulls"]);

const POWER_CONSTANT = 9549.29658551372;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

function validateOptions(options) {
  const config = {
    mode: "graph-export", scenario: "reference", seed: 42,
    rpmStart: 1800, rpmEnd: 6500, rpmStep: 50,
    durationSeconds: 8, sampleIntervalMs: 50, measurementBasis: "wheel",
    ...options,
  };
  if (!SIMULATED_DYNO_MODES.includes(config.mode)) throw new TypeError("mode debe ser graph-export o time-export.");
  if (!SIMULATED_DYNO_SCENARIOS.includes(config.scenario)) throw new TypeError("scenario no reconocido.");
  if (config.scenario === "repeat-pulls" && config.mode !== "time-export") {
    throw new TypeError("repeat-pulls requiere mode time-export.");
  }
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) {
    throw new RangeError("seed debe ser un entero entre 0 y 4294967295.");
  }
  if (!Number.isSafeInteger(config.rpmStart) || !Number.isSafeInteger(config.rpmEnd) ||
      config.rpmStart < 500 || config.rpmEnd > 12000 || config.rpmEnd <= config.rpmStart) {
    throw new RangeError("rpmStart y rpmEnd deben definir un rango válido entre 500 y 12000 RPM.");
  }
  if (!Number.isSafeInteger(config.rpmStep) || config.rpmStep < 1 || config.rpmStep > 1000) {
    throw new RangeError("rpmStep debe estar entre 1 y 1000 RPM.");
  }
  if (!Number.isFinite(config.durationSeconds) || config.durationSeconds < 1 || config.durationSeconds > 120) {
    throw new RangeError("durationSeconds debe estar entre 1 y 120 segundos.");
  }
  if (!Number.isSafeInteger(config.sampleIntervalMs) || config.sampleIntervalMs < 10 || config.sampleIntervalMs > 2000) {
    throw new RangeError("sampleIntervalMs debe estar entre 10 y 2000 ms.");
  }
  if (config.measurementBasis !== "wheel") {
    throw new TypeError("Este perfil sintético solo modela resultados referidos a rueda.");
  }
  const count = config.mode === "graph-export"
    ? Math.floor((config.rpmEnd - config.rpmStart) / config.rpmStep) + 1
    : Math.floor(config.durationSeconds * 1000 / config.sampleIntervalMs) + 1;
  if (count > 100000) throw new RangeError("La salida supera 100.000 muestras.");
  return config;
}

function rpmAtTime(time, config) {
  const p = clamp(time / config.durationSeconds, 0, 1);
  const low = config.rpmStart, high = config.rpmEnd, span = high - low;
  if (config.scenario !== "repeat-pulls") return low + span * p;
  if (p < 0.42) return low + span * (p / 0.42);
  if (p < 0.55) return high - span * ((p - 0.42) / 0.13);
  if (p < 0.93) return low + span * ((p - 0.55) / 0.38);
  return high - span * ((p - 0.93) / 0.07);
}

function wheelTorqueAt(rpm, index, scenario, seed) {
  // Generic 2.0 L naturally aspirated illustration; not an engine calibration.
  const engineTorque = 165 + 55 * Math.exp(-(((rpm - 3900) / 1800) ** 2)) -
    Math.max(0, rpm - 5000) * 0.032;
  const gain = scenario === "candidate"
    ? 1 + 0.035 * Math.exp(-(((rpm - 4200) / 1400) ** 2)) : 1;
  const ripple = Math.sin((index + seed % 997) * 1.61803398875) * 0.42 +
    Math.sin(rpm * 0.0041) * 0.18;
  return round(Math.max(0, engineTorque * 0.88 * gain + ripple), 3);
}

function point(rpmInput, index, timeSeconds, config) {
  const rpm = round(clamp(rpmInput, config.rpmStart, config.rpmEnd), 2);
  let torque = wheelTorqueAt(rpm, index, config.scenario, config.seed);
  let power = round(torque * rpm / POWER_CONSTANT, 3);
  if (config.scenario === "sensor-dropout" && rpm >= 3800 && rpm <= 4050) {
    torque = null;
    power = null;
  }
  return {
    ...(config.mode === "time-export" ? { "Time (s)": round(timeSeconds, 3) } : {}),
    "Engine RPM": rpm,
    "Wheel Torque (Nm)": torque,
    "Wheel Power (kW)": power,
  };
}

export function generateSimulatedDyno(options = {}) {
  const config = validateOptions(options);
  const columns = config.mode === "graph-export"
    ? ["Engine RPM", "Wheel Torque (Nm)", "Wheel Power (kW)"]
    : ["Time (s)", "Engine RPM", "Wheel Torque (Nm)", "Wheel Power (kW)"];
  const rows = [];
  if (config.mode === "graph-export") {
    for (let rpm = config.rpmStart, index = 0; rpm <= config.rpmEnd; rpm += config.rpmStep, index += 1) {
      rows.push(point(rpm, index, null, config));
    }
  } else {
    const count = Math.floor(config.durationSeconds * 1000 / config.sampleIntervalMs) + 1;
    for (let index = 0; index < count; index += 1) {
      const time = index * config.sampleIntervalMs / 1000;
      rows.push(point(rpmAtTime(time, config), index, time, config));
    }
  }
  const rpmSteps = rows.slice(1).map((row, i) => row["Engine RPM"] - rows[i]["Engine RPM"]).filter(v => v > 0);
  return {
    schema: SIMULATED_DYNO_SCHEMA,
    columns,
    rows,
    metadata: {
      schema: SIMULATED_DYNO_SCHEMA,
      simulator: "Datalog Comparison generic chassis-dynamometer model",
      simulatorVersion: SIMULATED_DYNO_VERSION,
      synthetic: true,
      evidenceClass: "simulated",
      formatReference: "Dynojet PowerCore / WinPEP export resolution concepts",
      exportMode: config.mode,
      scenario: config.scenario,
      seed: config.seed,
      model: {
        engine: "generic naturally aspirated inline-four",
        displacementLitres: 2,
        cylinders: 4,
        calibration: "illustrative; not fitted to a real engine, ECU or dynamometer",
        measurementBasis: "wheel",
        wheelTorqueAssumption: "illustrative fixed 0.88 scale; not a universal drivetrain-loss value",
      },
      measurementBasis: "wheel",
      units: {
        "Engine RPM": "RPM",
        "Wheel Torque (Nm)": "Nm",
        "Wheel Power (kW)": "kW",
        ...(config.mode === "time-export" ? { "Time (s)": "s" } : {}),
      },
      resolution: config.mode === "graph-export"
        ? { kind: "rpm-increment", rpmStep: config.rpmStep }
        : { kind: "time-interval", sampleIntervalMs: config.sampleIntervalMs,
            nominalSampleRateHz: 1000 / config.sampleIntervalMs },
      durationSeconds: config.mode === "time-export" ? config.durationSeconds : null,
      rpmRange: { min: config.rpmStart, max: config.rpmEnd },
      rowCount: rows.length,
      observedPositiveRpmStepRange: rpmSteps.length
        ? { min: Math.min(...rpmSteps), max: Math.max(...rpmSteps) } : null,
      correction: { applied: false, standard: null,
        reason: "No se aplicó corrección atmosférica ni procedimiento de ensayo certificado." },
      omissions: [
        "Los valores son simulados; no son mediciones de un banco real.",
        "La curva no está calibrada contra un vehículo, motor, neumático o dinamómetro concreto.",
        "La escala rueda/motor usada por este ejemplo es ilustrativa y no se transfiere a otros ensayos.",
        "El CSV prueba resoluciones de muestreo documentadas; no es un esquema nativo certificado de Dynojet.",
      ],
    },
  };
}

function cell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function serializeSimulatedDynoCsv(dataset) {
  if (!dataset || dataset.schema !== SIMULATED_DYNO_SCHEMA ||
      !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) {
    throw new TypeError("Se esperaba un dataset de generateSimulatedDyno().");
  }
  return [
    dataset.columns.map(cell).join(","),
    ...dataset.rows.map(row => dataset.columns.map(column => cell(row[column])).join(",")),
  ].join("\n") + "\n";
}
