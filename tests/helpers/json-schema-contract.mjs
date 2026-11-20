/**
 * Test-only checker for the JSON Schema keywords used by this repository's
 * published contract. It is not a general-purpose JSON Schema implementation.
 */
function resolvePointer(document, pointer) {
  if (!pointer.startsWith("#/")) throw new Error("Unsupported JSON Schema reference: " + pointer);
  return pointer.slice(2).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, key) => value?.[key], document);
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  throw new Error("Unsupported JSON Schema type: " + type);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateJsonSchemaInstance(instance, schema) {
  const errors = [];
  function visit(value, rule, path) {
    if (rule.$ref) {
      const target = resolvePointer(schema, rule.$ref);
      if (!target) throw new Error("Unresolved JSON Schema reference: " + rule.$ref);
      visit(value, target, path);
    }
    for (const nested of rule.allOf ?? []) visit(value, nested, path);
    if (rule.const !== undefined && !equalJson(value, rule.const)) {
      errors.push(path + " must equal " + JSON.stringify(rule.const));
    }
    if (rule.enum && !rule.enum.some(option => equalJson(value, option))) {
      errors.push(path + " is not one of the allowed values");
    }
    if (rule.anyOf && !rule.anyOf.some(option => {
      const before = errors.length;
      visit(value, option, path);
      const valid = errors.length === before;
      errors.splice(before);
      return valid;
    })) errors.push(path + " does not match any allowed schema");

    if (rule.type) {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!types.some(type => typeMatches(value, type))) {
        errors.push(path + " has an invalid type");
        return;
      }
    }
    if (typeof value === "string") {
      if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(path + " is too short");
      if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(path + " is too long");
      if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) errors.push(path + " does not match its pattern");
      if (rule.format === "date-time" &&
          (!Number.isFinite(Date.parse(value)) || !/^\\d{4}-\\d{2}-\\d{2}T.+(?:Z|[+-]\\d{2}:\\d{2})$/.test(value))) {
        errors.push(path + " is not a date-time");
      }
    }
    if (typeof value === "number") {
      if (rule.minimum !== undefined && value < rule.minimum) errors.push(path + " is below minimum");
      if (rule.maximum !== undefined && value > rule.maximum) errors.push(path + " is above maximum");
    }
    if (Array.isArray(value)) {
      if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(path + " has too few items");
      if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(path + " has too many items");
      if (rule.items) value.forEach((item, index) => visit(item, rule.items, path + "[" + index + "]"));
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const required of rule.required ?? []) {
        if (!Object.hasOwn(value, required)) errors.push(path + " is missing required property " + required);
      }
      if (rule.propertyNames) {
        for (const key of Object.keys(value)) visit(key, rule.propertyNames, path + "[propertyName]");
      }
      for (const [key, child] of Object.entries(value)) {
        if (rule.properties && Object.hasOwn(rule.properties, key)) {
          visit(child, rule.properties[key], path + "." + key);
        } else if (rule.additionalProperties === false) {
          errors.push(path + " has unexpected property " + key);
        } else if (rule.additionalProperties && typeof rule.additionalProperties === "object") {
          visit(child, rule.additionalProperties, path + "." + key);
        }
      }
    }
  }
  visit(instance, schema, "$");
  return errors;
}
