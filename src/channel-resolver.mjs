/**
 * Resolución determinista de encabezados CSV.
 *
 * El resolver propone identidades y expone evidencias; nunca modifica muestras.
 * La coincidencia difusa sirve para revisión humana y no habilita asignación
 * automática. Las unidades restringen dimensiones, pero no demuestran por sí
 * solas el rol físico de una señal.
 */
import {
  getChannelDimension,
  getChannelKeysForDimension,
  getKnownUnitSpellings,
  resolveUnitToken,
} from "./unit-registry.mjs";

export const CHANNEL_RESOLVER_VERSION = "datalog-channel-resolver/1";

const LABELS = Object.freeze({
  time_s: "Tiempo relativo",
  rpm: "RPM de motor",
  distance_km: "Distancia",
  speed_kmh: "Velocidad del vehículo",
  torque_nm: "Torque",
  power_kw: "Potencia",
  boost_target: "Presión de sobrealimentación objetivo",
  boost_actual: "Presión de sobrealimentación medida",
  map_abs_kpa: "Presión absoluta de colector (MAP)",
  fuel_pressure_kpa: "Presión de combustible",
  throttle_pct: "Posición de acelerador",
  iat_c: "Temperatura de aire de admisión",
  coolant_temp_c: "Temperatura de refrigerante",
  ignition_advance_deg: "Avance de encendido",
  battery_v: "Tensión de batería",
  lambda: "Lambda medida",
  afr: "Relación aire/combustible (AFR)",
});

const RULES = [
  { key: "time_s", aliases: ["elapsed", "elapsed time", "relative time", "time relative", "time since start", "tiempo transcurrido", "tiempo relativo"], fuzzy: ["elapsed time", "relative time", "tiempo transcurrido"], auto: true },
  { key: "time_s", aliases: [], ambiguous: ["time", "timestamp", "time stamp", "hora"], reason: "El encabezado indica tiempo, pero no demuestra si es tiempo relativo o una marca absoluta.", auto: false },
  { key: "rpm", aliases: ["engine rpm", "engine speed", "eng rpm", "eng speed", "motor rpm", "motor speed", "engine revolutions per minute", "engine revs"], fuzzy: ["engine rpm", "engine speed", "motor rpm", "motor speed"], auto: true },
  { key: "distance_km", aliases: ["distance", "distance traveled", "distance travelled", "trip distance", "odometer", "odo", "odometer reading", "distancia recorrida", "kilometraje"], fuzzy: ["distance traveled", "odometer"], auto: true },
  { key: "speed_kmh", aliases: ["vehicle speed", "road speed", "ground speed", "velocidad del vehiculo", "velocidad vehicular"], fuzzy: ["vehicle speed", "road speed"], auto: true },
  { key: "speed_kmh", aliases: [], ambiguous: ["speed", "vehicle velocity", "wheel speed", "velocidad"], reason: "La dimensión es velocidad, pero falta confirmar si representa velocidad del vehículo, rueda o rodillo.", auto: false },
  { key: "torque_nm", aliases: ["torque", "engine torque", "wheel torque", "roller torque", "hub torque", "dyno torque", "par motor", "par"], fuzzy: ["engine torque", "wheel torque", "torque"], auto: true },
  { key: "power_kw", aliases: ["power", "engine power", "wheel power", "roller power", "hub power", "dyno power", "potencia", "potencia motor"], fuzzy: ["engine power", "wheel power", "power"], auto: true },
  { key: "boost_target", aliases: ["boost target", "target boost", "desired boost", "requested boost", "boost pressure target", "presion objetivo", "presion de sobrealimentacion objetivo"], fuzzy: ["boost target", "target boost"], auto: true },
  { key: "boost_actual", aliases: ["boost actual", "actual boost", "measured boost", "boost pressure actual", "presion de sobrealimentacion medida"], fuzzy: ["boost actual", "measured boost"], auto: true },
  { key: "boost_actual", aliases: [], ambiguous: ["boost", "boost pressure", "presion de turbo", "presion de sobrealimentacion"], reason: "Boost puede ser presión medida o consigna; no se debe elegir actual/objetivo por defecto.", auto: false },
  { key: "boost_target", aliases: [], ambiguous: ["boost", "boost pressure", "presion de turbo", "presion de sobrealimentacion"], reason: "Boost puede ser presión medida o consigna; no se debe elegir actual/objetivo por defecto.", auto: false },
  { key: "map_abs_kpa", aliases: ["manifold absolute pressure", "absolute manifold pressure", "map absolute pressure", "map abs"], fuzzy: ["manifold absolute pressure"], auto: true },
  { key: "map_abs_kpa", aliases: [], ambiguous: ["map", "manifold pressure", "intake manifold pressure"], reason: "MAP suele referirse a presión absoluta, pero el encabezado no confirma la referencia ni excluye una señal derivada.", auto: false },
  { key: "fuel_pressure_kpa", aliases: ["fuel pressure", "fuel rail pressure", "rail pressure", "presion de combustible", "presion de riel"], fuzzy: ["fuel pressure", "fuel rail pressure"], auto: true },
  { key: "throttle_pct", aliases: ["throttle position", "throttle pos", "throttle position sensor", "throttle angle percent", "tps", "accelerator pedal position", "accelerator position", "posicion de acelerador", "apertura de mariposa"], fuzzy: ["throttle position", "accelerator pedal position"], auto: true },
  { key: "iat_c", aliases: ["intake air temperature", "intake temperature", "air intake temperature", "iat", "temperatura de admision"], fuzzy: ["intake air temperature", "intake temperature"], auto: true },
  { key: "coolant_temp_c", aliases: ["coolant temperature", "engine coolant temperature", "coolant temp", "ect", "temperatura de refrigerante"], fuzzy: ["coolant temperature", "engine coolant temperature"], auto: true },
  { key: "ignition_advance_deg", aliases: ["ignition advance", "spark advance", "timing advance", "avance de encendido", "avance de chispa"], fuzzy: ["ignition advance", "spark advance"], auto: true },
  { key: "ignition_advance_deg", aliases: [], ambiguous: ["ignition timing", "timing", "encendido"], reason: "El término timing/ignition puede referirse a avance, dwell u otra magnitud de encendido.", auto: false },
  { key: "battery_v", aliases: ["battery voltage", "battery volts", "system voltage", "voltage battery", "tension de bateria"], fuzzy: ["battery voltage", "system voltage"], auto: true },
  { key: "lambda", aliases: ["measured lambda", "lambda actual", "wideband lambda", "wideband lambda measured", "lambda medida"], fuzzy: ["measured lambda", "wideband lambda"], auto: true },
  { key: "lambda", aliases: [], ambiguous: ["lambda"], reason: "Lambda puede ser valor medido o consigna. Se necesita identificar el rol de la señal.", auto: false },
  { key: "afr", aliases: ["afr", "wideband afr", "measured afr", "air fuel ratio", "air-fuel ratio", "relacion aire combustible"], fuzzy: ["wideband afr", "air fuel ratio"], auto: true },
];

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/λ/g, "lambda")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sameUnitAlias(candidate, spelling) {
  const a = String(candidate ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const b = String(spelling ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const match = resolveUnitToken(b);
  if (match.status !== "matched") return false;
  // Los símbolos se conservan sensibles a mayúsculas; nombres completos los resuelve el registro.
  return a === b || resolveUnitToken(a).status === "matched" &&
    resolveUnitToken(a).dimension === match.dimension &&
    resolveUnitToken(a).canonicalUnit === match.canonicalUnit &&
    resolveUnitToken(a).factor === match.factor;
}

function extractHeaderUnit(header) {
  const source = String(header ?? "").trim();
  const bracket = source.match(/[\[(]\s*([^\]\)]+?)\s*[\]\)]\s*$/);
  if (bracket) {
    const resolution = resolveUnitToken(bracket[1]);
    if (resolution.status === "matched") {
      return { unit: resolution, rawUnit: bracket[1].trim(), cleaned: source.slice(0, bracket.index).trim() };
    }
    return { unit: null, rawUnit: bracket[1].trim(), cleaned: source };
  }

  const spellings = getKnownUnitSpellings();
  for (const spelling of spellings) {
    const suffix = source.slice(-spelling.length);
    if (!sameUnitAlias(suffix, spelling)) continue;
    const start = source.length - spelling.length;
    const prefix = source.slice(0, start);
    const boundary = start === 0 || /[\s([{=:]/.test(source[start - 1]);
    if (!boundary) continue;
    // "Engine RPM" is a semantic label, not the name "Engine" with an RPM unit.
    if (["rpm", "rev/min", "r/min", "1/min"].includes(spelling.toLowerCase()) &&
        /(?:engine|eng|motor|wheel|roller|driveshaft|crankshaft|turbine)\s*$/i.test(prefix)) continue;
    // AFR/lambda written as a bare final word are channel names, not unit declarations.
    if (["AFR", "λ"].includes(spelling) || spelling.toLowerCase() === "lambda") continue;
    const resolution = resolveUnitToken(suffix);
    if (resolution.status === "matched") {
      return {
        unit: resolution,
        rawUnit: suffix.trim(),
        cleaned: source.slice(0, start).replace(/[\s([{=:]+$/, "").trim(),
      };
    }
  }
  return { unit: null, rawUnit: null, cleaned: source };
}

function damerauLevenshtein(left, right) {
  const a = [...left];
  const b = [...right];
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyPhraseMatch(input, alias) {
  const inputTokens = input.split(" ");
  const aliasTokens = alias.split(" ");
  if (inputTokens.length !== aliasTokens.length) return false;
  let corrected = 0;
  for (let index = 0; index < inputTokens.length; index += 1) {
    const actual = inputTokens[index];
    const expected = aliasTokens[index];
    if (actual === expected) continue;
    if (actual.length < 5 || expected.length < 5) return false;
    const distance = damerauLevenshtein(actual, expected);
    const maxDistance = expected.length >= 9 ? 2 : 1;
    if (distance < 1 || distance > maxDistance) return false;
    corrected += distance;
  }
  return corrected > 0;
}

function targetSignalKind(normalized) {
  if (/\btarget\b|\bdesired\b|\brequested\b|\bsetpoint\b|\bconsigna\b/.test(normalized) &&
      /\blambda\b|\bafr\b/.test(normalized)) return "air-fuel-target";
  return null;
}

function candidateFromRule(rule, matchedAlias, evidenceType) {
  const basis = /wheel/.test(matchedAlias) ? "wheel" :
    /roller/.test(matchedAlias) ? "roller" :
      /hub/.test(matchedAlias) ? "hub" :
        /engine|motor/.test(matchedAlias) ? "engine" : null;
  return {
    key: rule.key,
    label: LABELS[rule.key] ?? rule.key,
    dimension: getChannelDimension(rule.key),
    evidence: [evidenceType === "exact" ? "Nombre coincidente con alias registrado" : "Nombre similar con posible error de tipeo"],
    ...(basis ? { measurementBasisHint: basis } : {}),
    requiresQualifier: !rule.auto,
    rule: evidenceType === "exact" ? "alias-exact" : "bounded-damerau-levenshtein",
  };
}

function unitEvidence(candidate, unit) {
  if (!unit) return { compatible: true };
  if (candidate.dimension !== unit.dimension) {
    return {
      compatible: false,
      reason: "La unidad " + unit.input + " corresponde a " + unit.dimension +
        ", pero el canal candidato requiere " + candidate.dimension + ".",
    };
  }
  return { compatible: true };
}

function dimensionOnlyResult(header, unit, rawUnit) {
  const keys = getChannelKeysForDimension(unit.dimension);
  const candidates = unit.dimension === "rotational_speed"
    ? [{
      key: null,
      label: "Velocidad angular (motor/rueda/árbol/rodillo)",
      dimension: unit.dimension,
      evidence: ["RPM identifica rotación, no el componente que gira"],
      requiresQualifier: true,
      rule: "unit-dimension-only",
    }]
    : unit.dimension === "speed"
      ? [{
        key: null,
        label: "Velocidad lineal (vehículo/rueda/rodillo)",
        dimension: unit.dimension,
        evidence: ["La unidad identifica velocidad lineal, no su ubicación física"],
        requiresQualifier: true,
        rule: "unit-dimension-only",
      }]
      : keys.map(key => ({
        key,
        label: LABELS[key] ?? key,
        dimension: unit.dimension,
        evidence: ["La unidad identifica la dimensión física, no el rol de la señal"],
        requiresQualifier: true,
        rule: "unit-dimension-only",
      }));
  const roleNote = unit.dimension === "pressure"
    ? "La unidad identifica presión, pero no distingue MAP, boost medido/objetivo ni presión de combustible."
    : unit.dimension === "rotational_speed"
      ? "RPM identifica velocidad de rotación, pero no distingue motor, rueda, árbol o rodillo."
      : unit.dimension === "speed"
        ? "La unidad identifica velocidad lineal, pero no confirma si corresponde al vehículo, rueda o rodillo."
        : unit.dimension === "torque"
          ? "La unidad identifica torque, pero no determina si la medición corresponde a motor, rueda, cubo o rodillo."
          : "La unidad acota la magnitud física, pero no demuestra por sí sola el rol de esta columna.";
  return {
    header,
    normalizedHeader: normalizeName(header),
    status: "review_unit_only",
    suggestedKey: null,
    autoAssignable: false,
    candidates,
    unit: { raw: rawUnit, ...unit },
    reason: roleNote,
  };
}

/** Resuelve una columna de forma conservadora; no asigna ni altera sus valores. */
export function resolveColumnHeader(header, { sourceDomain = "unknown" } = {}) {
  const original = String(header ?? "");
  let { unit, rawUnit, cleaned } = extractHeaderUnit(original);
  const fullName = normalizeName(original);
  const cleanedName = normalizeName(cleaned);
  if (!unit && /\b(?:engine|eng|motor) rpm\b/.test(fullName)) {
    const implicitRpm = resolveUnitToken("RPM");
    if (implicitRpm.status === "matched") {
      unit = implicitRpm;
      rawUnit = "RPM";
    }
  }
  const semanticNames = [...new Set([fullName, cleanedName].filter(Boolean))];

  if (/\b(?:wheel|roller)\s+speed\b/.test(fullName)) {
    return {
      header: original,
      normalizedHeader: fullName,
      status: "unsupported",
      suggestedKey: null,
      autoAssignable: false,
      candidates: [],
      unit: unit ? { raw: rawUnit, ...unit } : null,
      reason: "El encabezado identifica velocidad de rueda o rodillo. El contrato actual no contiene un canal separado para esa ubicación física; no se reutiliza velocidad del vehículo.",
    };
  }

  if (/\b(?:wheel|roller|driveshaft|crankshaft|turbine)\s+rpm\b/.test(fullName)) {
    return {
      header: original,
      normalizedHeader: fullName,
      status: "unsupported",
      suggestedKey: null,
      autoAssignable: false,
      candidates: [],
      unit: unit ? { raw: rawUnit, ...unit } : null,
      reason: "El encabezado identifica RPM de rueda, rodillo o árbol; no corresponde al canal de RPM de motor de este contrato.",
    };
  }

  if (targetSignalKind(cleanedName || fullName)) {
    return {
      header: original,
      normalizedHeader: cleanedName || fullName,
      status: "unsupported",
      suggestedKey: null,
      autoAssignable: false,
      candidates: [],
      unit: unit ? { raw: rawUnit, ...unit } : null,
      reason: "Se identificó una consigna de lambda/AFR. No se mapeará como mezcla medida.",
    };
  }

  const exactRules = [];
  for (const rule of RULES) {
    for (const name of semanticNames) {
      const alias = rule.aliases.find(value => normalizeName(value) === name);
      const ambiguousAlias = rule.ambiguous?.find(value => normalizeName(value) === name);
      if (alias) exactRules.push({ rule, alias: normalizeName(alias), ambiguous: false });
      if (ambiguousAlias) exactRules.push({ rule, alias: normalizeName(ambiguousAlias), ambiguous: true });
    }
  }

  if (exactRules.length) {
    const uniqueByKey = new Map();
    for (const match of exactRules) {
      const current = uniqueByKey.get(match.rule.key);
      const candidate = candidateFromRule(match.rule, match.alias, "exact");
      if (!current || !match.ambiguous) uniqueByKey.set(match.rule.key, {
        ...candidate,
        requiresQualifier: candidate.requiresQualifier || match.ambiguous,
        ambiguousAlias: match.ambiguous,
        reason: match.rule.reason ?? null,
        auto: match.rule.auto && !match.ambiguous,
      });
    }
    let candidates = [...uniqueByKey.values()];
    if (unit) {
      const compatibility = candidates.map(candidate => ({ candidate, check: unitEvidence(candidate, unit) }));
      const compatible = compatibility.filter(item => item.check.compatible);
      if (!compatible.length) {
        return {
          header: original,
          normalizedHeader: cleanedName || fullName,
          status: "conflict",
          suggestedKey: null,
          autoAssignable: false,
          candidates: candidates.map(candidate => ({ ...candidate, evidence: [...candidate.evidence, "Unidad incompatible"] })),
          unit: { raw: rawUnit, ...unit },
          reason: compatibility[0]?.check.reason ?? "La unidad no es compatible con el canal candidato.",
        };
      }
      candidates = compatible.map(item => item.candidate);
    }
    const hasAmbiguity = candidates.length !== 1 || candidates.some(candidate => candidate.ambiguousAlias);
    const selected = candidates.length === 1 ? candidates[0] : null;
    const autoAssignable = Boolean(selected?.auto && !hasAmbiguity);
    const status = hasAmbiguity ? "ambiguous" : "exact";
    return {
      header: original,
      normalizedHeader: cleanedName || fullName,
      status,
      suggestedKey: selected?.key ?? null,
      autoAssignable,
      candidates: candidates.map(({ auto, ...candidate }) => candidate),
      unit: unit ? { raw: rawUnit, ...unit } : null,
      reason: hasAmbiguity
        ? candidates.map(candidate => candidate.reason).filter(Boolean).join(" ") || "Hay más de una interpretación posible."
        : autoAssignable
          ? "Coincidencia exacta y compatible. Se puede preseleccionar, pero la persona debe revisar el mapeo."
          : selected?.reason ?? "El nombre coincide; falta confirmar el contexto físico.",
      sourceDomain,
    };
  }

  const fuzzyMatches = [];
  for (const rule of RULES) {
    for (const aliasValue of rule.fuzzy ?? []) {
      const alias = normalizeName(aliasValue);
      if (semanticNames.some(name => fuzzyPhraseMatch(name, alias))) {
        fuzzyMatches.push({ rule, alias });
      }
    }
  }
  if (fuzzyMatches.length) {
    const unique = new Map();
    for (const match of fuzzyMatches) {
      if (!unique.has(match.rule.key)) unique.set(match.rule.key,
        candidateFromRule(match.rule, match.alias, "fuzzy"));
    }
    let candidates = [...unique.values()];
    if (unit) candidates = candidates.filter(candidate => unitEvidence(candidate, unit).compatible);
    if (candidates.length) {
      return {
        header: original,
        normalizedHeader: cleanedName || fullName,
        status: candidates.length === 1 ? "fuzzy" : "ambiguous",
        suggestedKey: candidates.length === 1 ? candidates[0].key : null,
        autoAssignable: false,
        candidates,
        unit: unit ? { raw: rawUnit, ...unit } : null,
        reason: "Posible error de tipeo detectado. La coincidencia difusa nunca se asigna automáticamente; confirmá el encabezado y la unidad.",
        sourceDomain,
      };
    }
  }

  if (unit) return dimensionOnlyResult(original, unit, rawUnit);

  return {
    header: original,
    normalizedHeader: cleanedName || fullName,
    status: "unrecognized",
    suggestedKey: null,
    autoAssignable: false,
    candidates: [],
    unit: null,
    reason: "No hay evidencia suficiente para identificar esta columna. Se debe dejar sin asignar o revisar manualmente.",
    sourceDomain,
  };
}

/** Analiza todas las columnas y preselecciona solo coincidencias exactas únicas. */
const VALUE_ENVELOPES = Object.freeze([
  { key: "rpm", min: 250, max: 25000, label: "RPM de motor", note: "rango numérico compatible con régimen de motor, pero sin unidad ni contexto no distingue RPM de otras señales escaladas" },
  { key: "speed_kmh", min: 0, max: 450, label: "Velocidad lineal", note: "rango compatible con velocidad lineal, pero también con otras magnitudes" },
  { key: "throttle_pct", min: 0, max: 100, label: "Porcentaje de acelerador", note: "rango 0–100 compatible con porcentaje, no demuestra que sea TPS" },
  { key: "iat_c", min: -80, max: 250, label: "Temperatura", note: "rango amplio compatible con temperatura; no identifica sensor ni ubicación" },
  { key: "coolant_temp_c", min: -80, max: 250, label: "Temperatura", note: "rango amplio compatible con temperatura; no identifica sensor ni ubicación" },
  { key: "battery_v", min: 0, max: 40, label: "Tensión", note: "rango compatible con tensión automotriz o señal eléctrica, no confirma el circuito" },
  { key: "boost_actual", min: -120, max: 1000, label: "Presión", note: "rango compatible con presión, pero no determina MAP, boost, combustible ni referencia absoluta/relativa" },
  { key: "map_abs_kpa", min: 0, max: 1000, label: "Presión", note: "rango compatible con presión absoluta; no identifica qué sensor o circuito la produjo" },
  { key: "fuel_pressure_kpa", min: 0, max: 1000, label: "Presión", note: "rango compatible con presión; no identifica MAP, boost o combustible" },
  { key: "torque_nm", min: -100, max: 5000, label: "Torque", note: "rango compatible con torque; no identifica la base física (motor/rueda/rodillo/cubo)" },
  { key: "power_kw", min: -100, max: 5000, label: "Potencia", note: "rango compatible con potencia; no identifica base ni unidad" },
  { key: "lambda", min: 0.4, max: 3, label: "Lambda", note: "rango compatible con lambda, pero puede solaparse con otros factores o señales" },
  { key: "afr", min: 4, max: 45, label: "AFR", note: "rango compatible con AFR, pero no demuestra si es valor medido o consigna" },
  { key: "ignition_advance_deg", min: -90, max: 120, label: "Ángulo", note: "rango compatible con ángulo, pero puede describir varias señales de encendido" },
]);

function numericValue(value, decimalSeparator = ".") {
  const raw = String(value ?? "").trim();
  if (!raw || /^(?:na|n\/a|null|nan|—|--|-)$/i.test(raw)) return null;
  const decimal = decimalSeparator === "," ? "," : ".";
  const pattern = decimal === ","
    ? /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/
    : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!pattern.test(raw)) return null;
  const parsed = Number(decimal === "," ? raw.replace(",", ".") : raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Perfil numérico orientativo. Los rangos nunca asignan un canal: solo ayudan
 * a priorizar revisión y no sustituyen unidades, metadatos ni contexto físico.
 */
export function profileColumnValues(values, { decimalSeparator = "." } = {}) {
  const source = Array.isArray(values) ? values : [];
  const stride = Math.max(1, Math.ceil(source.length / 2000));
  const sampled = [];
  const sampledCellCount = source.length ? Math.ceil(source.length / stride) : 0;
  for (let index = 0; index < source.length; index += stride) {
    const value = numericValue(source[index], decimalSeparator);
    if (value !== null) sampled.push({ index, value });
  }
  const ordered = sampled.map(item => item.value).sort((a, b) => a - b);
  if (!ordered.length) {
    return {
      sampleCount: sampledCellCount,
      numericCount: 0,
      missingOrNonNumericCount: sampledCellCount,
      min: null,
      max: null,
      median: null,
      q05: null,
      q95: null,
      increasingAdjacentRatio: null,
      integerRatio: null,
      valueCandidates: [],
    };
  }
  const distinct = new Set(ordered);
  let adjacentCount = 0;
  let increasingCount = 0;
  for (let index = 1; index < sampled.length; index += 1) {
    adjacentCount += 1;
    if (sampled[index].index > sampled[index - 1].index &&
        sampled[index].value > sampled[index - 1].value) increasingCount += 1;
  }
  const integerCount = ordered.filter(value => Number.isInteger(value)).length;
  const stats = {
    sampleCount: sampledCellCount,
    numericCount: sampled.length,
    missingOrNonNumericCount: Math.max(0, sampledCellCount - sampled.length),
    min: ordered[0],
    max: ordered.at(-1),
    median: quantile(ordered, 0.5),
    q05: quantile(ordered, 0.05),
    q95: quantile(ordered, 0.95),
    increasingAdjacentRatio: adjacentCount ? increasingCount / adjacentCount : null,
    integerRatio: ordered.length ? integerCount / ordered.length : null,
    uniqueRatio: ordered.length ? distinct.size / ordered.length : null,
  };
  stats.valueCandidates = VALUE_ENVELOPES
    .filter(envelope => stats.q05 >= envelope.min && stats.q95 <= envelope.max)
    .map(({ key, label, note }) => ({ key, label, note }));
  return stats;
}

function applyValueProfile(resolution, sampleValues, decimalSeparator = ".") {
  if (!Array.isArray(sampleValues) || !sampleValues.length ||
      resolution.status !== "unrecognized" || resolution.unit) return resolution;
  const profile = profileColumnValues(sampleValues, { decimalSeparator });
  if (!profile.numericCount) return { ...resolution, valueProfile: profile };
  const candidates = profile.valueCandidates.map(candidate => ({
    ...candidate,
    evidence: ["Rango numérico observado compatible, no identificativo"],
    requiresQualifier: true,
    rule: "plausible-value-envelope",
  }));
  if (!candidates.length) return { ...resolution, valueProfile: profile };
  return {
    ...resolution,
    status: "review_values_only",
    candidates,
    valueProfile: profile,
    reason: "Los valores reducen posibilidades por rango, pero magnitudes distintas pueden compartir el mismo intervalo. No se asignó ningún canal ni se dedujo una unidad.",
  };
}

export function suggestColumnMappings(headers, options = {}) {
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const decimalSeparator = options.decimalSeparator === "," ? "," : ".";
  const resolutions = headers.map((header, index) => {
    const base = resolveColumnHeader(header, options);
    if (!rows.length) return base;
    const values = rows.map(row => Array.isArray(row) ? row[index] : null);
    return applyValueProfile(base, values, decimalSeparator);
  });
  const exactByKey = new Map();
  for (const resolution of resolutions) {
    if (!resolution.autoAssignable || !resolution.suggestedKey) continue;
    const key = resolution.suggestedKey;
    const list = exactByKey.get(key) ?? [];
    list.push(resolution.header);
    exactByKey.set(key, list);
  }

  for (const [key, matchedHeaders] of exactByKey) {
    if (matchedHeaders.length < 2) continue;
    for (const resolution of resolutions) {
      if (resolution.suggestedKey !== key || !matchedHeaders.includes(resolution.header)) continue;
      resolution.status = "ambiguous";
      resolution.suggestedKey = null;
      resolution.autoAssignable = false;
      resolution.reason = "Hay más de una columna con coincidencia exacta para este canal. Elegí la correcta; no se preseleccionó ninguna.";
    }
  }

  const assignments = {};
  for (const [key, matchedHeaders] of exactByKey) {
    if (matchedHeaders.length === 1) assignments[key] = matchedHeaders[0];
  }

  const assignedHeaders = new Set(Object.values(assignments));
  return {
    schema: CHANNEL_RESOLVER_VERSION,
    resolutions,
    assignments,
    unmatchedHeaders: resolutions
      .filter(resolution => !assignedHeaders.has(resolution.header))
      .map(resolution => resolution.header),
  };
}
