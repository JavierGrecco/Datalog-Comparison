/**
 * Contract-focused JSON Schema validator for Datalog Comparison reports.
 *
 * Supports every validation keyword used by the published Draft 2020-12
 * report schema. This is intentionally not a general-purpose JSON Schema
 * implementation; the published schema is the authoritative contract.
 */
function resolvePointer(document, pointer) {
  if (!pointer.startsWith("#/")) throw new Error("Only local JSON Pointer references are supported: " + pointer);
  return pointer.slice(2).split("/")
    .map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, key) => value?.[key], document);
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  throw new Error("Unsupported JSON Schema type: " + type);
}

function equalJson(left, right) {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function isDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 &&
    day >= 1 && day <= monthDays[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHour <= 23 && offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value));
}

export function validateJsonSchemaInstance(instance, schema, { maxErrors = 100 } = {}) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new TypeError("El esquema JSON debe ser un objeto.");
  }
  if (!Number.isSafeInteger(maxErrors) || maxErrors < 1 || maxErrors > 1000) {
    throw new RangeError("maxErrors debe estar entre 1 y 1000.");
  }

  const errors = [];
  const addError = message => {
    if (errors.length < maxErrors) errors.push(message);
  };

  function visit(value, rule, path) {
    if (errors.length >= maxErrors) return;
    if (rule.$ref) {
      const target = resolvePointer(schema, rule.$ref);
      if (!target || typeof target !== "object") throw new Error("Referencia JSON Schema no resuelta: " + rule.$ref);
      visit(value, target, path);
    }
    for (const nested of rule.allOf ?? []) visit(value, nested, path);

    if (rule.const !== undefined && !equalJson(value, rule.const)) {
      addError(path + " debe ser " + JSON.stringify(rule.const));
    }
    if (rule.enum && !rule.enum.some(option => equalJson(value, option))) {
      addError(path + " no pertenece a los valores permitidos");
    }
    if (rule.anyOf && !rule.anyOf.some(option => {
      const before = errors.length;
      visit(value, option, path);
      const valid = errors.length === before;
      errors.splice(before);
      return valid;
    })) {
      addError(path + " no coincide con ninguna estructura permitida");
    }

    if (rule.type) {
      const allowedTypes = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!allowedTypes.some(type => typeMatches(value, type))) {
        addError(path + " tiene un tipo inválido");
        return;
      }
    }

    if (typeof value === "string") {
      const length = [...value].length;
      if (rule.minLength !== undefined && length < rule.minLength) addError(path + " es demasiado corto");
      if (rule.maxLength !== undefined && length > rule.maxLength) addError(path + " excede la longitud permitida");
      if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) addError(path + " no cumple el patrón requerido");
      if (rule.format === "date-time" && !isDateTime(value)) addError(path + " no es una fecha ISO date-time válida");
    }

    if (typeof value === "number") {
      if (rule.minimum !== undefined && value < rule.minimum) addError(path + " es menor al mínimo");
      if (rule.maximum !== undefined && value > rule.maximum) addError(path + " supera el máximo");
    }

    if (Array.isArray(value)) {
      if (rule.minItems !== undefined && value.length < rule.minItems) addError(path + " contiene menos elementos de los requeridos");
      if (rule.maxItems !== undefined && value.length > rule.maxItems) addError(path + " contiene más elementos de los permitidos");
      if (rule.items) value.forEach((item, index) => visit(item, rule.items, path + "[" + index + "]"));
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const required of rule.required ?? []) {
        if (!Object.hasOwn(value, required)) addError(path + " no contiene la propiedad obligatoria " + required);
      }
      if (rule.propertyNames) {
        for (const key of Object.keys(value)) visit(key, rule.propertyNames, path + "[nombre de propiedad]");
      }
      for (const [key, child] of Object.entries(value)) {
        if (rule.properties && Object.hasOwn(rule.properties, key)) {
          visit(child, rule.properties[key], path + "." + key);
        } else if (rule.additionalProperties === false) {
          addError(path + " contiene la propiedad no permitida " + key);
        } else if (rule.additionalProperties && typeof rule.additionalProperties === "object") {
          visit(child, rule.additionalProperties, path + "." + key);
        }
      }
    }
  }

  visit(instance, schema, "$");
  return errors;
}

function approximatelyEqual(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Validates both the published schema and domain invariants specific to the
 * independent-distribution comparison report.
 */
export function validateImportedComparisonReport(report, schema, { maxErrors = 100 } = {}) {
  const errors = validateJsonSchemaInstance(report, schema, { maxErrors });
  if (errors.length) return errors;
  const add = message => {
    if (errors.length < maxErrors) errors.push(message);
  };

  if (report.channels.length && (
    report.reference.domain === "unknown" ||
    report.reference.domain !== report.candidate.domain
  )) {
    add("$.channels: no puede haber estadísticas comparables entre dominios distintos o sin clasificar");
  }

  const acceptedKeys = new Set();
  for (const [index, channel] of report.channels.entries()) {
    const path = "$.channels[" + index + "]";
    if (acceptedKeys.has(channel.key)) add(path + ".key: canal duplicado");
    acceptedKeys.add(channel.key);

    for (const [role, run] of [["reference", report.reference], ["candidate", report.candidate]]) {
      const statistics = channel[role];
      if (statistics.sampleCount !== run.sampleCount) {
        add(path + "." + role + ".sampleCount: no coincide con el total del registro");
      }
      if (statistics.validCount > statistics.sampleCount) {
        add(path + "." + role + ".validCount: supera la cantidad de muestras");
      }
      const expectedCoverage = statistics.sampleCount
        ? statistics.validCount / statistics.sampleCount * 100
        : 0;
      if (!approximatelyEqual(statistics.coveragePct, expectedCoverage)) {
        add(path + "." + role + ".coveragePct: no coincide con validCount/sampleCount");
      }
      if (statistics.min > statistics.median || statistics.median > statistics.max ||
          statistics.mean < statistics.min - 1e-9 || statistics.mean > statistics.max + 1e-9) {
        add(path + "." + role + ": min, media, mediana y max no mantienen un orden estadístico válido");
      }
      if (statistics.coveragePct + 1e-9 < report.minimumCoveragePct) {
        add(path + "." + role + ".coveragePct: está por debajo del umbral publicado");
      }
      if (run.units[channel.key] !== channel.unit) {
        add(path + "." + role + ": la unidad no coincide con el contrato de unidades del registro");
      }
    }

    const { reference, candidate, difference } = channel;
    const expected = {
      median: candidate.median - reference.median,
      mean: candidate.mean - reference.mean,
      min: candidate.min - reference.min,
      max: candidate.max - reference.max,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (!approximatelyEqual(difference[key], value)) {
        add(path + ".difference." + key + ": no coincide con candidata menos referencia");
      }
    }
    const expectedMedianPct = Math.abs(reference.median) > Number.EPSILON
      ? expected.median / Math.abs(reference.median) * 100
      : null;
    if (expectedMedianPct === null
      ? difference.medianPct !== null
      : !approximatelyEqual(difference.medianPct, expectedMedianPct)) {
      add(path + ".difference.medianPct: no coincide con la fórmula documentada");
    }
  }

  const excludedKeys = new Set();
  for (const [index, channel] of report.excludedChannels.entries()) {
    const path = "$.excludedChannels[" + index + "]";
    if (excludedKeys.has(channel.key)) add(path + ".key: canal excluido duplicado");
    if (acceptedKeys.has(channel.key)) add(path + ".key: un canal no puede estar incluido y excluido a la vez");
    excludedKeys.add(channel.key);
    for (const [role, count, coverage] of [
      ["reference", channel.referenceCount, channel.referenceCoveragePct],
      ["candidate", channel.candidateCount, channel.candidateCoveragePct],
    ]) {
      const run = report[role];
      if (count !== null && count > run.sampleCount) {
        add(path + "." + role + "Count: supera la cantidad de muestras del registro");
      }
      if (count !== null && coverage !== null) {
        const expectedCoverage = run.sampleCount ? count / run.sampleCount * 100 : 0;
        if (!approximatelyEqual(coverage, expectedCoverage)) {
          add(path + "." + role + "CoveragePct: no coincide con el recuento de valores");
        }
      }
    }
  }

  const sameHash = report.reference.sha256 && report.reference.sha256 === report.candidate.sha256;
  const sameId = report.reference.id && report.reference.id === report.candidate.id;
  if ((sameHash || sameId) && (report.status !== "blocked" || report.channels.length !== 0)) {
    add("$.status: dos orígenes con la misma huella o identidad deben quedar bloqueados");
  }
  if (report.status === "blocked" && (report.channels.length !== 0 || report.blockedReasons.length === 0)) {
    add("$.status: una comparación bloqueada no puede incluir estadísticas y debe explicar el bloqueo");
  }
  if (report.status !== "blocked" && report.channels.length === 0) {
    add("$.channels: una comparación no bloqueada necesita al menos un canal estadístico");
  }

  return errors;
}
