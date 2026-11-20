import {
  createLocalDossierRepository,
  LOCAL_DOSSIER_BACKUP_SCHEMA,
  LOCAL_DOSSIER_LIMITS,
} from "../src/local-dossier-store.mjs";
import { validateImportedComparisonReport } from "../src/imported-comparison-report-validator.mjs";
import importedComparisonSchema from "../schemas/imported-run-comparison-1.schema.json" with { type: "json" };
import { openSavedImportedReport } from "./imported-report-inspector.mjs";

const $ = selector => document.querySelector(selector);
let repository = null;
let dossiers = [];
let activeDossierId = null;
let pendingReport = null;
let pendingFileName = "comparacion.json";
let pendingSourceFiles = [];
let pendingDerivedArtifact = null;
let initialized = false;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setStatus(message, kind = "neutral") {
  const status = $("#dossierStatus");
  status.className = "csv-status" + (kind === "neutral" ? "" : " csv-status-" + kind);
  status.textContent = message;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-AR") : "Fecha no disponible";
}

function statusLabel(status) {
  if (status === "blocked") return "Bloqueada";
  if (status === "review_required") return "Requiere revisión";
  return "Descriptiva";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "tamaño no disponible";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
}

function downloadBlob(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function downloadJson(value, fileName) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, fileName);
}

function updateActions() {
  const hasActive = Boolean(activeDossierId);
  $("#dossierSaveReportButton").disabled = !hasActive || !pendingReport;
  $("#dossierArchiveOriginals").disabled = !hasActive || !pendingReport || pendingSourceFiles.length === 0;
  $("#dossierSaveDerivedButton").disabled = !hasActive || !pendingDerivedArtifact;
  $("#dossierExportBackupButton").disabled = !hasActive;
  $("#dossierDeleteButton").disabled = !hasActive;
  $("#dossierActiveSelect").disabled = dossiers.length === 0;
  const sourceCount = pendingSourceFiles.length;
  $("#dossierArchiveOriginalsLabel").textContent = sourceCount
    ? "Archivar los " + sourceCount + " CSV originales por separado en este navegador"
    : "CSV originales no disponibles para este informe";
  if (!sourceCount) $("#dossierArchiveOriginals").checked = false;
}

async function renderDossierCards() {
  const host = $("#dossierCardList");
  host.replaceChildren();
  if (!dossiers.length) {
    host.append(makeElement("p", "csv-preview-meta",
      "Todavía no hay expedientes. Creá uno para guardar informes y artefactos."));
    return;
  }

  const counts = await Promise.all(dossiers.map(async dossier => {
    const [reports, artifacts] = await Promise.all([
      repository.listReports(dossier.id),
      repository.listDerivedArtifacts(dossier.id),
    ]);
    return { dossier, reportCount: reports.length, artifactCount: artifacts.length };
  }));
  for (const item of counts) {
    const card = makeElement("article", "dossier-card" +
      (item.dossier.id === activeDossierId ? " is-active" : ""));
    const heading = makeElement("div", "dossier-card-heading");
    heading.append(
      makeElement("h4", "", item.dossier.name),
      makeElement("span", "dossier-card-count", item.reportCount + " informe(s)"),
    );
    card.append(heading);
    if (item.dossier.vehicleLabel) {
      card.append(makeElement("p", "dossier-card-vehicle", item.dossier.vehicleLabel));
    }
    card.append(makeElement("p", "dossier-card-meta",
      item.artifactCount + " artefacto(s) derivado(s) · actualizado " + formatDate(item.dossier.updatedAt)));
    const actions = makeElement("div", "dossier-card-actions");
    const selectButton = makeElement("button", "secondary-button", 
      item.dossier.id === activeDossierId ? "Expediente activo" : "Abrir expediente");
    selectButton.type = "button";
    selectButton.disabled = item.dossier.id === activeDossierId;
    selectButton.addEventListener("click", () => activateDossier(item.dossier.id));
    const deleteButton = makeElement("button", "text-button", "Eliminar");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteDossier(item.dossier.id));
    actions.append(selectButton, deleteButton);
    card.append(actions);
    host.append(card);
  }
}

function renderDossierSelector() {
  const select = $("#dossierActiveSelect");
  const previous = activeDossierId;
  select.replaceChildren();
  for (const dossier of dossiers) {
    const option = makeElement("option", "", dossier.name);
    option.value = dossier.id;
    select.append(option);
  }
  if (dossiers.length) {
    activeDossierId = dossiers.some(item => item.id === previous) ? previous : dossiers[0].id;
    select.value = activeDossierId;
  } else {
    activeDossierId = null;
    const option = makeElement("option", "", "No hay expedientes");
    option.value = "";
    select.append(option);
  }
  updateActions();
}

async function renderDossierContents() {
  const reportHost = $("#dossierReportList");
  const artifactHost = $("#dossierArtifactList");
  reportHost.replaceChildren();
  artifactHost.replaceChildren();
  if (!activeDossierId) {
    reportHost.append(makeElement("p", "csv-preview-meta", "Seleccioná o creá un expediente."));
    artifactHost.append(makeElement("p", "csv-preview-meta", "No hay artefactos derivados."));
    return;
  }

  const [reports, artifacts] = await Promise.all([
    repository.listReports(activeDossierId),
    repository.listDerivedArtifacts(activeDossierId),
  ]);
  if (!reports.length) {
    reportHost.append(makeElement("p", "csv-preview-meta", "Este expediente todavía no tiene informes."));
  }
  for (const record of reports) {
    const card = makeElement("article", "dossier-history-card");
    const heading = makeElement("div", "dossier-history-heading");
    heading.append(
      makeElement("h4", "", record.fileName),
      makeElement("span", "dossier-card-count", statusLabel(record.report.status)),
    );
    card.append(heading);
    card.append(makeElement("p", "dossier-card-meta",
      formatDate(record.storedAt) + " · " + record.report.channels.length +
      " canal(es) comparables · " + record.report.excludedChannels.length + " excluido(s)"));
    const sourceFiles = await repository.listSourceFiles(record.id);
    card.append(makeElement("p", "dossier-card-meta",
      sourceFiles.length
        ? sourceFiles.length + " CSV original(es) archivado(s) por separado"
        : "Solo informe y referencias SHA-256; no hay bytes CSV archivados"));
    const actions = makeElement("div", "dossier-card-actions");
    const openButton = makeElement("button", "secondary-button", "Abrir informe");
    openButton.type = "button";
    openButton.addEventListener("click", () => {
      try {
        openSavedImportedReport(record.report, record.fileName);
        setStatus("Se abrió el informe almacenado en " + dossiers.find(item => item.id === activeDossierId)?.name + ".");
      } catch (error) {
        setStatus(error?.message ?? "No se pudo abrir el informe guardado.", "error");
      }
    });
    actions.append(openButton);
    for (const source of sourceFiles) {
      const downloadButton = makeElement("button", "text-button",
        "Descargar CSV " + (source.role === "reference" ? "referencia" : "candidata"));
      downloadButton.type = "button";
      downloadButton.addEventListener("click", async () => {
        try {
          const current = (await repository.listSourceFiles(record.id)).find(item => item.id === source.id);
          if (!current?.blob) throw new Error("El CSV original no está disponible en el almacén local.");
          downloadBlob(current.blob, current.name);
          setStatus("Se preparó la descarga del CSV original " + current.role + ".");
        } catch (error) {
          setStatus(error?.message ?? "No se pudo descargar el CSV original.", "error");
        }
      });
      actions.append(downloadButton);
    }
    const removeButton = makeElement("button", "text-button", "Eliminar informe");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => removeReport(record));
    actions.append(removeButton);
    card.append(actions);
    reportHost.append(card);
  }

  if (!artifacts.length) {
    artifactHost.append(makeElement("p", "csv-preview-meta", "Este expediente todavía no tiene artefactos derivados."));
  }
  for (const artifact of artifacts) {
    const card = makeElement("article", "dossier-history-card");
    card.append(
      makeElement("h4", "", artifact.kind),
      makeElement("p", "dossier-card-meta",
        artifact.algorithm + " · versión " + artifact.algorithmVersion + " · " + formatDate(artifact.createdAt)),
      makeElement("p", "dossier-card-meta",
        (artifact.source?.name ?? "Origen no declarado") + " · " +
        (artifact.source?.sampleCount ?? "—") + " muestras fuente"),
    );
    const actions = makeElement("div", "dossier-card-actions");
    const downloadButton = makeElement("button", "secondary-button", "Descargar artefacto JSON");
    downloadButton.type = "button";
    downloadButton.addEventListener("click", () => {
      downloadJson(artifact, "datalog-derived-" + artifact.id + ".json");
    });
    const removeButton = makeElement("button", "text-button", "Eliminar artefacto");
    removeButton.type = "button";
    removeButton.addEventListener("click", async () => {
      if (!window.confirm("¿Eliminar este artefacto derivado del expediente?")) return;
      try {
        await repository.removeDerivedArtifact(artifact.id);
        await renderDossierContents();
        await renderDossierCards();
        setStatus("Artefacto derivado eliminado.");
      } catch (error) {
        setStatus(error?.message ?? "No se pudo eliminar el artefacto.", "error");
      }
    });
    actions.append(downloadButton, removeButton);
    card.append(actions);
    artifactHost.append(card);
  }
}

async function refreshDossiers() {
  dossiers = await repository.listDossiers();
  renderDossierSelector();
  await renderDossierCards();
  await renderDossierContents();
  updateActions();
}

async function activateDossier(id) {
  if (!dossiers.some(item => item.id === id)) return;
  activeDossierId = id;
  $("#dossierActiveSelect").value = id;
  await renderDossierCards();
  await renderDossierContents();
  updateActions();
}

async function createDossier(event) {
  event.preventDefault();
  try {
    const dossier = await repository.createDossier({
      name: $("#dossierName").value,
      vehicleLabel: $("#dossierVehicleLabel").value,
      notes: $("#dossierNotes").value,
    });
    $("#dossierCreateForm").reset();
    activeDossierId = dossier.id;
    await refreshDossiers();
    setStatus("Expediente creado y guardado localmente en este navegador.");
  } catch (error) {
    setStatus(error?.message ?? "No se pudo crear el expediente.", "error");
  }
}

async function deleteDossier(id = activeDossierId) {
  const dossier = dossiers.find(item => item.id === id);
  if (!dossier || !window.confirm(
    "¿Eliminar el expediente «" + dossier.name +
    "» y todos sus informes, CSV archivados y artefactos derivados? Esta acción no se puede deshacer."
  )) return;
  try {
    await repository.deleteDossier(id);
    if (activeDossierId === id) activeDossierId = null;
    await refreshDossiers();
    setStatus("Expediente y sus datos asociados eliminados del almacenamiento local.");
  } catch (error) {
    setStatus(error?.message ?? "No se pudo eliminar el expediente.", "error");
  }
}

async function savePendingReport() {
  if (!activeDossierId || !pendingReport) return;
  const includeOriginals = $("#dossierArchiveOriginals").checked;
  try {
    const sourceFiles = includeOriginals ? pendingSourceFiles : [];
    const record = await repository.saveReport({
      dossierId: activeDossierId,
      report: pendingReport,
      fileName: pendingFileName,
      sourceFiles,
    });
    $("#dossierArchiveOriginals").checked = false;
    await renderDossierContents();
    await renderDossierCards();
    setStatus(
      "Informe guardado en el expediente." +
      (record.archivedSourceFileCount
        ? " También se archivaron " + record.archivedSourceFileCount + " CSV originales en el almacén separado."
        : " Solo se guardó el resumen; los bytes CSV no se copiaron."),
      "success",
    );
  } catch (error) {
    setStatus(error?.message ?? "No se pudo guardar el informe.", "error");
  }
}

async function savePendingDerivedArtifact() {
  if (!activeDossierId || !pendingDerivedArtifact) return;
  try {
    const record = await repository.saveDerivedArtifact({
      dossierId: activeDossierId,
      artifact: pendingDerivedArtifact,
    });
    pendingDerivedArtifact = null;
    updateActions();
    await renderDossierContents();
    await renderDossierCards();
    setStatus("Artefacto derivado guardado por separado: " + record.kind + ".", "success");
  } catch (error) {
    setStatus(error?.message ?? "No se pudo guardar el artefacto derivado.", "error");
  }
}

async function exportActiveBackup() {
  if (!activeDossierId) return;
  try {
    const backup = await repository.createBackup(activeDossierId);
    downloadJson(backup, "datalog-dossier-backup-" + activeDossierId + ".json");
    const sourceCount = backup.sourceArchives.archivedFileCount;
    setStatus(
      "Respaldo JSON generado. Incluye " + backup.reports.length +
      " informe(s) y " + backup.derivedArtifacts.length + " artefacto(s). " +
      sourceCount + " CSV original(es) archivado(s) permanecen fuera del respaldo.",
      "success",
    );
  } catch (error) {
    setStatus(error?.message ?? "No se pudo generar el respaldo.", "error");
  }
}

async function readBackup(file) {
  if (!file) throw new Error("Seleccioná un respaldo JSON.");
  if (file.size === 0) throw new Error("El respaldo está vacío.");
  if (file.size > LOCAL_DOSSIER_LIMITS.maxBackupBytes) {
    throw new RangeError("El respaldo supera el límite de 30 MiB.");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error("El respaldo no contiene texto UTF-8 válido.");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("El archivo seleccionado no contiene JSON válido.");
  }
}

async function restoreBackup(event) {
  event.preventDefault();
  const file = $("#dossierBackupFile").files?.[0];
  $("#dossierRestoreButton").disabled = true;
  setStatus("Leyendo, validando informes y restaurando el respaldo…");
  try {
    const backup = await readBackup(file);
    const result = await repository.restoreBackup(backup, {
      validateReport: report => validateImportedComparisonReport(
        report, importedComparisonSchema, { maxErrors: 50 },
      ),
    });
    activeDossierId = result.dossier.id;
    $("#dossierRestoreForm").reset();
    await refreshDossiers();
    setStatus(
      "Respaldo restaurado como expediente nuevo: " + result.dossier.name +
      ". Informes: " + result.reportCount +
      "; artefactos: " + result.derivedArtifactCount +
      ". Los CSV originales no se incluyen en el respaldo.",
      "success",
    );
  } catch (error) {
    setStatus(error?.message ?? "No se pudo restaurar el respaldo.", "error");
  } finally {
    $("#dossierRestoreButton").disabled = !$("#dossierBackupFile").files?.length;
  }
}

async function removeReport(record) {
  if (!window.confirm(
    "¿Eliminar el informe «" + record.fileName +
    "» y los CSV originales/artefactos vinculados a él?"
  )) return;
  try {
    await repository.removeReport(record.id);
    await renderDossierContents();
    await renderDossierCards();
    setStatus("Informe y archivos vinculados eliminados del expediente.");
  } catch (error) {
    setStatus(error?.message ?? "No se pudo eliminar el informe.", "error");
  }
}

function handleReportReady(event) {
  const detail = event.detail ?? {};
  if (!detail.report) return;
  pendingReport = detail.report;
  pendingFileName = detail.fileName ?? "comparacion.json";
  pendingSourceFiles = Array.isArray(detail.sourceFiles) ? detail.sourceFiles : [];
  $("#dossierPendingReportStatus").textContent =
    "Informe listo: " + pendingFileName + " · " +
    pendingReport.channels.length + " canal(es) · " +
    pendingSourceFiles.length + " CSV original(es) disponibles para archivado opcional.";
  updateActions();
}

function handleReportClosed() {
  pendingReport = null;
  pendingSourceFiles = [];
  $("#dossierPendingReportStatus").textContent = "Abrí o generá un informe validado para guardarlo en un expediente.";
  updateActions();
}

function handleDerivedReady(event) {
  pendingDerivedArtifact = event.detail?.artifact ?? null;
  $("#dossierPendingDerivedStatus").textContent = pendingDerivedArtifact
    ? "Artefacto disponible: " + pendingDerivedArtifact.kind + " · " + pendingDerivedArtifact.algorithm
    : "No hay un artefacto derivado pendiente.";
  updateActions();
}

function handleDerivedCleared() {
  pendingDerivedArtifact = null;
  $("#dossierPendingDerivedStatus").textContent = "No hay un artefacto derivado pendiente.";
  updateActions();
}

export function initializeDossierInspector() {
  if (initialized) return;
  const workspace = $("#dossierWorkspace");
  if (!workspace) return;
  initialized = true;

  window.addEventListener("datalog:report-ready", handleReportReady);
  window.addEventListener("datalog:report-closed", handleReportClosed);
  window.addEventListener("datalog:derived-ready", handleDerivedReady);
  window.addEventListener("datalog:derived-cleared", handleDerivedCleared);

  $("#dossierCreateForm").addEventListener("submit", createDossier);
  $("#dossierActiveSelect").addEventListener("change", event => {
    activateDossier(event.target.value);
  });
  $("#dossierDeleteButton").addEventListener("click", () => deleteDossier());
  $("#dossierSaveReportButton").addEventListener("click", savePendingReport);
  $("#dossierSaveDerivedButton").addEventListener("click", savePendingDerivedArtifact);
  $("#dossierExportBackupButton").addEventListener("click", exportActiveBackup);
  $("#dossierBackupFile").addEventListener("change", () => {
    $("#dossierRestoreButton").disabled = !$("#dossierBackupFile").files?.length;
  });
  $("#dossierRestoreForm").addEventListener("submit", restoreBackup);

  (async () => {
    try {
      repository = createLocalDossierRepository();
      await refreshDossiers();
      const estimate = typeof navigator.storage?.estimate === "function"
        ? await navigator.storage.estimate().catch(() => null)
        : null;
      const usage = estimate?.usage;
      const quota = estimate?.quota;
      const capacity = Number.isFinite(usage) && Number.isFinite(quota)
        ? " Almacenamiento estimado: " + formatBytes(usage) + " de " + formatBytes(quota) + "."
        : "";
      setStatus("Almacenamiento local disponible. Los datos permanecen en este perfil del navegador." + capacity);
    } catch (error) {
      setStatus(error?.message ?? "El almacenamiento local no está disponible.", "error");
      for (const selector of [
        "#dossierCreateButton", "#dossierActiveSelect", "#dossierSaveReportButton",
        "#dossierSaveDerivedButton", "#dossierExportBackupButton", "#dossierRestoreButton",
      ]) {
        const control = $(selector);
        if (control) control.disabled = true;
      }
    }
  })();
}
