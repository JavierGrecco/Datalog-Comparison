import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const DATASET = "PedroCuisinier2025/OBD2_panel_opel_2012";
const DATASET_URL = "https://huggingface.co/datasets/" + DATASET;
const API = "https://datasets-server.huggingface.co";
const HELP = [
  "Uso: npm run data:obd-sample -- [opciones]",
  "--offset FILA      Primera fila, desde cero (default 0)",
  "--length CANTIDAD  Entre 1 y 100 (default 100)",
  "--help",
].join("\n");

export function parseObdSampleArgs(args) {
  const options = { offset: 0, length: 100, outputDir: "data/external" };
  let help = false;
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === "--help" || key === "-h") { help = true; continue; }
    if (key === "--offset" || key === "--length") {
      const raw = args[i + 1];
      if (!raw || raw.startsWith("--")) throw new Error(key + " requiere un entero.");
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(key + " debe ser un entero no negativo.");
      options[key === "--offset" ? "offset" : "length"] = value;
      i += 1;
      continue;
    }
    throw new Error("Argumento desconocido: " + key);
  }
  if (options.length < 1 || options.length > 100) throw new RangeError("--length debe estar entre 1 y 100.");
  return { options, help };
}

export function serializeDatasetRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError("No hay filas para exportar.");
  const columns = Object.keys(rows[0]);
  const cell = value => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [columns.map(cell).join(","), ...rows.map(row => columns.map(key => cell(row[key])).join(","))].join("\n") + "\n";
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Datalog-Comparison-public-dataset-sample/1.0" } });
  if (!response.ok) throw new Error("Hugging Face respondió HTTP " + response.status + " para " + url);
  return response.json();
}

async function run(args) {
  const parsed = parseObdSampleArgs(args);
  if (parsed.help) { process.stdout.write(HELP + "\n"); return; }
  const { offset, length, outputDir } = parsed.options;
  const splitInfo = await getJson(API + "/splits?dataset=" + encodeURIComponent(DATASET));
  const firstSplit = splitInfo.splits?.[0];
  if (!firstSplit) throw new Error("La API no publicó splits legibles para este dataset.");
  const query = new URLSearchParams({
    dataset: DATASET, config: firstSplit.config, split: firstSplit.split,
    offset: String(offset), length: String(length),
  });
  const rowsPayload = await getJson(API + "/rows?" + query.toString());
  const rows = (rowsPayload.rows ?? []).map(item => item.row);
  if (!rows.length) throw new Error("La API no devolvió filas para ese offset.");
  const csv = serializeDatasetRows(rows);
  const directory = resolve(process.cwd(), outputDir);
  const filename = "opel-obd2-offset-" + offset + "-rows-" + rows.length + ".csv";
  const csvPath = resolve(directory, filename);
  const attributionPath = csvPath + ".source.json";
  const metadata = {
    dataset: DATASET,
    title: "OBD-II Telemetry — Opel Corsa 1.2 (2012)",
    creator: "PedroCuisinier2025",
    datasetUrl: DATASET_URL,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "PedroCuisinier2025, OBD-II Telemetry — Opel Corsa 1.2 (2012), Hugging Face Datasets",
    retrievedAt: new Date().toISOString(),
    request: { config: firstSplit.config, split: firstSplit.split, offset, requestedRows: length, returnedRows: rows.length },
    sha256: createHash("sha256").update(csv, "utf8").digest("hex"),
    evidenceClass: "measured-with-derived-columns",
    cautions: [
      "Real low-rate OBD-II road telemetry, not a high-frequency motorsport ECU datalog.",
      "TORQUE, POWER, GEAR and fuel-use estimate fields are derived/estimated, not direct sensor readings.",
      "Asynchronous PID refreshes and blank cells are meaningful; do not interpolate them automatically.",
    ],
  };
  await mkdir(dirname(csvPath), { recursive: true });
  await writeFile(csvPath, csv, "utf8");
  await writeFile(attributionPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
  process.stdout.write("CSV: " + csvPath + "\nAttribution: " + attributionPath +
    "\nRows: " + rows.length + "\nSHA-256: " + metadata.sha256 + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + "\n" + HELP + "\n");
    process.exitCode = 1;
  });
}
