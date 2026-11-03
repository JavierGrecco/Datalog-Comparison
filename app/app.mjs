import {
  buildPortfolioDemoReport,
  createPortfolioDemoCase,
  PORTFOLIO_DEMO_CASES,
} from "../src/demo-model.mjs";
import { assessComparisonReadiness } from "../src/comparison-readiness.mjs";

const state = { caseId: "complete", demoCase: null, readiness: null };
const $ = selector => document.querySelector(selector);
const svgNs = "http://www.w3.org/2000/svg";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function fmt(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value);
}

function finiteValues(run, key) {
  return (Array.isArray(run?.samples) ? run.samples : [])
    .map(sample => sample?.channels?.[key])
    .filter(Number.isFinite);
}

function coverage(run, key) {
  const samples = Array.isArray(run?.samples) ? run.samples : [];
  const count = finiteValues(run, key).length;
  return samples.length ? count / samples.length * 100 : 0;
}

function peak(run, key) {
  let best = null;
  for (let index = 0; index < (run?.samples?.length ?? 0); index += 1) {
    const sample = run.samples[index];
    const value = sample?.channels?.[key];
    const rpm = sample?.channels?.rpm;
    if (!Number.isFinite(value) || !Number.isFinite(rpm)) continue;
    if (!best || value > best.value) best = { value, rpm, index };
  }
  return best;
}

function appendSvg(svg, tag, attrs = {}, text = null) {
  const node = document.createElementNS(svgNs, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = String(text);
  svg.append(node);
  return node;
}

function drawChart(container, { metric, title, unit, reference, candidate }) {
  const referenceAvailable = finiteValues(reference, metric).length > 1;
  const candidateAvailable = finiteValues(candidate, metric).length > 1;
  if (!referenceAvailable || !candidateAvailable) {
    const missing = !referenceAvailable && !candidateAvailable
      ? "ambos registros" : !referenceAvailable ? "la referencia" : "la candidata";
    container.innerHTML = '<div class="empty-chart">No hay suficientes muestras numéricas para dibujar ' +
      esc(title.toLowerCase()) + " en " + esc(missing) + ".</div>";
    return;
  }

  const allPoints = [reference, candidate].flatMap(run =>
    run.samples.map(sample => ({ x: sample?.channels?.rpm, y: sample?.channels?.[metric] }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
  );
  const minX = Math.min(...allPoints.map(point => point.x));
  const maxX = Math.max(...allPoints.map(point => point.x));
  const rawMinY = Math.min(...allPoints.map(point => point.y));
  const rawMaxY = Math.max(...allPoints.map(point => point.y));
  const yPadding = Math.max((rawMaxY - rawMinY) * 0.12, 1);
  const minY = rawMinY - yPadding;
  const maxY = rawMaxY + yPadding;
  const width = 780;
  const height = 238;
  const margin = { left: 68, right: 24, top: 22, bottom: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xFor = x => margin.left + (x - minX) / Math.max(maxX - minX, 1) * plotWidth;
  const yFor = y => margin.top + (maxY - y) / Math.max(maxY - minY, 1) * plotHeight;

  const card = document.createElement("article");
  card.className = "curve-card";
  const heading = document.createElement("div");
  heading.className = "curve-heading";
  heading.innerHTML = '<div><h3>' + esc(title) + '</h3><span>' + esc(unit) +
    '</span></div><span class="curve-range">' + fmt(rawMinY) + "–" + fmt(rawMaxY) + " " + esc(unit) + "</span>";
  card.append(heading);

  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", title + " frente a RPM para dos registros sintéticos");
  svg.classList.add("curve-svg");

  for (let index = 0; index <= 4; index += 1) {
    const y = margin.top + plotHeight * index / 4;
    const value = maxY - (maxY - minY) * index / 4;
    appendSvg(svg, "line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "grid-line" });
    appendSvg(svg, "text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis-label" }, fmt(value));
  }

  for (let index = 0; index <= 4; index += 1) {
    const xValue = minX + (maxX - minX) * index / 4;
    const x = xFor(xValue);
    appendSvg(svg, "line", { x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight, class: "grid-line vertical-grid" });
    appendSvg(svg, "text", { x, y: height - 18, "text-anchor": "middle", class: "axis-label" }, fmt(xValue, 0));
  }

  appendSvg(svg, "line", { x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotHeight, class: "axis-line" });
  appendSvg(svg, "line", { x1: margin.left, y1: margin.top + plotHeight, x2: width - margin.right, y2: margin.top + plotHeight, class: "axis-line" });
  appendSvg(svg, "text", { x: margin.left + plotWidth / 2, y: height - 2, "text-anchor": "middle", class: "axis-title" }, "RPM");

  const drawRun = (run, className) => {
    let d = "";
    let penDown = false;
    for (const sample of run.samples) {
      const x = sample?.channels?.rpm;
      const y = sample?.channels?.[metric];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        penDown = false;
        continue;
      }
      d += (penDown ? " L " : " M ") + xFor(x).toFixed(2) + " " + yFor(y).toFixed(2);
      penDown = true;
    }
    appendSvg(svg, "path", { d: d.trim(), class: className });
  };
  drawRun(reference, "series-reference");
  drawRun(candidate, "series-candidate");

  const legend = document.createElement("div");
  legend.className = "curve-legend";
  legend.innerHTML = '<span><i class="legend-reference"></i>' + esc(reference.name) +
    '</span><span><i class="legend-candidate"></i>' + esc(candidate.name) + "</span>";
  card.append(svg, legend);
  container.append(card);
}

function statusLabel(status) {
  if (status === "blocked") return "Bloqueado";
  if (status === "review_required") return "Requiere revisión";
  return "Comprobación superada";
}

function renderCasePicker() {
  const host = $("#casePicker");
  host.replaceChildren();
  PORTFOLIO_DEMO_CASES.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "case-button" + (item.id === state.caseId ? " is-selected" : "");
    button.dataset.demoCase = item.id;
    button.setAttribute("aria-pressed", String(item.id === state.caseId));
    button.innerHTML = '<span class="case-index">0' + (index + 1) + '</span><strong>' +
      esc(item.label) + '</strong><span class="case-arrow" aria-hidden="true">↗</span>';
    button.addEventListener("click", () => {
      state.caseId = item.id;
      render();
    });
    host.append(button);
  });
  const activeIndex = PORTFOLIO_DEMO_CASES.findIndex(item => item.id === state.caseId);
  $("#caseCounter").textContent = "Caso " + (activeIndex + 1) + " de " + PORTFOLIO_DEMO_CASES.length;
  $("#caseDescription").textContent = PORTFOLIO_DEMO_CASES[activeIndex]?.description ?? "";
}

function renderRunSummary() {
  const runs = [state.demoCase.reference, state.demoCase.candidate];
  $("#runSummary").innerHTML = runs.map((run, index) => {
    const rpm = finiteValues(run, "rpm");
    const torque = peak(run, "torque_nm");
    const power = peak(run, "power_kw");
    const boostCoverage = coverage(run, "boost_actual");
    const timeCount = state.readiness.assessments.dataQuality[index === 0 ? "reference" : "candidate"].timestamp.validCount;
    return '<article class="run-card"><div class="run-card-top"><span class="run-role">' +
      (index === 0 ? "REFERENCIA A" : "CANDIDATA B") + '</span><span class="run-domain">' +
      esc(run.sourceType) + '</span></div><h3>' + esc(run.name) + '</h3><dl>' +
      '<div><dt>Muestras</dt><dd>' + run.samples.length + '</dd></div>' +
      '<div><dt>RPM observadas</dt><dd>' + (rpm.length ? fmt(Math.min(...rpm), 0) + "–" + fmt(Math.max(...rpm), 0) : "—") + '</dd></div>' +
      '<div><dt>Tiempo numérico</dt><dd>' + timeCount + " / " + run.samples.length + '</dd></div>' +
      '<div><dt>Cobertura boost</dt><dd>' + fmt(boostCoverage) + '%</dd></div>' +
      '<div><dt>Pico torque</dt><dd>' + (torque ? fmt(torque.value) + " Nm · " + fmt(torque.rpm, 0) + " RPM" : "—") + '</dd></div>' +
      '<div><dt>Pico potencia</dt><dd>' + (power ? fmt(power.value) + " kW · " + fmt(power.rpm, 0) + " RPM" : "—") + '</dd></div>' +
      '</dl><p class="run-note">' + esc(run.note) + "</p></article>";
  }).join("");
}

function renderReadiness() {
  const readiness = state.readiness;
  const statusClass = readiness.status === "blocked" ? "is-blocked"
    : readiness.status === "review_required" ? "is-review" : "is-descriptive";
  $("#readinessSummary").className = "readiness-summary " + statusClass;
  $("#readinessSummary").innerHTML = '<span class="readiness-mark" aria-hidden="true">' +
    (readiness.status === "blocked" ? "×" : readiness.status === "review_required" ? "!" : "✓") +
    '</span><div><strong>' + esc(readiness.headline) + '</strong><p>' + esc(readiness.summary) + "</p></div>";

  $("#gateList").innerHTML = readiness.gates.map(gate => {
    const findings = gate.findings.length
      ? "<ul>" + gate.findings.slice(0, 3).map(item => "<li>" + esc(item) + "</li>").join("") +
        (gate.findings.length > 3 ? "<li>+" + (gate.findings.length - 3) + " observaciones más.</li>" : "") + "</ul>"
      : '<p class="gate-clean">No se detectó un bloqueo en esta comprobación.</p>';
    const cls = gate.status === "blocked" ? "gate-blocked"
      : gate.status === "review_required" ? "gate-review" : "gate-supported";
    return '<article class="gate-card ' + cls + '"><div class="gate-head"><h3>' + esc(gate.label) +
      "</h3><span>" + esc(statusLabel(gate.status)) + "</span></div><p>" + esc(gate.summary) + "</p>" + findings + "</article>";
  }).join("");

  $("#nextActions").innerHTML = readiness.nextActions.map(action => "<li>" + esc(action) + "</li>").join("");
}

function renderCharts() {
  const charts = $("#charts");
  charts.replaceChildren();
  const source = state.readiness.assessments.source;
  if (!source.allowed) {
    $("#chartStatus").className = "chart-status chart-blocked";
    $("#chartStatus").textContent = "Gráficos comparativos ocultos: ECU/logger y dinamómetro son fuentes distintas. Revisá el origen y documentá su relación antes de hacer una comparación conjunta.";
    return;
  }
  $("#chartStatus").className = "chart-status chart-available";
  $("#chartStatus").textContent = "Mostrando muestras sintéticas observadas. El gráfico no rellena valores ni valida equivalencia física.";
  const comparison = state.readiness.assessments.comparison;
  const torqueAllowed = comparison.commonChannels.some(channel => channel.key === "torque_nm");
  const powerAllowed = comparison.commonChannels.some(channel => channel.key === "power_kw");
  if (torqueAllowed) {
    drawChart(charts, { metric: "torque_nm", title: "Torque frente a RPM", unit: "Nm sintéticos", reference: state.demoCase.reference, candidate: state.demoCase.candidate });
  } else {
    const warning = document.createElement("div");
    warning.className = "empty-chart";
    warning.textContent = "Torque no graficado: las unidades no coinciden o no se declararon de forma fiable.";
    charts.append(warning);
  }
  if (powerAllowed) {
    drawChart(charts, { metric: "power_kw", title: "Potencia frente a RPM", unit: "kW sintéticos", reference: state.demoCase.reference, candidate: state.demoCase.candidate });
  } else {
    const warning = document.createElement("div");
    warning.className = "empty-chart";
    warning.textContent = "Potencia no graficada: las unidades no coinciden o no se declararon de forma fiable.";
    charts.append(warning);
  }
}

function render() {
  state.demoCase = createPortfolioDemoCase(state.caseId);
  state.readiness = assessComparisonReadiness(state.demoCase.reference, state.demoCase.candidate);
  renderCasePicker();
  renderRunSummary();
  renderReadiness();
  renderCharts();
}

$("#exportReport").addEventListener("click", () => {
  const report = buildPortfolioDemoReport(state.demoCase);
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "datalog-comparison-demo-" + state.caseId + ".json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  $("#exportStatus").textContent = "Informe generado localmente para el caso: " +
    (PORTFOLIO_DEMO_CASES.find(item => item.id === state.caseId)?.label ?? state.caseId) + ".";
});

render();
