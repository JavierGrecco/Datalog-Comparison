import { CsvTextDecodingError, decodeCsvBytes } from "../src/text-decoder.mjs";
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
import { compareRunDistributions } from "../src/distribution-comparison.mjs";
import { buildImportedComparisonReport } from "../src/imported-comparison-report.mjs";
import { DEFAULT_PREVIEW_SAMPLE_LIMIT, selectPreviewSamples } from "../src/sample-selection.mjs";
import { DEFAULT_CONTINUOUS_CHANNELS, buildRpmSweepCurves, resampleTimeBasedSignals } from "../src/signal-processing.mjs";

const $ = selector => document.querySelector(selector);
const state = {
  file: null, fileSha256: null, text: null, textEncoding: null, parsed: null, run: null, quality: null, profile: "generic",
  columnSuggestions: null, derivedResult: null,
  comparisonRuns: { reference: null, candidate: null }, comparisonResult: null,
};

function sourceEncodingLabel(encoding) {
  const labels = {
    "utf-8": "UTF-8",
    "utf-8-bom": "UTF-8 con BOM",
    "utf-16le-bom": "UTF-16LE con BOM",
    "utf-16be-bom": "UTF-16BE con BOM",
  };
  return labels[encoding] ?? "No declarada";
}

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

function setComparisonStatus(message, kind = "neutral") {
  const status = $("#csvComparisonStatus");
  status.className = "csv-status csv-status-" + kind;
  status.textContent = message;
}

function attachSourceHash(run) {
  if (!state.fileSha256) return;
  run.sha256 = state.fileSha256;
  run.importMetadata = {
    ...(run.importMetadata ?? {}),
    sourceFileSha256: state.fileSha256,
  };
}

function updateComparisonWorkspace() {
  const roles = [
    ["reference", "#csvReferenceSlotStatus", "#csvSetReference"],
    ["candidate", "#csvCandidateSlotStatus", "#csvSetCandidate"],
  ];
  for (const [role, statusSelector, buttonSelector] of roles) {
    const saved = state.comparisonRuns[role];
    $(statusSelector).textContent = saved
      ? saved.name + " · " + (saved.sourceType ?? saved.sourceDomain ?? "Origen sin identificar") +
        " · " + saved.samples.length + " muestras · SHA-256 " + saved.sha256.slice(0, 12) + "…"
      : "Sin registro asignado.";
    $(buttonSelector).disabled = !state.run || !state.fileSha256;
  }
  $("#csvCompareButton").disabled = !(state.comparisonRuns.reference && state.comparisonRuns.candidate);
  $("#csvExportComparisonReport").disabled = !state.comparisonResult;
}

function assignComparisonRun(role) {
  if (!["reference", "candidate"].includes(role)) return;
  if (!state.run) {
    setComparisonStatus("Primero inspeccioná un CSV válido.", "warning");
    return;
  }
  if (!state.fileSha256) {
    setComparisonStatus("No se pudo calcular SHA-256 para este archivo; no se guarda en el expediente.", "error");
    return;
  }
  attachSourceHash(state.run);
  state.comparisonRuns[role] = structuredClone(state.run);
  state.comparisonResult = null;
  $("#csvComparisonResult").hidden = true;
  $("#csvExportComparisonReport").disabled = true;
  $("#csvComparisonExportStatus").textContent = "El informe se genera localmente y no incluye muestras ni contenido del CSV."; 
  $("#csvComparisonResultSummary").replaceChildren();
  $("#csvComparisonGates").replaceChildren();
  $("#csvComparisonChannels").replaceChildren();
  $("#csvComparisonExclusions").replaceChildren();
  $("#csvComparisonWarnings").replaceChildren();
  $("#csvComparisonBlockedReasons").replaceChildren();
  setComparisonStatus(
    state.run.name + " quedó guardado como " + (role === "reference" ? "referencia" : "candidata") +
    " en la memoria de esta página. Podés reemplazarlo asignando otro registro.",
    "success",
  );
  updateComparisonWorkspace();
}

function formatComparisonNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "—";
}

function appendComparisonTable(container, headers, rows) {
  const wrapper = makeElement("div", "csv-table-wrap");
  appendTable(wrapper, headers, rows);
  container.append(wrapper);
}

function renderComparisonList(host, heading, items) {
  host.replaceChildren();
  if (!items?.length) return;
  host.append(makeElement("h4", "", heading));
  const list = makeElement("ul");
  for (const item of items) list.append(makeElement("li", "", item));
  host.append(list);
}

function renderDistributionComparison() {
  const reference = state.comparisonRuns.reference;
  const candidate = state.comparisonRuns.candidate;
  if (!reference || !candidate) return;

  const result = compareRunDistributions(reference, candidate);
  state.comparisonResult = result;
  const kind = result.status === "blocked" ? "error"
    : result.status === "review_required" ? "warning" : "success";
  setComparisonStatus(result.headline + ". " +
    (result.status === "blocked"
      ? "No se muestran estadísticas de canales."
      : result.channels.length + " canal(es) con resumen estadístico independiente."),
  kind);

  const summary = $("#csvComparisonResultSummary");
  summary.replaceChildren();
  summary.append(makeElement("p", "csv-preview-meta",
    "Referencia: " + result.reference.name + " · " + result.reference.domain +
    " · " + result.reference.sampleCount + " muestras · SHA-256 " + (result.reference.sha256 ?? "no disponible")));
  summary.append(makeElement("p", "csv-preview-meta",
    "Candidata: " + result.candidate.name + " · " + result.candidate.domain +
    " · " + result.candidate.sampleCount + " muestras · SHA-256 " + (result.candidate.sha256 ?? "no disponible")));
  summary.append(makeElement("p", "csv-preview-meta",
    "Método " + result.method + " · Cobertura mínima por canal " + result.minimumCoveragePct +
    "% · " + result.timeAlignment.reason));
  summary.append(makeElement("p", "csv-preview-meta",
    "Las medianas, medias y rangos resumen cada archivo por separado. No representan pares de muestras, el mismo instante ni el mismo punto operativo."));

  const channelLabels = new Map(CSV_CHANNEL_DEFINITIONS.map(definition => [definition.key, definition.label]));
  const channelRows = result.channels.map(channel => [
    channelLabels.get(channel.key) ?? channel.key,
    channel.unit,
    formatComparisonNumber(channel.reference.median),
    formatComparisonNumber(channel.candidate.median),
    formatComparisonNumber(channel.difference.median),
    Number.isFinite(channel.difference.medianPct)
      ? formatComparisonNumber(channel.difference.medianPct) + "%" : "—",
    channel.reference.coveragePct.toFixed(1).replace(".", ",") + "%",
    channel.candidate.coveragePct.toFixed(1).replace(".", ",") + "%",
  ]);
  const channelHost = $("#csvComparisonChannels");
  channelHost.replaceChildren();
  channelHost.append(makeElement("h4", "", "Canales con resumen disponible"));
  if (channelRows.length) {
    appendComparisonTable(channelHost,
      ["Canal", "Unidad", "Mediana ref.", "Mediana cand.", "Δ mediana", "Δ mediana %", "Cobertura ref.", "Cobertura cand."],
      channelRows,
    );
  } else {
    channelHost.append(makeElement("p", "csv-preview-meta", "No hay canales que superen los controles de comparación."));
  }

  const exclusions = $("#csvComparisonExclusions");
  exclusions.replaceChildren();
  if (result.excludedChannels.length) {
    exclusions.append(makeElement("h4", "", "Canales excluidos y motivo"));
    appendComparisonTable(exclusions,
      ["Canal", "Código", "Motivo", "Cobertura ref.", "Cobertura cand."],
      result.excludedChannels.map(channel => [
        channelLabels.get(channel.key) ?? channel.key,
        channel.reasonCode ?? "excluded",
        channel.reason,
        Number.isFinite(channel.referenceCoveragePct)
          ? channel.referenceCoveragePct.toFixed(1).replace(".", ",") + "%" : "—",
        Number.isFinite(channel.candidateCoveragePct)
          ? channel.candidateCoveragePct.toFixed(1).replace(".", ",") + "%" : "—",
      ]),
    );
  }

  const gateRows = result.readiness.gates.map(gate => [
    gate.label,
    gate.status,
    gate.summary,
    gate.findings?.length ? gate.findings.join(" · ") : "—",
  ]);
  const gateHost = $("#csvComparisonGates");
  gateHost.replaceChildren();
  gateHost.append(makeElement("h4", "", "Revisión de evidencia"));
  appendComparisonTable(gateHost, ["Control", "Estado", "Resumen", "Hallazgos"], gateRows);

  renderComparisonList($("#csvComparisonBlockedReasons"), "Bloqueos", result.blockedReasons);
  renderComparisonList($("#csvComparisonWarnings"), "Advertencias y próximos pasos",
    [...result.warnings, ...result.nextActions]);
  $("#csvComparisonResult").hidden = false;
  $("#csvExportComparisonReport").disabled = false;
  $("#csvComparisonExportStatus").textContent = "Informe disponible. Incluye estadísticas, procedencia resumida y controles; no incluye filas ni celdas originales.";
}

function exportImportedComparisonReport() {
  const referenceRun = state.comparisonRuns.reference;
  const candidateRun = state.comparisonRuns.candidate;
  if (!referenceRun || !candidateRun || !state.comparisonResult) {
    $("#csvComparisonExportStatus").textContent = "Primero ejecutá una comparación para generar el informe.";
    return;
  }

  try {
    const report = buildImportedComparisonReport({ referenceRun, candidateRun, result: state.comparisonResult });
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "datalog-comparison-imported-" + report.exportedAt.replace(/[:.]/g, "-") + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    $("#csvComparisonExportStatus").textContent = "Informe JSON generado localmente. SHA-256 identifica bytes, pero no autentica el origen.";
  } catch (error) {
    $("#csvComparisonExportStatus").textContent = "No se pudo generar el informe: " + (error?.message ?? "error inesperado.");
  }
}

function clearComparisonWorkspace() {
  state.comparisonRuns = { reference: null, candidate: null };
  state.comparisonResult = null;
  $("#csvComparisonResult").hidden = true;
  $("#csvComparisonResultSummary").replaceChildren();
  $("#csvComparisonGates").replaceChildren();
  $("#csvComparisonChannels").replaceChildren();
  $("#csvComparisonExclusions").replaceChildren();
  $("#csvComparisonWarnings").replaceChildren();
  $("#csvComparisonBlockedReasons").replaceChildren();
  setComparisonStatus("Expediente vacío. Los registros se conservan solo mientras esta página permanece abierta.");
  updateComparisonWorkspace();
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
  updateComparisonWorkspace();
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
  if (run.importMetadata?.sourceEncoding) {
    summary.append(makeElement("p", "csv-preview-meta",
      "Codificación de origen: " + sourceEncodingLabel(run.importMetadata.sourceEncoding)));
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
  updateComparisonWorkspace();
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
  const hashText = state.fileSha256 ? "" :
    " No se pudo calcular SHA-256 en este navegador; no se habilitará la asociación para comparar.";
  const profileText = profile === "dynojet"
    ? "Perfil PowerCore/WinPEP seleccionado: asigná canales y declarará la base de medición."
    : "Asigná tiempo y RPM antes de inspeccionarlo.";
  setStatus("Archivo leído localmente (" + sourceEncodingLabel(state.textEncoding) + "): " +
    parsed.headers.length + " columnas y " + parsed.rows.length + " filas de datos. " +
    profileText + warningText + hashText,
  parsed.warnings.length || !state.fileSha256 ? "warning" : "success");
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
        sourceEncoding: state.textEncoding,
      });
      state.profile = "haltech";
      attachSourceHash(run);
      state.run = run;
      state.quality = assessRunDataQuality(run);
      renderPreview();
      setStatus("Se reconoció la variante Haltech NSP %DataLog% (" + sourceEncodingLabel(state.textEncoding) +
        "). El registro está disponible para un expediente local de comparación descriptiva; revisá canales excluidos y reglas de conversión." +
        (state.fileSha256 ? "" : " No se pudo calcular SHA-256, por lo que no se habilita su asociación."),
        state.fileSha256 && state.quality.status === "no_obvious_issues" ? "success" : "warning");
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
    const detail = error instanceof CsvImportError || error instanceof CsvTextDecodingError
      ? " [" + error.code + "]" : "";
    setStatus((error?.message ?? "No se pudo leer el archivo.") + detail, "error");
  }
}

async function handleFileSelection() {
  clearPreview();
  state.file = null;
  state.fileSha256 = null;
  state.text = null;
  state.textEncoding = null;
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
    const bytes = await file.arrayBuffer();
    let fileSha256 = null;
    try {
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        fileSha256 = [...new Uint8Array(digest)]
          .map(byte => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      fileSha256 = null;
    }
    if ($("#csvFile").files?.[0] !== file) return;
    const decoded = decodeCsvBytes(bytes);
    state.file = file;
    state.fileSha256 = fileSha256;
    state.text = decoded.text;
    state.textEncoding = decoded.encoding;
    parseLoadedText();
  } catch (error) {
    const detail = error instanceof CsvImportError || error instanceof CsvTextDecodingError
      ? " [" + error.code + "]" : "";
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
    sourceEncoding: state.textEncoding,
    measurementBasis,
  };

  try {
    const run = state.profile === "dynojet"
      ? importDynojetPowerCoreCsv(state.parsed, options)
      : mapCsvToRun(state.parsed, options);
    attachSourceHash(run);
    const quality = assessRunDataQuality(run);
    state.run = run;
    state.quality = quality;
    renderPreview();
    setStatus("Inspección completada (" + sourceEncodingLabel(run.importMetadata?.sourceEncoding) +
      "). El registro permanece en memoria local y podés asignarlo como referencia o candidata para una comparación descriptiva." +
      (state.fileSha256 ? "" : " No se habilita su asociación porque no se pudo calcular SHA-256."),
      state.fileSha256 && quality.status === "no_obvious_issues" ? "success" : "warning");
  } catch (error) {
    const detail = error instanceof CsvImportError ? " [" + error.code + "]" : "";
    setStatus((error?.message ?? "No se pudo inspeccionar el archivo.") + detail, "error");
  }
}

function reset() {
  state.file = null;
  state.fileSha256 = null;
  state.text = null;
  state.textEncoding = null;
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
  $("#csvSetReference").addEventListener("click", () => assignComparisonRun("reference"));
  $("#csvSetCandidate").addEventListener("click", () => assignComparisonRun("candidate"));
  $("#csvCompareButton").addEventListener("click", renderDistributionComparison);
  $("#csvExportComparisonReport").addEventListener("click", exportImportedComparisonReport);
  $("#csvClearComparison").addEventListener("click", clearComparisonWorkspace);
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
  updateComparisonWorkspace();
  setComparisonStatus("Expediente vacío. Inspeccioná un CSV y asignalo explícitamente como referencia o candidata.");
  setStatus("Seleccioná un archivo CSV para comenzar.");
}
