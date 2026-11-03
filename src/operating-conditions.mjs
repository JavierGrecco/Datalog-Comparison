/**
 * Condiciones operativas declaradas por ensayo.
 *
 * Este módulo conserva la fuente indicada por la persona y separa claramente
 * los valores desconocidos de los reportados, medidos o verificados por quien
 * los carga. No autentica documentos ni certifica equivalencia física.
 */
export const OPERATING_CONDITIONS_SCHEMA = "operating-conditions/1";

export const OPERATING_CONDITION_FIELDS = Object.freeze([
  { key: "vehicle_engine", label: "Vehículo y motor", type: "text", unit: "", hint: "Identificación descriptiva; evitá incluir patente o VIN si no hace falta." },
  { key: "calibration_id", label: "Calibración / versión", type: "text", unit: "", hint: "Nombre, versión o identificador del archivo/configuración." },
  { key: "fuel", label: "Combustible", type: "text", unit: "", hint: "Tipo declarado y, si se conoce, grado o composición." },
  { key: "gear", label: "Marcha utilizada", type: "text", unit: "", hint: "Marcha registrada o informada; no se infiere automáticamente." },
  { key: "throttle_pct", label: "Acelerador", type: "number", unit: "%", min: 0, max: 100, hint: "Porcentaje si el origen confirma que ese es el significado y la unidad." },
  { key: "load_pct", label: "Carga calculada", type: "number", unit: "%", min: 0, max: 100, hint: "Solo si la fuente declara una carga porcentual comparable." },
  { key: "ambient_temp_c", label: "Temperatura ambiente", type: "number", unit: "°C", hint: "Valor registrado o informado en el ensayo." },
  { key: "intake_temp_c", label: "Temperatura de admisión (IAT)", type: "number", unit: "°C", hint: "Indicar si es al inicio, durante el tramo o al final en la nota." },
  { key: "coolant_temp_c", label: "Temperatura de refrigerante", type: "number", unit: "°C", hint: "No asumir que todos los equipos reportan la misma ubicación del sensor." },
  { key: "test_method", label: "Método de prueba", type: "text", unit: "", hint: "Banco dinamométrico, ruta, pista, banco de pruebas u otro." },
  { key: "hardware_notes", label: "Hardware / cambios", type: "text", unit: "", hint: "Admisión, escape, turbo, neumáticos, reparación u otro cambio relevante." },
  { key: "ambient_pressure_kpa", label: "Presión barométrica / ambiente", type: "number", unit: "kPa", optional: true, min: 0, hint: "Valor absoluto si esa es la magnitud de origen; conservá la fuente y no confundas presión absoluta con relativa." },
  { key: "relative_humidity_pct", label: "Humedad relativa", type: "number", unit: "%", optional: true, min: 0, max: 100, hint: "Dato ambiental declarado o medido. No reemplaza declarar el estándar de corrección aplicado." },
  { key: "vehicle_mass_kg", label: "Masa del vehículo en el ensayo", type: "number", unit: "kg", optional: true, min: 0, hint: "Si se analiza aceleración, indicá si incluye conductor, combustible y carga." },
  { key: "tire_size", label: "Medida de neumáticos", type: "text", unit: "", optional: true, hint: "Si los ejes difieren, anotá ambas medidas. Importa para interpretar radio efectivo y velocidad del rodillo." },
  { key: "tire_pressure_kpa", label: "Presión de neumáticos", type: "number", unit: "kPa", optional: true, min: 0, hint: "Anotá eje/neumático y si fue en frío o caliente. Relevante sobre todo en banco de rodillos." },
  { key: "dyno_ramp_rate_rpm_s", label: "Rampa del banco", type: "number", unit: "RPM/s", optional: true, min: 0, hint: "Ramp rate del ensayo, si el equipo lo declara; no es una velocidad del vehículo." },
  { key: "dyno_smoothing_setting", label: "Suavizado del gráfico del banco", type: "text", unit: "", optional: true, hint: "Anotá el nivel/algoritmo exacto. No compares niveles desconocidos como si fueran equivalentes." },
  { key: "dyno_load_mode", label: "Modo de carga del dinamómetro", type: "text", unit: "", optional: true, hint: "Ej.: inercial, freno/eddy-current o carga de carretera. Usá la denominación del equipo; no se infiere de la curva." }
]);

const statusValues = new Set(["unknown", "reported", "measured", "verified"]);
const validText = value => typeof value === "string" && value.trim().length > 0;

export function createEmptyOperatingConditions() {
  const fields = {};
  for (const definition of OPERATING_CONDITION_FIELDS) {
    fields[definition.key] = { value: null, status: "unknown", source: "", note: "" };
  }
  return { schema: OPERATING_CONDITIONS_SCHEMA, updatedAt: null, fields };
}

export function validateOperatingConditions(conditions, label = "operatingConditions") {
  const errors = [];
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) {
    return [label + " debe ser un objeto."];
  }
  const allowedRoot = ["schema", "updatedAt", "fields"];
  const extraRoot = Object.keys(conditions).filter(key => !allowedRoot.includes(key));
  if (extraRoot.length) errors.push(label + " tiene campos desconocidos: " + extraRoot.join(", ") + ".");
  if (conditions.schema !== OPERATING_CONDITIONS_SCHEMA) errors.push(label + ".schema no es compatible.");
  if (conditions.updatedAt !== null && (!validText(conditions.updatedAt) || !Number.isFinite(Date.parse(conditions.updatedAt)))) {
    errors.push(label + ".updatedAt debe ser una fecha válida o null.");
  }
  if (!conditions.fields || typeof conditions.fields !== "object" || Array.isArray(conditions.fields)) {
    errors.push(label + ".fields debe ser un objeto.");
    return errors;
  }
  const knownKeys = OPERATING_CONDITION_FIELDS.map(field => field.key);
  const extra = Object.keys(conditions.fields).filter(key => !knownKeys.includes(key));
  if (extra.length) errors.push(label + ".fields tiene campos desconocidos: " + extra.join(", ") + ".");
  for (const definition of OPERATING_CONDITION_FIELDS) {
    const entry = conditions.fields[definition.key];
    const entryLabel = label + ".fields." + definition.key;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      if (definition.optional && entry === undefined) continue;
      errors.push(entryLabel + " debe ser un objeto.");
      continue;
    }
    const extraEntry = Object.keys(entry).filter(key => !["value", "status", "source", "note"].includes(key));
    if (extraEntry.length) errors.push(entryLabel + " tiene propiedades desconocidas: " + extraEntry.join(", ") + ".");
    for (const key of ["value", "status", "source", "note"]) {
      if (!Object.hasOwn(entry, key)) errors.push(entryLabel + " no tiene el campo " + key + ".");
    }
    if (!statusValues.has(entry.status)) {
      errors.push(entryLabel + ".status debe ser unknown, reported, measured o verified.");
      continue;
    }
    if (typeof entry.source !== "string" || typeof entry.note !== "string") {
      errors.push(entryLabel + ": source y note deben ser textos.");
      continue;
    }
    if (entry.status === "unknown") {
      if (entry.value !== null && entry.value !== "") errors.push(entryLabel + ": un valor desconocido no debe incluir un valor supuesto.");
      if (entry.source.trim()) errors.push(entryLabel + ": un valor desconocido no debe declarar una fuente.");
      continue;
    }
    if (!entry.source.trim()) errors.push(entryLabel + ": indicá la fuente para conservar la procedencia.");
    if (definition.type === "number") {
      if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
        errors.push(entryLabel + ".value debe ser un número finito.");
      } else {
        if (Number.isFinite(definition.min) && entry.value < definition.min) errors.push(entryLabel + ".value está por debajo del mínimo permitido.");
        if (Number.isFinite(definition.max) && entry.value > definition.max) errors.push(entryLabel + ".value está por encima del máximo permitido.");
      }
    } else if (!validText(entry.value)) {
      errors.push(entryLabel + ".value debe ser texto no vacío.");
    }
  }
  return errors;
}

const normalize = (value, type) => type === "number"
  ? (typeof value === "number" && Number.isFinite(value) ? value : null)
  : (typeof value === "string" && value.trim() ? value.trim().toLocaleLowerCase() : null);
const statusLabel = Object.freeze({
  unknown: "Desconocido",
  reported: "Informado",
  measured: "Medido",
  verified: "Verificado por quien carga"
});

/** Compara lo declarado sin inferir ni suplir campos ausentes. */
export function compareOperatingConditions(reference, candidate) {
  const referenceFields = reference?.operatingConditions?.fields ?? createEmptyOperatingConditions().fields;
  const candidateFields = candidate?.operatingConditions?.fields ?? createEmptyOperatingConditions().fields;
  return OPERATING_CONDITION_FIELDS.map(definition => {
    const base = referenceFields[definition.key] ?? { value: null, status: "unknown", source: "", note: "" };
    const other = candidateFields[definition.key] ?? { value: null, status: "unknown", source: "", note: "" };
    const a = normalize(base.value, definition.type);
    const b = normalize(other.value, definition.type);
    let status, explanation;
    if (base.status === "unknown" || other.status === "unknown" || a === null || b === null) {
      status = "unknown";
      explanation = "Falta un dato usable en al menos uno de los registros.";
    } else if (a !== b) {
      status = "different";
      explanation = "Los valores declarados son distintos.";
    } else if (base.status === "verified" && other.status === "verified") {
      status = "same_verified";
      explanation = "El valor declarado coincide y ambas entradas están marcadas como verificadas por quien las cargó; la aplicación no ha comprobado las fuentes.";
    } else {
      status = "same_value_unverified";
      explanation = "Los valores declarados coinciden, pero al menos uno no está marcado como verificado.";
    }
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      referenceValue: base.value,
      candidateValue: other.value,
      referenceStatus: statusLabel[base.status] ?? "Desconocido",
      candidateStatus: statusLabel[other.status] ?? "Desconocido",
      status,
      explanation
    };
  });
}
