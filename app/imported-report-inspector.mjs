import { validateImportedComparisonReport } from "../src/imported-comparison-report-validator.mjs";
import importedComparisonSchema from "../schemas/imported-run-comparison-1.schema.json" with { type: "json" };

const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const $ = selector => document.querySelector(selector);

let schemaPromise = null;
let loadSequence = 0;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setStatus(message, kind = "neutral") {
  const status = $("#savedReportStatus");
  status.className = "csv-status" + (kind === "neutral" ? "" : " csv-status-" + kind);
  status.textContent = message;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value)
    : "—";
}

function formatPercent(value) {
  return Number.isFinite(value) ? formatNumber(value, 1) + "%" : "—";
}

function statusLabel(status) {
  if (status === "blocked") return "Comparación bloqueada";
  if (status === "review_required") return "Requiere revisión";
  return "Solo descriptiva";
}

function statusClass(status) {
  if (status === "blocked") return "is-blocked";
  if (status === "review_required") return "is-review";
  return "is-descriptive";
}

async function readReportFile(file) {
  if (!file) throw new Error("Seleccioná un informe JSON.");
  if (file.size === 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_REPORT_BYTES) throw new RangeError("El informe supera el límite de 10 MiB.");
  const bytes = await file.arrayBuffer();
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("El archivo no contiene texto UTF-8 válido.");
  }
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
}

function appendTable(container, headers, rows) {
  const wrapper = makeElement("div", "csv-table-wrap saved-report-table-wrap");
  const table = makeElement("table", "csv-data-table saved-report-table");
  const head = makeElement("thead");
  const headerRow = makeElement("tr");
  for (const header of headers) headerRow.append(makeElement("th", "", header));
  head.append(headerRow);
  const body = makeElement("tbody");
  for (const row of rows) {
    const rowNode = makeElement("tr");
    for (const value of row) rowNode.append(makeElement("td", "", value ?? "—"));
    body.append(rowNode);
  }
  table.append(head, body);
  wrapper.append(table);
  container.append(wrapper);
}

function appendList(container, heading, items) {
  if (!Array.isArray(items) || !items.length) return;
  const section = makeElement("section", "saved-report-block");
  section.append(makeElement("h4", "", heading));
  const list = makeElement("ul", "saved-report-list");
  for (const item of items) list.append(makeElement("li", "", item));
  section.append(list);
  container.append(section);
}

function renderRunCard(run, role) {
  const article = makeElement("article", "saved-report-run");
  const heading = makeElement("div", "saved-report-run-heading");
  heading.append(
    makeElement("span", "saved-report-role", role === "reference" ? "REFERENCIA" : "CANDIDATA"),
    makeElement("span", "saved-report-domain", run.domain),
  );
  article.append(heading, makeElement("h4", "", run.name));
  const details = makeElement("dl", "saved-report-run-details");
  const fields = [
    ["Muestras", String(run.sampleCount)],
    ["Base física", run.measurementBasisLabel ?? "No aplica / no declarada"],
    ["ID de registro", run.id ?? "—"],
    ["SHA-256", run.sha256 ? run.sha256.slice(0, 16) + "…" : "No disponible"],
  ];
  for (const [label, value] of fields) {
    const item = makeElement("div");
    item.append(makeElement("dt", "", label), makeElement("dd", "", value));
    details.append(item);
  }
  article.append(details);

  const units = Object.entries(run.units ?? {});
  article.append(makeElement("p", "saved-report-units",
    "Unidades: " + (units.length
      ? units.slice(0, 32).map(([key, unit]) => key + " = " + unit).join(" · ") +
        (units.length > 32 ? " · +" + (units.length - 32) + " canales" : "")
      : "No declaradas")));
  if (run.import) {
    const provenance = [run.import.parserId, run.import.importFormat, run.import.sourceEncoding].filter(Boolean);
    if (provenance.length) article.append(makeElement("p", "saved-report-units", "Importación: " + provenance.join(" · ")));
  }
  return article;
}

function renderReport(report, fileName) {
  const result = $("#savedReportResult");
  const overview = $("#savedReportOverview");
  const runs = $("#savedReportRuns");
  const channels = $("#savedReportChannels");
  const exclusions = $("#savedReportExclusions");
  const gates = $("#savedReportGates");
  const messages = $("#savedReportMessages");

  for (const node of [overview, runs, channels, exclusions, gates, messages]) node.replaceChildren();

  const summary = makeElement("div", "saved-report-overview " + statusClass(report.status));
  summary.append(
    makeElement("span", "saved-report-status-label", statusLabel(report.status)),
    makeElement("h3", "", report.headline),
    makeElement("p", "", "Archivo: " + fileName),
    makeElement("p", "", "Exportado: " + new Date(report.exportedAt).toLocaleString("es-AR")),
    makeElement("p", "", "Método: " + report.method + " · Cobertura mínima: " + formatPercent(report.minimumCoveragePct)),
    makeElement("p", "", report.timeAlignment.reason ?? "No se informó una referencia temporal común."),
  );
  overview.append(summary);

  runs.append(
    makeElement("h4", "", "Registros contenidos en el informe"),
    renderRunCard(report.reference, "reference"),
    renderRunCard(report.candidate, "candidate"),
  );

  const channelSection = makeElement("section", "saved-report-block");
  channelSection.append(makeElement("h4", "", "Canales con resumen estadístico"));
  if (report.channels.length) {
    appendTable(channelSection,
      ["Canal", "Unidad", "Mediana ref.", "Mediana cand.", "Δ mediana", "Δ %", "Cobertura ref.", "Cobertura cand."],
      report.channels.map(channel => [
        channel.key, channel.unit ?? "—",
        formatNumber(channel.reference.median), formatNumber(channel.candidate.median),
        formatNumber(channel.difference.median), formatPercent(channel.difference.medianPct),
        formatPercent(channel.reference.coveragePct), formatPercent(channel.candidate.coveragePct),
      ]),
    );
  } else {
    channelSection.append(makeElement("p", "csv-preview-meta", "El informe no contiene canales comparables."));
  }
  channels.append(channelSection);

  const exclusionSection = makeElement("section", "saved-report-block");
  exclusionSection.append(makeElement("h4", "", "Canales excluidos y motivos"));
  if (report.excludedChannels.length) {
    appendTable(exclusionSection,
      ["Canal", "Código", "Motivo", "Cobertura ref.", "Cobertura cand."],
      report.excludedChannels.map(channel => [
        channel.key, channel.reasonCode ?? "—", channel.reason ?? "Sin motivo documentado",
        formatPercent(channel.referenceCoveragePct), formatPercent(channel.candidateCoveragePct),
      ]),
    );
  } else {
    exclusionSection.append(makeElement("p", "csv-preview-meta", "No hay canales excluidos documentados."));
  }
  exclusions.append(exclusionSection);

  gates.append(makeElement("h4", "", "Controles de revisión documentados"));
  if (report.readiness.gates.length) {
    appendTable(gates,
      ["Control", "Estado", "Resumen", "Hallazgos"],
      report.readiness.gates.map(gate => [
        gate.label ?? gate.id, gate.status, gate.summary,
        gate.findings.length ? gate.findings.join(" · ") : "—",
      ]),
    );
  } else {
    gates.append(makeElement("p", "csv-preview-meta", "El informe no contiene controles de revisión."));
  }

  appendList(messages, "Bloqueos", report.blockedReasons);
  appendList(messages, "Advertencias", report.warnings);
  appendList(messages, "Próximas acciones", report.nextActions);
  appendList(messages, "Limitaciones del informe", report.limitations);
  const isolation = makeElement("p", "csv-isolation-note");
  isolation.append(makeElement("strong", "", "Informe guardado: "));
  isolation.append(document.createTextNode(
    "se reconstruyó únicamente el resumen exportado. No contiene muestras originales, series temporales ni datos suficientes para rehacer gráficos o recalcular la comparación. La vista no modifica el expediente CSV actual."
  ));
  messages.append(isolation);
  result.hidden = false;
}

async function handleOpenReport(event) {
  event.preventDefault();
  const file = $("#savedReportFile").files?.[0];
  const sequence = ++loadSequence;
  $("#savedReportResult").hidden = true;
  $("#savedReportCloseButton").disabled = true;
  $("#savedReportOpenButton").disabled = true;
  setStatus("Leyendo y validando el informe local…");

  try {
    const report = await readReportFile(file);
    if (sequence !== loadSequence) return;
    const errors = validateImportedComparisonReport(report, importedComparisonSchema, { maxErrors: 50 });
    if (errors.length) {
      const summary = errors.slice(0, 8).join(" · ");
      const remainder = errors.length > 8 ? " · y " + (errors.length - 8) + " problema(s) más" : "";
      throw new Error("El informe no cumple el contrato: " + summary + remainder);
    }

    renderReport(report, file.name);
    $("#savedReportCloseButton").disabled = false;
    setStatus(
      "Informe validado y abierto correctamente. Se muestran " + report.channels.length +
      " canal(es) comparables y " + report.excludedChannels.length + " excluido(s).",
      report.status === "blocked" ? "error" : report.status === "review_required" ? "warning" : "success",
    );
  } catch (error) {
    if (sequence !== loadSequence) return;
    $("#savedReportResult").hidden = true;
    setStatus(error?.message ?? "No se pudo abrir el informe.", "error");
  } finally {
    if (sequence === loadSequence) $("#savedReportOpenButton").disabled = !$("#savedReportFile").files?.length;
  }
}

function clearReport() {
  loadSequence += 1;
  $("#savedReportForm").reset();
  $("#savedReportResult").hidden = true;
  for (const selector of [
    "#savedReportOverview", "#savedReportRuns", "#savedReportChannels",
    "#savedReportExclusions", "#savedReportGates", "#savedReportMessages",
  ]) $(selector).replaceChildren();
  $("#savedReportOpenButton").disabled = true;
  $("#savedReportCloseButton").disabled = true;
  setStatus("No hay ningún informe abierto. Los archivos se procesan localmente y no se guardan al recargar.");
}

export function initializeImportedReportInspector() {
  const form = $("#savedReportForm");
  if (!form) return;
  $("#savedReportFile").addEventListener("change", () => {
    loadSequence += 1;
    $("#savedReportResult").hidden = true;
    $("#savedReportCloseButton").disabled = true;
    $("#savedReportOpenButton").disabled = !$("#savedReportFile").files?.length;
    setStatus("Archivo seleccionado. Validalo para abrir el resumen guardado.");
  });
  form.addEventListener("submit", handleOpenReport);
  $("#savedReportCloseButton").addEventListener("click", clearReport);
  clearReport();
}
