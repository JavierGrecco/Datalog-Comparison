import { assessTestProtocol } from "../src/test-protocol.mjs";

const $ = selector => document.querySelector(selector);
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function renderResult(result) {
  const host = $("#protocolResult");
  host.replaceChildren();
  host.hidden = false;
  const labels = {
    supported: "Controles configurados completos",
    review_required: "Requiere revisión",
    blocked: "Bloqueado",
  };
  const summary = element("article", "gate-card " +
    (result.status === "blocked" ? "gate-blocked" :
      result.status === "review_required" ? "gate-review" : "gate-supported"));
  summary.append(
    element("h3", "", labels[result.status] ?? result.status),
    element("p", "", "Dominio: " + (result.domain ?? "no identificado") +
      " · Protocolo: " + (result.mode ?? "no identificado")),
    element("p", "", result.interpretation ??
      "No se pudo evaluar el protocolo. Revisá los datos de entrada.")
  );
  host.append(summary);

  const repeatability = result.repeatability;
  if (repeatability) {
    const section = element("section", "csv-preview-block");
    section.append(element("h3", "", "Repetibilidad"));
    section.append(element("p", "", "Estado: " + repeatability.status +
      " · Repeticiones: " + repeatability.replicateCount +
      " · Mínimo requerido: " + repeatability.minimumReplicates));
    const list = element("ul");
    for (const metric of repeatability.metrics ?? []) {
      list.append(element("li", "", metric.key + ": media " +
        (metric.mean === null ? "—" : metric.mean) +
        " · CV " + (metric.cvPct === null ? "—" : metric.cvPct.toFixed(3) + "%") +
        " · " + metric.status));
    }
    section.append(list);
    host.append(section);
  }

  const findings = element("section", "csv-preview-block");
  findings.append(element("h3", "", "Observaciones"));
  const list = element("ul");
  for (const finding of result.findings ?? []) {
    list.append(element("li", "", "[" + finding.code + "] " + finding.message));
  }
  if (!result.findings?.length) list.append(element("li", "", "No se detectaron observaciones con los controles configurados."));
  findings.append(list);
  host.append(findings);
}

export function initializeProtocolInspector() {
  const form = $("#protocolAssessmentForm");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  form.addEventListener("submit", event => {
    event.preventDefault();
    const status = $("#protocolInputStatus");
    const raw = $("#protocolJsonInput").value;
    status.textContent = "";
    $("#protocolResult").replaceChildren();
    $("#protocolResult").hidden = true;
    if (!raw.trim()) {
      status.textContent = "Pegá un expediente JSON para evaluar.";
      return;
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_INPUT_BYTES) {
      status.textContent = "El expediente supera el límite local de 2 MiB.";
      return;
    }
    try {
      const input = JSON.parse(raw);
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          !Array.isArray(input.runs) || !input.runs.length) {
        throw new TypeError("El JSON debe incluir un arreglo runs con al menos un registro.");
      }
      const result = assessTestProtocol(input.runs, input.options ?? {});
      renderResult(result);
      status.textContent = "Evaluación local terminada. El resultado no certifica una norma ni autentica las fuentes declaradas.";
    } catch (error) {
      status.textContent = "No se pudo evaluar el expediente: " +
        (error instanceof SyntaxError ? "el JSON no tiene un formato válido." : error.message);
    }
  });

  $("#protocolClearButton").addEventListener("click", () => {
    $("#protocolJsonInput").value = "";
    $("#protocolInputStatus").textContent = "Expediente de evaluación vacío.";
    $("#protocolResult").replaceChildren();
    $("#protocolResult").hidden = true;
  });

  $("#protocolLoadExampleButton").addEventListener("click", async () => {
    const status = $("#protocolInputStatus");
    try {
      const response = await fetch("../examples/test-protocol-ecu-steady-state.synthetic.json", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("No se pudo abrir el ejemplo local.");
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) {
        throw new Error("El ejemplo supera el límite permitido.");
      }
      $("#protocolJsonInput").value = text;
      status.textContent = "Ejemplo sintético cargado. Sus valores no son mediciones reales del estudio citado.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
}
