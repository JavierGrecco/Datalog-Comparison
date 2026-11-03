import {
  CSV_CHANNEL_DEFINITIONS,
  MAX_CSV_CHARACTERS,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../src/csv-import.mjs";
import { importHaltechNspCsv, detectHaltechNspCsv } from "../src/adapters/haltech-nsp.mjs";
import { importDynojetPowerCoreCsv } from "../src/adapters/dynojet-powercore.mjs";
import { assessRunDataQuality } from "../src/data-quality.mjs";

const $ = selector => document.querySelector(selector);
const state = {
  file: null, text: null, parsed: null, run: null, quality: null, profile: "generic",
};

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setStatus(message, kind = "neutral") {
  const status = $("#csvImportStatus");
  status.className = "csv-status csv-status-" + kind;
  status.textContent = message;
}

function clearPreview() {
  state.run = null;
  state.quality = null;
  $("#csvPreview").hidden = true;
  $("#csvPreviewSummary").replaceChildren();
  $("#csvQualityTable").replaceChildren();
  $("#csvWarnings").replaceChildren();
  $("#csvSampleTable").replaceChildren();
}

function setProfileControls({ ecu = false, dynojet = false } = {}) {
  $("#csvSourceDomain").disabled = ecu || dynojet;
  $("#csvColumnDelimiter").disabled = ecu;
  $("#csvDecimalSeparator").disabled = ecu;
  $("#csvMeasurementBasisControl").hidden =
    !dynojet && $("#csvSourceDomain").value !== "dyno";
}

function updateMeasurementBasisVisibility() {
  $("#csvMeasurementBasisControl").hidden = $("#csvSourceDomain").value !== "dyno";
}

function renderMappingFields(headers) {
  const host = $("#csvMappingFields");
  host.replaceChildren();

  for (const definition of CSV_CHANNEL_DEFINITIONS) {
    const field = makeElement("div", "csv-map-field");
    const label = makeElement("label", "csv-map-label", definition.label +
      (definition.required ? " · obligatorio" : " · opcional"));
    const select = makeElement("select", "csv-map-select");
    const selectId = "csv-map-" + definition.key;
    select.id = selectId;
    select.dataset.channelKey = definition.key;
    select.required = definition.required;
    select.setAttribute("aria-required", String(definition.required));

    const emptyOption = makeElement("option", "", definition.required
      ? "Seleccionar columna obligatoria" : "No asignar este canal");
    emptyOption.value = "";
    select.append(emptyOption);

    for (const header of headers) {
      const option = makeElement("option", "", header);
      option.value = header;
      select.append(option);
    }

    label.htmlFor = selectId;
    field.append(label, select);

    if (definition.fixedUnit) {
      field.append(makeElement("div", "csv-unit-fixed", "Unidad fija: " + definition.fixedUnit));
    } else {
      const unitLabel = makeElement("label", "csv-unit-label", "Unidad declarada");
      const unitInput = makeElement("input", "csv-unit-input");
      unitInput.type = "text";
      unitInput.maxLength = 32;
      unitInput.placeholder = "Ej.: Nm, hp, kPa, °C";
      unitInput.dataset.unitKey = definition.key;
      unitLabel.append(unitInput);
      field.append(unitLabel);
    }
    host.append(field);
  }
}

function appendTable(container, headers, rows) {
  const table = makeElement("table", "csv-data-table");
  const thead = makeElement("thead");
  const headerRow = makeElement("tr");
  for (const header of headers) headerRow.append(makeElement("th", "", header));
  thead.append(headerRow);

  const tbody = makeElement("tbody");
  for (const values of rows) {
    const row = makeElement("tr");
    for (const value of values) row.append(makeElement("td", "", value));
    tbody.append(row);
  }
  table.append(thead, tbody);
  container.replaceChildren(table);
}

function renderQuality(run, quality) {
  const host = $("#csvQualityTable");
  const channelLabels = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition.label]));
  const rows = quality.channels.map(channel => [
    channelLabels.get(channel.key) ?? channel.key,
    run.units[channel.key] ?? "—",
    channel.validCount + " / " + quality.sampleCount,
    channel.coveragePct.toFixed(2).replace(".", ",") + "%",
    channel.min === null ? "—" : String(channel.min),
    channel.max === null ? "—" : String(channel.max),
  ]);
  appendTable(host,
    ["Canal", "Unidad declarada / normalizada", "Muestras válidas", "Cobertura", "Mínimo", "Máximo"],
    rows,
  );
}

function renderSamplePreview(run) {
  const channelLabels = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition.label]));
  const channelKeys = Object.keys(run.units).filter(key => key !== "time_s");
  const headers = ["Fila", "Tiempo (s)", ...channelKeys.map(key =>
    (channelLabels.get(key) ?? key) + " (" + run.units[key] + ")"
  )];
  const rows = run.samples.slice(0, 8).map((sample, index) => [
    String(index + 2),
    sample.time_s === null ? "—" : String(sample.time_s),
    ...channelKeys.map(key => sample.channels[key] === null ? "—" : String(sample.channels[key])),
  ]);
  appendTable($("#csvSampleTable"), headers, rows);
}

function renderPreview() {
  const { run, quality } = state;
  $("#csvPreview").hidden = false;
  const summary = $("#csvPreviewSummary");
  summary.replaceChildren();

  summary.append(
    makeElement("h3", "", "Archivo inspeccionado: " + run.name),
    makeElement("p", "csv-preview-meta",
      run.sourceType + " · " + run.samples.length + " muestras · " +
      Object.keys(run.units).length + " canales normalizados"),
  );
  if (run.measurementBasisLabel) {
    summary.append(makeElement("p", "csv-preview-meta",
      "Base de torque/potencia declarada: " + run.measurementBasisLabel));
  }
  if (run.importMetadata?.importFormat) {
    summary.append(makeElement("p", "csv-preview-meta",
      "Perfil: " + run.importMetadata.importFormat));
  }

  const metrics = makeElement("div", "csv-preview-metrics");
  const timeStatus = quality.timestamp.missingCount || quality.timestamp.retrogressions ||
      quality.timestamp.duplicateAdjacentTimes
    ? "Requiere revisión" : "Sin alertas temporales visibles";
  const qualityLabel = quality.status === "insufficient_data"
    ? "Datos insuficientes"
    : quality.status === "review_required"
      ? "Requiere revisión" : "Sin alertas estructurales visibles";
  for (const [label, value] of [
    ["Muestras", quality.sampleCount],
    ["Calidad estructural", qualityLabel],
    ["Secuencia temporal", timeStatus],
    ["Tiempo válido", quality.timestamp.validCount + " / " + quality.sampleCount],
  ]) {
    const card = makeElement("div", "csv-metric");
    card.append(makeElement("span", "csv-metric-label", label),
      makeElement("strong", "csv-metric-value", value));
    metrics.append(card);
  }
  summary.append(metrics);

  const warnings = $("#csvWarnings");
  warnings.replaceChildren();
  const allWarnings = [...run.warnings, ...quality.warnings];
  if (allWarnings.length) {
    warnings.append(makeElement("h4", "", "Advertencias y límites"));
    const list = makeElement("ul");
    for (const warning of [...new Set(allWarnings)]) list.append(makeElement("li", "", warning));
    warnings.append(list);
  } else {
    warnings.append(makeElement("p", "csv-no-warnings",
      "No se detectaron alertas estructurales en las comprobaciones disponibles. Esto no valida el ensayo."));
  }
  renderQuality(run, quality);
  renderSamplePreview(run);
}

function selectedDelimiter() {
  const selected = $("#csvColumnDelimiter").value;
  return selected === "tab" ? "\t" : selected;
}

function showGenericMapping(parsed, profile) {
  state.parsed = parsed;
  state.profile = profile;
  renderMappingFields(parsed.headers);
  $("#csvMappingSection").hidden = false;
  $("#csvInspectButton").disabled = false;
  $("#csvInspectButton").textContent = profile === "dynojet"
    ? "Inspeccionar CSV Dynojet" : "Inspeccionar CSV";
  if (profile === "dynojet") $("#csvSourceDomain").value = "dyno";
  setProfileControls({ dynojet: profile === "dynojet" });
  const warningText = parsed.warnings.length ? " Hay advertencias de estructura para revisar." : "";
  const profileText = profile === "dynojet"
    ? "Perfil PowerCore/WinPEP seleccionado: asigná canales y declar á la base de medición."
    : "Asigná tiempo y RPM antes de inspeccionarlo.";
  setStatus("Archivo leído localmente: " + parsed.headers.length + " columnas y " +
    parsed.rows.length + " filas de datos. " + profileText + warningText,
  parsed.warnings.length ? "warning" : "success");
}

function parseLoadedText() {
  if (!state.text) return;
  clearPreview();
  state.parsed = null;
  $("#csvMappingSection").hidden = true;
  $("#csvInspectButton").disabled = true;

  const selectedProfile = $("#csvFormatProfile").value;
  const profile = selectedProfile === "auto"
    ? (detectHaltechNspCsv(state.text) ? "haltech" : "generic")
    : selectedProfile;

  try {
    if (profile === "haltech") {
      setProfileControls({ ecu: true });
      $("#csvSourceDomain").value = "ecu";
      $("#csvColumnDelimiter").value = ",";
      $("#csvDecimalSeparator").value = ".";
      const run = importHaltechNspCsv(state.text, {
        id: "haltech-nsp-local-" + Date.now(),
        name: state.file?.name,
        importedAt: new Date().toISOString(),
      });
      state.profile = "haltech";
      state.run = run;
      state.quality = assessRunDataQuality(run);
      renderPreview();
      setStatus("Se reconoció la variante Haltech NSP %DataLog%. Se normalizaron los canales soportados; revisá los canales excluidos y las reglas de conversión.",
        state.quality.status === "no_obvious_issues" ? "success" : "warning");
      return;
    }

    setProfileControls();
    if (profile === "dynojet") {
      $("#csvSourceDomain").value = "dyno";
      setProfileControls({ dynojet: true });
    }
    const parsed = parseCsvText(state.text, { delimiter: selectedDelimiter() });
    showGenericMapping(parsed, profile);
  } catch (error) {
    const detail = error instanceof CsvImportError ? " [" + error.code + "]" : "";
    setStatus((error?.message ?? "No se pudo leer el archivo.") + detail, "error");
  }
}

async function handleFileSelection() {
  clearPreview();
  state.file = null;
  state.text = null;
  state.parsed = null;
  $("#csvMappingSection").hidden = true;
  $("#csvInspectButton").disabled = true;
  const file = $("#csvFile").files?.[0];
  if (!file) {
    setStatus("Seleccioná un archivo CSV para comenzar.");
    return;
  }
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".csv")) {
    setStatus("El archivo debe tener extensión .csv.", "error");
    return;
  }
  if (file.size > MAX_CSV_CHARACTERS) {
    setStatus("El archivo supera el límite de 10 MB de esta demo.", "error");
    return;
  }
  try {
    const text = await file.text();
    if ($("#csvFile").files?.[0] !== file) return;
    state.file = file;
    state.text = text;
    parseLoadedText();
  } catch (error) {
    const detail = error instanceof CsvImportError ? " [" + error.code + "]" : "";
    setStatus((error?.message ?? "No se pudo leer el archivo.") + detail, "error");
  }
}

function handleImport(event) {
  event.preventDefault();
  if (state.profile === "haltech" && state.run) {
    setStatus("La inspección Haltech NSP ya se completó. El registro permanece aislado de la matriz.", "success");
    return;
  }
  clearPreview();
  if (!state.file || !state.parsed) {
    setStatus("Seleccioná y leé un archivo CSV antes de continuar.", "error");
    return;
  }

  const channelMapping = {};
  const units = {};
  for (const select of $("#csvMappingFields").querySelectorAll("select[data-channel-key]")) {
    if (select.value) channelMapping[select.dataset.channelKey] = select.value;
  }
  for (const input of $("#csvMappingFields").querySelectorAll("input[data-unit-key]")) {
    if (input.value.trim()) units[input.dataset.unitKey] = input.value.trim();
  }

  const sourceDomain = state.profile === "dynojet" ? "dyno" : $("#csvSourceDomain").value;
  const measurementBasis = sourceDomain === "dyno" ? $("#csvMeasurementBasis").value : null;
  const options = {
    id: "csv-local-" + Date.now(),
    name: state.file.name,
    sourceDomain,
    channelMapping,
    units,
    decimalSeparator: $("#csvDecimalSeparator").value,
    importedAt: new Date().toISOString(),
    measurementBasis,
  };

  try {
    const run = state.profile === "dynojet"
      ? importDynojetPowerCoreCsv(state.parsed, options)
      : mapCsvToRun(state.parsed, options);
    const quality = assessRunDataQuality(run);
    state.run = run;
    state.quality = quality;
    renderPreview();
    setStatus("Inspección completada. El archivo permanece en memoria local y no se agregó a la matriz de comparación.",
      quality.status === "no_obvious_issues" ? "success" : "warning");
  } catch (error) {
    const detail = error instanceof CsvImportError ? " [" + error.code + "]" : "";
    setStatus((error?.message ?? "No se pudo inspeccionar el archivo.") + detail, "error");
  }
}

function reset() {
  state.file = null;
  state.text = null;
  state.parsed = null;
  state.run = null;
  state.quality = null;
  state.profile = "generic";
  clearPreview();
  $("#csvFile").value = "";
  $("#csvFormatProfile").value = "auto";
  $("#csvSourceDomain").value = "";
  $("#csvSourceDomain").disabled = false;
  $("#csvDecimalSeparator").value = ".";
  $("#csvDecimalSeparator").disabled = false;
  $("#csvColumnDelimiter").value = "auto";
  $("#csvColumnDelimiter").disabled = false;
  $("#csvMeasurementBasis").value = "";
  $("#csvMeasurementBasisControl").hidden = true;
  $("#csvMappingFields").replaceChildren();
  $("#csvMappingSection").hidden = true;
  $("#csvInspectButton").disabled = true;
  $("#csvInspectButton").textContent = "Inspeccionar CSV";
  setStatus("Seleccioná un archivo CSV para comenzar.");
}

export function initializeCsvInspector() {
  const form = $("#csvImportForm");
  if (!form) return;
  $("#csvFile").addEventListener("change", handleFileSelection);
  $("#csvFormatProfile").addEventListener("change", parseLoadedText);
  $("#csvColumnDelimiter").addEventListener("change", parseLoadedText);
  $("#csvSourceDomain").addEventListener("change", updateMeasurementBasisVisibility);
  $("#csvDecimalSeparator").addEventListener("change", () => {
    if (state.parsed) setStatus("Separador decimal actualizado. Se aplicará al validar los valores numéricos.");
  });
  form.addEventListener("submit", handleImport);
  $("#csvClearButton").addEventListener("click", reset);
  setStatus("Seleccioná un archivo CSV para comenzar.");
}
