#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateImportedComparisonReport } from "../src/imported-comparison-report-validator.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCHEMA_PATH = resolve(SCRIPT_DIRECTORY, "../schemas/imported-run-comparison-1.schema.json");
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;

function usage() {
  return [
    "Valida un informe JSON de Datalog Comparison.",
    "",
    "Uso:",
    "  node scripts/validate-comparison-report.mjs [opciones] <informe.json|->",
    "",
    "Opciones:",
    "  --schema <archivo>  Usar un JSON Schema local alternativo (solo referencias #/...).",
    "  --json              Emitir resultado legible por máquina en JSON.",
    "  --help              Mostrar esta ayuda.",
    "",
    "Usar '-' como entrada lee el informe desde stdin.",
  ].join("\n");
}

function parseArguments(args) {
  let schemaPath = DEFAULT_SCHEMA_PATH;
  let jsonOutput = false;
  let inputPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--json") {
      jsonOutput = true;
      continue;
    }
    if (argument === "--schema") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--schema requiere una ruta de archivo.");
      schemaPath = resolve(value);
      index += 1;
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") throw new Error("Opción desconocida: " + argument);
    if (inputPath !== null) throw new Error("Indicá un solo archivo de entrada.");
    inputPath = argument;
  }
  if (inputPath === null) throw new Error("Falta el archivo de informe.");
  return { schemaPath, jsonOutput, inputPath };
}

async function readBounded(path, maximumBytes, label) {
  if (path === "-") {
    const buffer = await readFile(0);
    if (buffer.byteLength > maximumBytes) throw new RangeError(label + " supera el límite de " + maximumBytes + " bytes.");
    return buffer.toString("utf8");
  }
  const fileStat = await stat(path);
  if (!fileStat.isFile()) throw new Error(label + " no es un archivo regular.");
  if (fileStat.size > maximumBytes) throw new RangeError(label + " supera el límite de " + maximumBytes + " bytes.");
  return readFile(path, "utf8");
}

function emit(jsonOutput, payload, text) {
  if (jsonOutput) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  else process.stdout.write(text + "\n");
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(error.message + "\n\n" + usage() + "\n");
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(usage() + "\n");
    return;
  }

  try {
    const [schemaText, reportText] = await Promise.all([
      readBounded(options.schemaPath, MAX_SCHEMA_BYTES, "El JSON Schema"),
      readBounded(options.inputPath, MAX_INPUT_BYTES, "El informe"),
    ]);
    let schema, report;
    try {
      schema = JSON.parse(schemaText);
    } catch (error) {
      throw new Error("El JSON Schema no es JSON válido: " + error.message);
    }
    try {
      report = JSON.parse(reportText);
    } catch (error) {
      emit(options.jsonOutput, {
        valid: false, input: options.inputPath, schema: schema.$id ?? null,
        errors: ["El informe no es JSON válido: " + error.message],
      }, "Informe inválido: el archivo no contiene JSON válido.");
      process.exitCode = 1;
      return;
    }

    const errors = validateImportedComparisonReport(report, schema);
    const payload = {
      valid: errors.length === 0,
      input: options.inputPath,
      schema: schema.$id ?? null,
      reportSchema: report?.schema ?? null,
      errors,
    };
    if (errors.length) {
      emit(options.jsonOutput, payload,
        "Informe inválido: " + errors.length + " problema(s).\n" + errors.map(item => " - " + item).join("\n"));
      process.exitCode = 1;
      return;
    }
    emit(options.jsonOutput, payload,
      "Informe válido: " + options.inputPath + " cumple " + (schema.$id ?? "el esquema indicado") + ".");
  } catch (error) {
    process.stderr.write("No se pudo validar el informe: " + (error?.message ?? String(error)) + "\n");
    process.exitCode = 2;
  }
}

await main();
