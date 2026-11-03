import {
  CSV_CHANNEL_DEFINITIONS,
  MAX_CSV_CHARACTERS,
  CsvImportError,
  mapCsvToRun,
  parseCsvText,
} from "../src/csv-import.mjs";
import { suggestColumnMappings } from "../src/channel-resolver.mjs";
import { importHaltechNspCsv, detectHaltechNspCsv } from "../src/adapters/haltech-nsp.mjs";
import { importDynojetPowerCoreCsv } from "../src/adapters/dynojet-powercore.mjs";
import { assessRunDataQuality } from "../src/data-quality.mjs";
import { DEFAULT_PREVIEW_SAMPLE_LIMIT, selectPreviewSamples } from "../src/sample-selection.mjs";
import { DEFAULT_CONTINUOUS_CHANNELS, buildRpmSweepCurves, resampleTimeBasedSignals } from "../src/signal-processing.mjs";

const $ = selector => document.querySelector(selector);
const state = {
  file: null, text: null, parsed: null, run: null, quality: null, profile: "generic",
  columnSuggestions: null, derivedResult: null,
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
  state.derivedResult = null;
  $("#csvDerivedTools").hidden = true;
  $("#csvDerivedTimeControls").hidden = true;
  $("#csvDerivedDynoControls").hidden = true;
  $("#csvDerivedResults").replaceChildren();
  setDerivedStatus("Seleccioná una operación para generar una vista derivada.");
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

function renderMappingFields(parsed, sourceDomain = "unknown") {
  const host = $("#csvMappingFields");
  host.replaceChildren();

  const suggestions = suggestColumnMappings(parsed.headers, {
    sourceDomain,
    rows: parsed.rows,
    decimalSeparator: $("#csvDecimalSeparator").value,
  });
  state.columnSuggestions = suggestions;
  const byHeader = new Map(suggestions.resolutions.map(item => [item.header, item]));
  const assignments = suggestions.assignments;

  const reviewItems = suggestions.resolutions.filter(item => item.status !== "exact" ||
    !item.autoAssignable || item.unit?.raw);
  if (reviewItems.length) {
    const summary = makeElement("div", "csv-recognition-summary");
    summary.append(makeElement("strong", "", "Reconocimiento local de columnas"));
    summary.append(makeElement("p", "", "Las coincidencias exactas se preseleccionan para revisión. Los posibles errores de tipeo y las inferencias por unidad nunca se asignan automáticamente."));
    const list = makeElement("ul", "csv-recognition-list");
    for (const item of reviewItems.slice(0, 12)) {
      const candidateLabels = [...new Set(item.candidates.map(candidate => candidate.label))].join(" / ");
      const unitText = item.unit?.raw ? " · unidad " + item.unit.raw : "";
      const stateText = item.status === "fuzzy"
        ? "Posible error de tipeo"
        : item.status === "review_unit_only"
          ? "Solo dimensión de unidad"
          : item.status === "conflict"
            ? "Conflicto de unidad"
            : item.status === "review_values_only"
              ? "Rango numérico orientativo"
              : item.status === "ambiguous"
              ? "Requiere contexto"
              : item.status === "unsupported"
                ? "Variante no soportada"
                : item.status === "exact" && item.autoAssignable
                  ? "Coincidencia exacta preseleccionada"
                  : "Sin asignación automática";
      const profileText = item.valueProfile
        ? "Rango observado " + item.valueProfile.min + "–" + item.valueProfile.max +
          " (muestra " + item.valueProfile.numericCount + "/" + item.valueProfile.sampleCount + ")"
        : "";
      const detail = [stateText, candidateLabels, profileText, item.reason].filter(Boolean).join(" · ");
      list.append(makeElement("li", "", item.header + unitText + " — " + detail));
    }
    if (reviewItems.length > 12) {
      list.append(makeElement("li", "", "Y " + (reviewItems.length - 12) + " columnas más; revisá sus encabezados en la asignación manual."));
    }
    summary.append(list);
    host.append(summary);
  }

  for (const definition of CSV_CHANNEL_DEFINITIONS) {
    const field = makeElement("div", "csv-map-field");
    const label = makeElement("label", "csv-map-label", definition.label +
      (definition.required ? " · obligatorio" : definition.axis ? " · eje" : " · opcional"));
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

    for (const header of parsed.headers) {
      const option = makeElement("option", "", header);
      option.value = header;
      select.append(option);
    }
    if (assignments[definition.key]) select.value = assignments[definition.key];

    label.htmlFor = selectId;
    field.append(label, select);

    const unitLabel = makeElement("label", "csv-unit-label", "Unidad de origen");
    const unitInput = makeElement("input", "csv-unit-input");
    unitInput.type = "text";
    unitInput.maxLength = 32;
    unitInput.placeholder = "Ej.: Nm, hp, kPa, °C";
    unitInput.dataset.unitKey = definition.key;
    const suggestedUnit = byHeader.get(select.value)?.unit?.raw;
    unitInput.value = suggestedUnit || definition.defaultUnit || "";
    unitLabel.append(unitInput);
    field.append(unitLabel);

    const updateUnitSuggestion = () => {
      const resolution = byHeader.get(select.value);
      if (resolution?.unit?.raw) {
        unitInput.value = resolution.unit.raw;
        unitInput.dataset.unitSource = "header";
      } else {
        unitInput.dataset.unitSource = "default";
        unitInput.value = definition.defaultUnit || "";
      }
      unitInput.dataset.previousHeader = select.value;
    };
    unitInput.dataset.previousHeader = select.value;
    select.addEventListener("change", updateUnitSuggestion);
    if (suggestedUnit) unitInput.dataset.unitSource = "header";

    const relevant = suggestions.resolutions.filter(item =>
      item.suggestedKey === definition.key ||
      item.candidates.some(candidate => candidate.key === definition.key));
    if (relevant.length) {
      const hint = makeElement("p", "csv-map-hint");
      const best = relevant[0];
      if (best.status === "fuzzy") {
        hint.textContent = "Posible variante o error de tipeo: " + best.header +
          ". Sugerencia: revisar " + definition.label + "; no se preselecciona.";
      } else if (best.status === "review_unit_only") {
        hint.textContent = "La unidad " + best.unit.raw + " indica la dimensión " +
          best.unit.dimension + ", pero no identifica por sí sola el canal.";
      } else if (best.status === "conflict") {
        hint.textContent = "La unidad del encabezado contradice la dimensión esperada. Corregí la unidad antes de importar.";
      } else if (best.status === "review_values_only") {
        hint.textContent = "El rango numérico es compatible con " +
          [...new Set(best.candidates.map(candidate => candidate.label))].join(" / ") +
          ", pero no identifica la señal ni su unidad. Revisá origen y documentación del logger.";
      } else if (best.status === "ambiguous") {
        hint.textContent = best.reason;
      } else if (best.autoAssignable) {
        hint.textContent = "Coincidencia exacta detectada. Revisá encabezado y unidad antes de importar.";
      }
      if (hint.textContent) field.append(hint);
    } else if (definition.defaultUnit) {
      field.append(makeElement("p", "csv-map-hint",
        "Unidad predeterminada " + definition.defaultUnit + "; podés corregirla si el archivo usa otra unidad."));
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
    Number.isFinite(channel.sampling?.medianObservedRateHz)
      ? channel.sampling.medianObservedRateHz.toFixed(2).replace(".", ",") + " Hz"
      : "—",
    Number.isFinite(channel.sampling?.relativeJitterPct)
      ? channel.sampling.relativeJitterPct.toFixed(2).replace(".", ",") + "%"
      : "—",
  ]);
  appendTable(host,
    ["Canal", "Unidad declarada / normalizada", "Muestras válidas", "Cobertura", "Mínimo", "Máximo", "Hz observado", "Jitter MAD"],
    rows,
  );
}

function renderSamplePreview(run) {
  const channelLabels = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition.label]));
  const channelKeys = Object.keys(run.units).filter(key => key !== "time_s");
  const headers = ["Muestra", "Tiempo (s)", ...channelKeys.map(key =>
    (channelLabels.get(key) ?? key) + " (" + run.units[key] + ")"
  )];
  const selected = selectPreviewSamples(run.samples, { limit: DEFAULT_PREVIEW_SAMPLE_LIMIT });
  const rows = selected.map(({ index, sample }) => [
    String(index + 1),
    sample.time_s === null ? "—" : String(sample.time_s),
    ...channelKeys.map(key => sample.channels[key] === null ? "—" : String(sample.channels[key])),
  ]);
  const host = $("#csvSampleTable");
  appendTable(host, headers, rows);
  if (selected.length < run.samples.length) {
    host.append(makeElement("p", "csv-preview-meta",
      "Vista representativa: " + selected.length + " de " + run.samples.length +
      " muestras, distribuidas por el orden original. Los datos completos del registro permanecen intactos."));
  }
}

function setDerivedStatus(message, kind = "neutral") {
  const status = $("#csvDerivedStatus");
  status.className = "csv-derived-status" + (kind === "neutral" ? "" : " csv-derived-status-" + kind);
  status.textContent = message;
}

function updateTimeRatePreview() {
  if (!state.quality) return;
  const interval = state.quality.timestamp.positiveIntervalMedianSeconds;
  const factor = Number($("#csvTimeDecimationFactor").value);
  const sourceRate = interval > 0 ? 1 / interval : null;
  const targetRate = sourceRate !== null ? sourceRate / factor : null;
  $("#csvTimeRatePreview").textContent = Number.isFinite(targetRate)
    ? "Tasa observada ≈ " + sourceRate.toFixed(2) + " Hz · salida nominal ≈ " +
      targetRate.toFixed(2) + " Hz · factor entero " + factor
    : "No se pudo estimar una tasa de origen desde el tiempo observado.";
}

function renderDerivedProcessing(run, quality) {
  const panel = $("#csvDerivedTools");
  const timeControls = $("#csvDerivedTimeControls");
  const dynoControls = $("#csvDerivedDynoControls");
  const continuousChannels = Object.keys(DEFAULT_CONTINUOUS_CHANNELS)
    .filter(key => Object.hasOwn(run.units, key));
  const timeAvailable = run.sourceDomain === "ecu" && run.units.time_s === "s" &&
    Number.isFinite(quality.timestamp.positiveIntervalMedianSeconds) &&
    quality.timestamp.validCount === run.samples.length &&
    continuousChannels.length > 0;
  const dynoAvailable = run.sourceDomain === "dyno" && run.units.rpm === "RPM" &&
    ["torque_nm", "power_kw"].some(key => Object.hasOwn(run.units, key)) &&
    Boolean(run.measurementBasis);
  timeControls.hidden = !timeAvailable;
  dynoControls.hidden = !dynoAvailable;
  panel.hidden = !timeAvailable && !dynoAvailable;
  $("#csvDerivedResults").replaceChildren();
  state.derivedResult = null;
  setDerivedStatus("Seleccioná una operación para generar una vista derivada.");
  if (timeAvailable) updateTimeRatePreview();
  if (dynoAvailable) {
    $("#csvDynoCurveButton").textContent = "Construir curvas por RPM";
  }
}

function renderTimeDerivedResult(result) {
  const host = $("#csvDerivedResults");
  host.replaceChildren();
  host.append(makeElement("p", "csv-preview-meta",
    "Artefacto " + result.algorithm + " · " + result.sourceSampleCount +
    " muestras de origen · " + result.axis.estimatedSourceRateHz.toFixed(2) +
    " Hz → " + result.axis.targetRateHz.toFixed(2) + " Hz · FIR " +
    result.parameters.filter.taps + " coeficientes · fase cero offline."));
  for (const [key, signal] of Object.entries(result.signals)) {
    const card = makeElement("article", "csv-derived-card");
    const label = CSV_CHANNEL_DEFINITIONS.find(item => item.key === key)?.label ?? key;
    card.append(
      makeElement("h4", "", label + " · " + signal.unit),
      makeElement("p", "", signal.outputSampleCount + " muestras derivadas · " +
        signal.segments.length + " segmentos · " + signal.method),
    );
    const points = signal.segments.flatMap(segment => segment.samples);
    if (points.length) {
      const selected = selectPreviewSamples(points, { limit: DEFAULT_PREVIEW_SAMPLE_LIMIT });
      const rows = selected.map(({ sample }) => [
        String(sample.sourceSampleIndex + 1),
        sample.time_s.toFixed(4),
        Number(sample.value).toFixed(5),
      ]);
      const tableHost = makeElement("div", "csv-table-wrap");
      appendTable(tableHost, ["Muestra fuente", "Tiempo (s)", "Valor (" + signal.unit + ")"], rows);
      card.append(tableHost);
    }
    for (const warning of signal.warnings) card.append(makeElement("p", "csv-preview-meta", warning));
    host.append(card);
  }
  for (const warning of result.warnings) {
    host.append(makeElement("p", "csv-preview-meta", warning));
  }
}

function renderDynoDerivedResult(result) {
  const host = $("#csvDerivedResults");
  host.replaceChildren();
  host.append(makeElement("p", "csv-preview-meta",
    "Artefacto " + result.algorithm + " · " + result.sourceSampleCount +
    " muestras de origen · base física: " + result.measurementBasis +
    " · bandas de " + result.axis.binWidth + " RPM."));
  for (const curve of result.curves) {
    const card = makeElement("article", "csv-derived-card");
    card.append(makeElement("h4", "",
      "Barrido " + curve.sweepIndex + " · " + curve.rpmRange.min.toFixed(0) +
      "–" + curve.rpmRange.max.toFixed(0) + " RPM"));
    card.append(makeElement("p", "", curve.sourceSampleCount + " muestras de origen · " +
      curve.sourceStartSampleIndex + "–" + curve.sourceEndSampleIndex +
      " · barrido ascendente independiente."));
    for (const [key, channel] of Object.entries(curve.channels)) {
      const title = key === "torque_nm" ? "Torque" : "Potencia";
      const peak = channel.peak
        ? "Pico por banda: " + channel.peak.value.toFixed(2) + " " + channel.unit +
          " a " + channel.peak.rpm.toFixed(0) + " RPM."
        : "No hay suficientes bandas para identificar un pico.";
      card.append(makeElement("h5", "", title + " · " + channel.unit));
      card.append(makeElement("p", "", peak));
      const tableHost = makeElement("div", "csv-table-wrap");
      const rows = channel.bins.map(bin => [
        bin.rpmLower + "–" + bin.rpmUpper,
        bin.rpmMedian.toFixed(0),
        bin.valueMedian.toFixed(2),
        bin.valueMin.toFixed(2) + "–" + bin.valueMax.toFixed(2),
        String(bin.sampleCount),
      ]);
      appendTable(tableHost, ["Banda RPM", "RPM mediana", "Valor mediano", "Mín.–Máx.", "Muestras"], rows);
      card.append(tableHost);
    }
    host.append(card);
  }
  for (const warning of result.warnings) host.append(makeElement("p", "csv-preview-meta", warning));
}

function handleTimeDerivedProcessing() {
  if (!state.run || !state.quality) return;
  try {
    const factor = Number($("#csvTimeDecimationFactor").value);
    const medianInterval = state.quality.timestamp.positiveIntervalMedianSeconds;
    const sourceRate = 1 / medianInterval;
    const channels = Object.keys(DEFAULT_CONTINUOUS_CHANNELS)
      .filter(key => Object.hasOwn(state.run.units, key));
    const result = resampleTimeBasedSignals(state.run, {
      targetRateHz: sourceRate / factor,
      channels,
    });
    state.derivedResult = result;
    renderTimeDerivedResult(result);
    setDerivedStatus(
      "Procesamiento temporal completado. Se mantuvo la fuente original y se generó un artefacto separado.",
      result.warnings.length ? "warning" : "success",
    );
  } catch (error) {
    const code = error?.code ? " [" + error.code + "]" : "";
    setDerivedStatus((error?.message ?? "No se pudo procesar la señal.") + code, "error");
  }
}

function handleDynoDerivedProcessing() {
  if (!state.run) return;
  try {
    const result = buildRpmSweepCurves(state.run, {
      rpmBinWidth: Number($("#csvDynoBinWidth").value),
    });
    state.derivedResult = result;
    renderDynoDerivedResult(result);
    setDerivedStatus(
      result.curves.length
        ? result.curves.length + " barrido(s) detectado(s). No se suavizaron ni mezclaron las tiradas."
        : "No se detectaron barridos suficientes para generar curvas.",
      result.status === "ready" ? "success" : "warning",
    );
  } catch (error) {
    const code = error?.code ? " [" + error.code + "]" : "";
    setDerivedStatus((error?.message ?? "No se pudieron construir las curvas.") + code, "error");
  }
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
  const conversions = Object.entries(run.importMetadata?.unitConversions ?? {});
  if (conversions.length) {
    const labels = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition.label]));
    summary.append(makeElement("p", "csv-preview-meta",
      "Unidades normalizadas: " + conversions.map(([key, item]) =>
        (labels.get(key) ?? key) + " · " + item.from + " → " + item.to
      ).join(" · ")));
  }
  const medianInterval = quality.timestamp.positiveIntervalMedianSeconds;
  if (!quality.timestamp.available && quality.timestamp.axis === "rpm") {
    summary.append(makeElement("p", "csv-preview-meta",
      "El archivo no incluye tiempo. Se conserva el orden original y se analiza el eje RPM cuando existe; no se calcula frecuencia temporal, duración ni sincronización."));
  }
  if (Number.isFinite(medianInterval)) {
    summary.append(makeElement("p", "csv-preview-meta",
      "Intervalo temporal mediano observado: " + (medianInterval * 1000).toFixed(2) +
      " ms. No equivale a verificar la frecuencia configurada en el logger o dinamómetro."));
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
  renderDerivedProcessing(run, quality);
}

function selectedDelimiter() {
  const selected = $("#csvColumnDelimiter").value;
  return selected === "tab" ? "\t" : selected;
}

function showGenericMapping(parsed, profile) {
  state.parsed = parsed;
  state.profile = profile;
  if (profile === "dynojet") $("#csvSourceDomain").value = "dyno";
  renderMappingFields(parsed, profile === "dynojet" ? "dyno" : ($("#csvSourceDomain").value || "unknown"));
  $("#csvMappingSection").hidden = false;
  $("#csvInspectButton").disabled = false;
  $("#csvInspectButton").textContent = profile === "dynojet"
    ? "Inspeccionar CSV Dynojet" : "Inspeccionar CSV";
  setProfileControls({ dynojet: profile === "dynojet" });
  const warningText = parsed.warnings.length ? " Hay advertencias de estructura para revisar." : "";
  const profileText = profile === "dynojet"
    ? "Perfil PowerCore/WinPEP seleccionado: asigná canales y declarar la base de medición."
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
  state.columnSuggestions = null;
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
  $("#csvTimeDecimationFactor").addEventListener("change", updateTimeRatePreview);
  $("#csvTimeDeriveButton").addEventListener("click", handleTimeDerivedProcessing);
  $("#csvDynoCurveButton").addEventListener("click", handleDynoDerivedProcessing);
  $("#csvFormatProfile").addEventListener("change", parseLoadedText);
  $("#csvColumnDelimiter").addEventListener("change", parseLoadedText);
  $("#csvSourceDomain").addEventListener("change", updateMeasurementBasisVisibility);
  $("#csvDecimalSeparator").addEventListener("change", () => {
    if (!state.parsed || state.profile === "haltech") return;
    const previousMappings = Object.fromEntries(
      [...$("#csvMappingFields").querySelectorAll("select[data-channel-key]")]
        .map(select => [select.dataset.channelKey, select.value]),
    );
    const previousUnits = Object.fromEntries(
      [...$("#csvMappingFields").querySelectorAll("input[data-unit-key]")]
        .map(input => [input.dataset.unitKey, input.value]),
    );
    const sourceDomain = state.profile === "dynojet"
      ? "dyno" : ($("#csvSourceDomain").value || "unknown");
    renderMappingFields(state.parsed, sourceDomain);
    for (const select of $("#csvMappingFields").querySelectorAll("select[data-channel-key]")) {
      const key = select.dataset.channelKey;
      if (Object.hasOwn(previousMappings, key)) select.value = previousMappings[key];
    }
    for (const input of $("#csvMappingFields").querySelectorAll("input[data-unit-key]")) {
      const key = input.dataset.unitKey;
      if (Object.hasOwn(previousUnits, key)) input.value = previousUnits[key];
    }
    setStatus("Separador decimal actualizado. Se recalculó el perfil numérico sin alterar tus selecciones.");
  });
  form.addEventListener("submit", handleImport);
  $("#csvClearButton").addEventListener("click", reset);
  setStatus("Seleccioná un archivo CSV para comenzar.");
}
