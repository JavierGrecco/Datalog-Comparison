import { assessTestProtocol } from "../src/test-protocol.mjs";
import { createEmptyOperatingConditions, OPERATING_CONDITION_FIELDS } from "../src/operating-conditions.mjs";

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


const protocolModes = {
  ecu: [
    { value: "steady_state", label: "Estacionario" },
    { value: "transient", label: "Transitorio" },
  ],
  dyno: [
    { value: "inertia_sweep", label: "Barrido inercial" },
    { value: "loaded_sweep", label: "Barrido con carga" },
    { value: "steady_state", label: "Punto estacionario" },
  ],
};
const ECU_FIELDS = ["calibration_id", "fuel", "intake_temp_c", "coolant_temp_c"];
const ECU_TRANSIENT_FIELDS = ["vehicle_engine", "calibration_id", "fuel", "ambient_temp_c"];
const DYNO_COMMON_FIELDS = [
  "vehicle_engine", "fuel", "test_method", "dyno_model", "dyno_type",
  "dyno_measurement_basis", "dyno_load_mode", "dyno_correction_standard",
  "dyno_fan_setup", "instrument_calibration", "ambient_temp_c",
  "ambient_pressure_kpa", "relative_humidity_pct",
];
const DYNO_CHASSIS_FIELDS = ["gear", "dyno_strapping"];
const DYNO_TIRE_FIELDS = ["tire_size", "tire_pressure_kpa", "tire_condition"];
const DYNO_HUB_FIELDS = ["dyno_hub_fixture"];
const DYNO_SWEEP_FIELDS = ["dyno_ramp_rate_rpm_s", "dyno_smoothing_setting"];
function renderProtocolModeOptions() {
  const domain = $("#protocolDomain").value;
  const mode = $("#protocolMode");
  mode.replaceChildren();
  for (const option of protocolModes[domain]) {
    const item = element("option", "", option.label);
    item.value = option.value;
    mode.append(item);
  }
  renderProtocolConditionFields();
  updateProtocolPointFields();
}
function protocolRequiredFields() {
  const domain = $("#protocolDomain").value;
  const mode = $("#protocolMode").value;
  if (domain === "dyno") {
    const dynoType = document.querySelector('[data-condition-key="dyno_type"]')?.value ?? "";
    const measurementBasis = document.querySelector('[data-condition-key="dyno_measurement_basis"]')?.value ?? "";
    return [
      ...DYNO_COMMON_FIELDS,
      ...(dynoType === "chassis" ? DYNO_CHASSIS_FIELDS : []),
      ...(dynoType === "chassis" && ["wheel", "roller"].includes(measurementBasis) ? DYNO_TIRE_FIELDS : []),
      ...(dynoType === "chassis" && measurementBasis === "hub" ? DYNO_HUB_FIELDS : []),
      ...(["inertia_sweep", "loaded_sweep"].includes(mode) ? DYNO_SWEEP_FIELDS : []),
    ];
  }
  return mode === "steady_state" ? ECU_FIELDS : ECU_TRANSIENT_FIELDS;
}
function renderProtocolConditionFields() {
  const host = $("#protocolConditionFields");
  if (!host) return;
  const previous = new Map();
  for (const card of host.querySelectorAll(".protocol-condition-card")) {
    const value = card.querySelector("[data-condition-key]");
    const key = value?.dataset.conditionKey;
    if (!key) continue;
    previous.set(key, {
      value: value.value,
      status: card.querySelector("[data-condition-status]")?.value ?? "unknown",
      source: card.querySelector("[data-condition-source]")?.value ?? "",
      note: card.querySelector("[data-condition-note]")?.value ?? "",
    });
  }
  host.replaceChildren();
  const definitions = new Map(OPERATING_CONDITION_FIELDS.map(item => [item.key, item]));
  for (const key of protocolRequiredFields()) {
    const definition = definitions.get(key);
    const saved = previous.get(key);
    const card = element("fieldset", "protocol-condition-card");
    const legend = element("legend", "", definition.label + (definition.unit ? " (" + definition.unit + ")" : ""));
    const valueLabel = element("label", "csv-control");
    valueLabel.append(element("span", "", "Valor"));
    const value = definition.type === "select"
      ? element("select", "protocol-condition-value")
      : element("input", "protocol-condition-value");
    if (definition.type === "number") value.type = "number";
    else if (definition.type !== "select") value.type = "text";
    value.dataset.conditionKey = key;
    value.id = "conditionValue-" + key;
    if (definition.type === "select") {
      const placeholder = element("option", "", "Seleccioná una opción");
      placeholder.value = "";
      value.append(placeholder);
      for (const optionDefinition of definition.options ?? []) {
        const option = element("option", "", optionDefinition.label);
        option.value = optionDefinition.value;
        value.append(option);
      }
    }
    if (definition.min !== undefined) value.min = String(definition.min);
    if (definition.max !== undefined) value.max = String(definition.max);
    if (definition.type !== "select") value.placeholder = "Sin dato";
    valueLabel.append(value);
    const statusLabel = element("label", "csv-control");
    statusLabel.append(element("span", "", "Estado de evidencia"));
    const status = element("select");
    status.dataset.conditionStatus = key;
    for (const [v, label] of [["unknown","Desconocido"],["reported","Informado"],["measured","Medido"],["verified","Verificado por quien carga"]]) {
      const option = element("option", "", label); option.value = v; status.append(option);
    }
    statusLabel.append(status);
    const sourceLabel = element("label", "csv-control");
    sourceLabel.append(element("span", "", "Fuente / referencia"));
    const source = element("input");
    source.type = "text"; source.dataset.conditionSource = key;
    source.maxLength = 500; source.placeholder = "Archivo, sensor, instrumento, documento…";
    sourceLabel.append(source);
    const noteLabel = element("label", "csv-control protocol-condition-note");
    noteLabel.append(element("span", "", "Nota (opcional)"));
    const note = element("input");
    note.type = "text"; note.dataset.conditionNote = key;
    note.maxLength = 500; note.placeholder = definition.hint ?? "";
    noteLabel.append(note);
    if (saved) {
      value.value = saved.value;
      status.value = saved.status;
      source.value = saved.source;
      note.value = saved.note;
    }
    card.append(legend, valueLabel, statusLabel, sourceLabel, noteLabel);
    host.append(card);
  }
}
function updateProtocolPointFields() {
  const domain = $("#protocolDomain").value;
  const mode = $("#protocolMode").value;
  const sweep = domain === "dyno" && ["inertia_sweep","loaded_sweep"].includes(mode);
  $("#protocolRpm").closest("label").hidden = sweep;
  $("#protocolLoad").closest("label").hidden = sweep;
  $("#protocolRpmStart").closest("label").hidden = !sweep;
  $("#protocolRpmEnd").closest("label").hidden = !sweep;
  $("#protocolStabilization").closest("label").hidden = !(domain === "ecu" && mode === "steady_state");
}
function buildProtocolFromForm() {
  const domain = $("#protocolDomain").value;
  const mode = $("#protocolMode").value;
  const count = Number($("#protocolReplicates").value);
  if (!Number.isInteger(count) || count < 2 || count > 20) throw new RangeError("La cantidad de repeticiones debe estar entre 2 y 20.");
  const pointId = $("#protocolPointId").value.trim();
  if (!pointId) throw new TypeError("Indicá un identificador para el punto o tramo.");
  const conditions = createEmptyOperatingConditions();
  conditions.updatedAt = new Date().toISOString();
  for (const key of protocolRequiredFields()) {
    const valueInput = document.querySelector('[data-condition-key="' + key + '"]');
    const status = document.querySelector('[data-condition-status="' + key + '"]').value;
    const source = document.querySelector('[data-condition-source="' + key + '"]').value.trim();
    const note = document.querySelector('[data-condition-note="' + key + '"]').value.trim();
    const raw = valueInput.value.trim();
    let value = null;
    if (raw !== "") {
      value = valueInput.type === "number" ? Number(raw) : raw;
      if (valueInput.type === "number" && !Number.isFinite(value)) throw new TypeError("El valor de " + key + " no es numérico.");
    }
    if (status === "unknown" && value !== null) throw new TypeError("El campo " + key + " tiene un valor, pero está marcado como desconocido.");
    if (status !== "unknown" && (value === null || !source)) throw new TypeError("El campo " + key + " necesita un valor y una fuente para el estado seleccionado.");
    conditions.fields[key] = { value, status, source: status === "unknown" ? "" : source, note };
  }
  let operatingPoint = {};
  if (domain === "ecu" && mode === "steady_state") {
    const rpmRaw = $("#protocolRpm").value.trim(), loadRaw = $("#protocolLoad").value.trim();
    const rpm = Number(rpmRaw), loadPct = Number(loadRaw);
    if (!rpmRaw || !loadRaw || !Number.isFinite(rpm) || rpm <= 0 || !Number.isFinite(loadPct) || loadPct < 0 || loadPct > 100) {
      throw new TypeError("El punto ECU estacionario necesita RPM y carga entre 0 y 100 %.");
    }
    operatingPoint = { rpm, loadPct };
  } else if (domain === "dyno" && ["inertia_sweep","loaded_sweep"].includes(mode)) {
    const rpmStart = Number($("#protocolRpmStart").value), rpmEnd = Number($("#protocolRpmEnd").value);
    if (!Number.isFinite(rpmStart) || !Number.isFinite(rpmEnd) || rpmStart <= 0 || rpmEnd <= rpmStart) {
      throw new TypeError("El barrido requiere RPM inicial y final válidas, con final mayor que inicial.");
    }
    operatingPoint = { rpmStart, rpmEnd };
  } else if (domain === "dyno" && mode === "steady_state") {
    const rpmRaw = $("#protocolRpm").value.trim(), loadRaw = $("#protocolLoad").value.trim();
    const rpm = Number(rpmRaw), loadPct = Number(loadRaw);
    if (!rpmRaw || !loadRaw || !Number.isFinite(rpm) || rpm <= 0 || !Number.isFinite(loadPct) || loadPct < 0 || loadPct > 100) {
      throw new TypeError("El punto de dinamómetro estacionario necesita RPM y carga entre 0 y 100 %.");
    }
    operatingPoint = { rpm, loadPct };
  }
  const metricsInput = JSON.parse($("#protocolMetricsInput").value);
  if (!metricsInput || typeof metricsInput !== "object" || Array.isArray(metricsInput)) throw new TypeError("Las métricas deben ser un objeto JSON con arreglos numéricos.");
  const metricKeys = Object.keys(metricsInput);
  if (!metricKeys.length) throw new TypeError("Ingresá al menos una métrica.");
  for (const key of metricKeys) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || !Array.isArray(metricsInput[key]) ||
        metricsInput[key].length !== count || metricsInput[key].some(value => !Number.isFinite(value))) {
      throw new TypeError("Cada métrica debe tener un nombre técnico y exactamente " + count + " valores numéricos.");
    }
  }
  const stabilizationMinutes = Number($("#protocolStabilization").value);
  const protocol = { id: domain + "-" + mode + "/1", mode };
  if (domain === "ecu" && mode === "steady_state") {
    if (!Number.isFinite(stabilizationMinutes) || stabilizationMinutes <= 0) throw new TypeError("Indicá un tiempo de estabilización mayor a cero.");
    protocol.stabilizationMinutes = stabilizationMinutes;
  }
  const runs = Array.from({ length: count }, (_, index) => ({
    id: "replicate-" + (index + 1),
    domain,
    protocol: { ...protocol },
    operatingPointId: pointId,
    ...(Object.keys(operatingPoint).length ? { operatingPoint: { ...operatingPoint } } : {}),
    operatingConditions: JSON.parse(JSON.stringify(conditions)),
    metrics: Object.fromEntries(metricKeys.map(key => [key, metricsInput[key][index]])),
  }));
  const options = { minimumReplicates: 3 };
  const cv = $("#protocolCvLimit").value.trim();
  if (cv !== "") {
    const maximumCvPct = Number(cv);
    if (!Number.isFinite(maximumCvPct) || maximumCvPct < 0) throw new TypeError("El límite CV debe ser un número igual o mayor que cero.");
    options.maximumCvPct = maximumCvPct;
  }
  return { schema: "datalog-test-protocol/1", evidenceClass: "user_entered", options, runs };
}

export function initializeProtocolInspector() {
  const form = $("#protocolAssessmentForm");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";
  renderProtocolModeOptions();
  const clearPendingArtifact = () => {
    window.dispatchEvent(new Event("datalog:derived-cleared"));
    $("#protocolBuilderStatus").textContent = "Los cambios invalidan la evaluación pendiente. Volvé a evaluar antes de guardarla.";
  };
  $("#protocolBuilder").addEventListener("input", clearPendingArtifact);
  $("#protocolBuilder").addEventListener("change", clearPendingArtifact);
  $("#protocolJsonInput").addEventListener("input", clearPendingArtifact);
  $("#protocolDomain").addEventListener("change", renderProtocolModeOptions);
  $("#protocolMode").addEventListener("change", () => { renderProtocolConditionFields(); updateProtocolPointFields(); });
  $("#protocolConditionFields").addEventListener("change", event => {
    if (event.target?.matches('[data-condition-key="dyno_type"], [data-condition-key="dyno_measurement_basis"]')) {
      renderProtocolConditionFields();
    }
  });
  $("#protocolBuildButton").addEventListener("click", () => {
    const status = $("#protocolBuilderStatus");
    status.textContent = "";
    try {
      const dossier = buildProtocolFromForm();
      const serialized = JSON.stringify(dossier, null, 2);
      if (new TextEncoder().encode(serialized).byteLength > MAX_INPUT_BYTES) throw new RangeError("El expediente supera el límite de 2 MiB.");
      $("#protocolJsonInput").value = serialized;
      status.textContent = "Expediente generado con " + dossier.runs.length + " repeticiones. Revisá el JSON si necesitás conservarlo y evaluá el resultado.";
      form.requestSubmit();
    } catch (error) { status.textContent = error.message; }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const status = $("#protocolInputStatus");
    const raw = $("#protocolJsonInput").value;
    status.textContent = "";
    window.dispatchEvent(new Event("datalog:derived-cleared"));
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
      window.dispatchEvent(new CustomEvent("datalog:derived-ready", { detail: { artifact: {
        kind: "test_protocol_assessment",
        algorithm: "assessTestProtocol",
        algorithmVersion: "1.0.0",
        source: {
          evidenceClass: typeof input.evidenceClass === "string" ? input.evidenceClass : "user_supplied",
          protocolSchema: typeof input.schema === "string" ? input.schema : "unversioned",
        },
        metadata: {
          domain: result.domain ?? null,
          mode: result.mode ?? null,
          status: result.status,
          runCount: input.runs.length,
          operatingPointId: result.operatingPointId ?? null,
        },
        payload: { input, assessment: result },
      } } }));
      $("#protocolBuilderStatus").textContent = "Evaluación lista. No certifica una norma ni autentica las fuentes; podés guardar el resultado manualmente en un expediente local.";

      status.textContent = "Evaluación local terminada. El resultado no certifica una norma ni autentica las fuentes declaradas.";
    } catch (error) {
      status.textContent = "No se pudo evaluar el expediente: " +
        (error instanceof SyntaxError ? "el JSON no tiene un formato válido." : error.message);
    }
  });

  $("#protocolClearButton").addEventListener("click", () => {
    $("#protocolJsonInput").value = "";
    window.dispatchEvent(new Event("datalog:derived-cleared"));
    $("#protocolInputStatus").textContent = "Expediente de evaluación vacío.";
    $("#protocolResult").replaceChildren();
    $("#protocolResult").hidden = true;
  });

  $("#protocolLoadExampleButton").addEventListener("click", async () => {
    window.dispatchEvent(new Event("datalog:derived-cleared"));
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
