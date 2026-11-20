export const LOCAL_DOSSIER_DATABASE = "datalog-comparison-local-vault";
export const LOCAL_DOSSIER_DATABASE_VERSION = 1;
export const LOCAL_DOSSIER_BACKUP_SCHEMA = "datalog-local-dossier-backup/1";
export const LOCAL_DOSSIER_LIMITS = Object.freeze({
  maxReportBytes: 10 * 1024 * 1024,
  maxBackupBytes: 30 * 1024 * 1024,
  maxBackupReports: 250,
  maxBackupArtifacts: 1000,
  maxSourceFileBytes: 100 * 1024 * 1024,
  maxSourceFilesBytes: 150 * 1024 * 1024,
  maxDerivedArtifactBytes: 8 * 1024 * 1024,
});

const STORE_NAMES = ["dossiers", "reports", "sourceFiles", "derivedArtifacts"];
const REPORT_SCHEMA_PREFIX = "datalog-imported-run-comparison/";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleanText(value, maximumLength, label, { required = false } = {}) {
  if (typeof value !== "string") {
    if (required) throw new TypeError(label + " debe ser texto.");
    return "";
  }
  const normalized = value.replace(CONTROL_CHARACTERS, " ").trim();
  if (required && !normalized) throw new TypeError(label + " es obligatorio.");
  if (normalized.length > maximumLength) {
    throw new RangeError(label + " supera " + maximumLength + " caracteres.");
  }
  return normalized;
}

function safeFileName(value) {
  const text = cleanText(value, 512, "Nombre de archivo") || "informe.json";
  const baseName = text.split(/[\\/]/).pop()?.trim();
  return (baseName || "informe.json").slice(0, 180);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(cryptoImpl) {
  if (typeof cryptoImpl?.randomUUID === "function") return cryptoImpl.randomUUID();
  if (typeof cryptoImpl?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoImpl.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) +
      "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }
  throw new Error("El navegador no ofrece un generador de identificadores seguro.");
}

function assertAllowedKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label + " debe ser un objeto JSON.");
  }
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length) {
    throw new TypeError(label + " contiene campos no permitidos: " + unexpected.slice(0, 5).join(", "));
  }
}

function jsonClone(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(label + " no se puede serializar como JSON.");
  }
  if (typeof serialized !== "string") throw new TypeError(label + " no contiene un documento JSON.");
  return JSON.parse(serialized);
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falló una operación de IndexedDB."));
  });
}

function transactionPromise(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let actionError = null;
    try {
      transaction = db.transaction(stores, mode);
    } catch (error) {
      reject(error);
      return;
    }
    const abort = error => {
      actionError = error instanceof Error ? error : new Error(String(error));
      try {
        transaction.abort();
      } catch {
        reject(actionError);
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => {
      actionError ??= transaction.error ?? new Error("La transacción de IndexedDB falló.");
    };
    transaction.onabort = () => reject(actionError ?? transaction.error ?? new Error("La transacción fue cancelada."));
    try {
      action(transaction, value => { result = value; }, abort);
    } catch (error) {
      abort(error);
    }
  });
}

function createDatabase(indexedDBImpl) {
  if (!indexedDBImpl || typeof indexedDBImpl.open !== "function") {
    return Promise.reject(new Error("IndexedDB no está disponible en este navegador o contexto."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(
      LOCAL_DOSSIER_DATABASE,
      LOCAL_DOSSIER_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      const createStore = (name, options, indexes) => {
        const store = database.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : database.createObjectStore(name, options);
        for (const [indexName, keyPath, indexOptions] of indexes) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, indexOptions);
        }
      };
      createStore("dossiers", { keyPath: "id" }, [
        ["updatedAt", "updatedAt", { unique: false }],
      ]);
      createStore("reports", { keyPath: "id" }, [
        ["dossierId", "dossierId", { unique: false }],
        ["storedAt", "storedAt", { unique: false }],
      ]);
      createStore("sourceFiles", { keyPath: "id" }, [
        ["dossierId", "dossierId", { unique: false }],
        ["reportId", "reportId", { unique: false }],
      ]);
      createStore("derivedArtifacts", { keyPath: "id" }, [
        ["dossierId", "dossierId", { unique: false }],
        ["reportId", "reportId", { unique: false }],
      ]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la base de expedientes locales."));
    request.onblocked = () => reject(new Error("La base local está abierta en otra pestaña. Cerrá la otra pestaña y volvé a intentar."));
  });
}

async function sha256Blob(blob, cryptoImpl) {
  if (!cryptoImpl?.subtle?.digest) throw new Error("SHA-256 no está disponible; no se archivarán los originales.");
  const digest = await cryptoImpl.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function sourceReferences(report) {
  return ["reference", "candidate"].map(role => {
    const run = report[role];
    return {
      role,
      name: safeFileName(run.name),
      domain: run.domain,
      sampleCount: run.sampleCount,
      sha256: run.sha256,
    };
  });
}

function normalizeArtifact(input, { id, dossierId, reportId, createdAt } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("El artefacto derivado debe ser un objeto.");
  }
  const payload = jsonClone(input.payload, "El contenido del artefacto");
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (payloadBytes > LOCAL_DOSSIER_LIMITS.maxDerivedArtifactBytes) {
    throw new RangeError("El artefacto derivado supera el límite de 8 MiB.");
  }
  return {
    id: id ?? (cleanText(input.id, 80, "ID del artefacto") || null),
    dossierId: dossierId ?? input.dossierId,
    reportId: reportId ?? input.reportId ?? null,
    kind: cleanText(input.kind, 80, "Tipo de artefacto", { required: true }),
    algorithm: cleanText(input.algorithm, 160, "Algoritmo", { required: true }),
    algorithmVersion: cleanText(input.algorithmVersion, 80, "Versión del algoritmo") || "no-declarada",
    source: jsonClone(input.source ?? {}, "La referencia de origen"),
    metadata: jsonClone(input.metadata ?? {}, "Los metadatos derivados"),
    payload,
    createdAt: createdAt ?? input.createdAt ?? nowIso(),
  };
}

export function createLocalDossierRepository({
  indexedDBImpl = globalThis.indexedDB,
  cryptoImpl = globalThis.crypto,
} = {}) {
  let databasePromise = null;

  async function database() {
    if (!databasePromise) {
      databasePromise = createDatabase(indexedDBImpl).catch(error => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }

  async function getDossier(id) {
    const db = await database();
    return transactionPromise(db, ["dossiers"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("dossiers").get(id);
      request.onsuccess = () => setResult(request.result ?? null);
    });
  }

  async function listDossiers() {
    const db = await database();
    const records = await transactionPromise(db, ["dossiers"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("dossiers").getAll();
      request.onsuccess = () => setResult(request.result ?? []);
    });
    return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function createDossier(input = {}) {
    const db = await database();
    const timestamp = nowIso();
    const record = {
      id: makeId(cryptoImpl),
      schema: "datalog-local-dossier/1",
      name: cleanText(input.name, 100, "Nombre del expediente", { required: true }),
      vehicleLabel: cleanText(input.vehicleLabel, 180, "Identificación del vehículo"),
      notes: cleanText(input.notes, 2000, "Notas"),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await transactionPromise(db, ["dossiers"], "readwrite", (tx, setResult) => {
      tx.objectStore("dossiers").add(record);
      setResult(record);
    });
    return record;
  }

  async function updateDossier(id, patch = {}) {
    const db = await database();
    return transactionPromise(db, ["dossiers"], "readwrite", (tx, setResult, abort) => {
      const store = tx.objectStore("dossiers");
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current) {
          abort(new Error("El expediente ya no existe."));
          return;
        }
        const updated = {
          ...current,
          name: Object.hasOwn(patch, "name")
            ? cleanText(patch.name, 100, "Nombre del expediente", { required: true })
            : current.name,
          vehicleLabel: Object.hasOwn(patch, "vehicleLabel")
            ? cleanText(patch.vehicleLabel, 180, "Identificación del vehículo")
            : current.vehicleLabel,
          notes: Object.hasOwn(patch, "notes")
            ? cleanText(patch.notes, 2000, "Notas")
            : current.notes,
          updatedAt: nowIso(),
        };
        store.put(updated);
        setResult(updated);
      };
    });
  }

  async function listReports(dossierId) {
    const db = await database();
    const records = await transactionPromise(db, ["reports"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("reports").index("dossierId").getAll(dossierId);
      request.onsuccess = () => setResult(request.result ?? []);
    });
    return records.sort((left, right) => right.storedAt.localeCompare(left.storedAt));
  }

  async function getReport(reportId) {
    const db = await database();
    return transactionPromise(db, ["reports"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("reports").get(reportId);
      request.onsuccess = () => setResult(request.result ?? null);
    });
  }

  async function prepareSourceFiles(report, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    if (attachments.length > 2) throw new RangeError("Se pueden archivar como máximo los dos CSV de la comparación.");
    let totalBytes = 0;
    const prepared = [];
    const roles = new Set();
    for (const attachment of attachments) {
      const role = attachment?.role;
      if (!["reference", "candidate"].includes(role) || roles.has(role)) {
        throw new TypeError("Cada CSV original debe tener un rol único: referencia o candidata.");
      }
      roles.add(role);
      const file = attachment.file;
      if (!(typeof Blob !== "undefined" && file instanceof Blob)) {
        throw new TypeError("No se recibió un archivo CSV válido para archivar.");
      }
      if (file.size === 0 || file.size > LOCAL_DOSSIER_LIMITS.maxSourceFileBytes) {
        throw new RangeError("Cada CSV original debe pesar entre 1 byte y 100 MiB.");
      }
      totalBytes += file.size;
      if (totalBytes > LOCAL_DOSSIER_LIMITS.maxSourceFilesBytes) {
        throw new RangeError("El conjunto de CSV originales supera 150 MiB.");
      }
      const expectedHash = report[role]?.sha256;
      if (!/^[a-f0-9]{64}$/i.test(expectedHash ?? "")) {
        throw new Error("El informe no contiene una huella SHA-256 válida para " + role + ".");
      }
      const actualHash = await sha256Blob(file, cryptoImpl);
      if (actualHash !== expectedHash.toLowerCase()) {
        throw new Error("El SHA-256 del CSV " + role + " no coincide con el informe; no se archivó ningún original.");
      }
      const fileName = safeFileName(attachment.name ?? file.name ?? report[role].name);
      prepared.push({
        id: makeId(cryptoImpl),
        role,
        name: fileName,
        size: file.size,
        mimeType: cleanText(file.type, 120, "Tipo de archivo") || "text/csv",
        sha256: actualHash,
        blob: file.slice(0, file.size, file.type || "text/csv"),
        storedAt: nowIso(),
      });
    }
    return prepared;
  }

  async function saveReport({ dossierId, report, fileName, sourceFiles = [] } = {}) {
    if (!report || report.schema?.startsWith(REPORT_SCHEMA_PREFIX) !== true) {
      throw new TypeError("El informe no pertenece al contrato de comparación importada.");
    }
    const serialized = JSON.stringify(report);
    if (new TextEncoder().encode(serialized).byteLength > LOCAL_DOSSIER_LIMITS.maxReportBytes) {
      throw new RangeError("El informe supera el límite de 10 MiB.");
    }
    const preparedSources = await prepareSourceFiles(report, sourceFiles);
    const db = await database();
    const recordId = makeId(cryptoImpl);
    const timestamp = nowIso();
    const storedReport = {
      id: recordId,
      dossierId,
      schema: "datalog-stored-report/1",
      reportSchema: report.schema,
      fileName: safeFileName(fileName ?? "comparacion.json"),
      storedAt: timestamp,
      sourceReferences: sourceReferences(report),
      archivedSourceFileCount: preparedSources.length,
      report: jsonClone(report, "El informe"),
    };

    await transactionPromise(db, ["dossiers", "reports", "sourceFiles"], "readwrite", (tx, setResult, abort) => {
      const dossierRequest = tx.objectStore("dossiers").get(dossierId);
      dossierRequest.onsuccess = () => {
        const dossier = dossierRequest.result;
        if (!dossier) {
          abort(new Error("Seleccioná un expediente existente antes de guardar el informe."));
          return;
        }
        tx.objectStore("reports").add(storedReport);
        for (const source of preparedSources) {
          tx.objectStore("sourceFiles").add({
            ...source,
            dossierId,
            reportId: recordId,
          });
        }
        const updatedDossier = { ...dossier, updatedAt: timestamp };
        tx.objectStore("dossiers").put(updatedDossier);
        setResult(storedReport);
      };
    });
    return storedReport;
  }

  async function listSourceFiles(reportId) {
    const db = await database();
    const records = await transactionPromise(db, ["sourceFiles"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("sourceFiles").index("reportId").getAll(reportId);
      request.onsuccess = () => setResult(request.result ?? []);
    });
    return records.sort((left, right) => left.role.localeCompare(right.role));
  }

  async function removeReport(reportId) {
    const db = await database();
    await transactionPromise(db, ["reports", "sourceFiles", "derivedArtifacts"], "readwrite", (tx, setResult) => {
      const reportRequest = tx.objectStore("reports").get(reportId);
      const sourceRequest = tx.objectStore("sourceFiles").index("reportId").getAllKeys(reportId);
      const artifactRequest = tx.objectStore("derivedArtifacts").index("reportId").getAllKeys(reportId);
      let reportReady = false, sourcesReady = false, artifactsReady = false;
      let report = null, sourceKeys = [], artifactKeys = [];
      const finish = () => {
        if (!reportReady || !sourcesReady || !artifactsReady) return;
        if (report) {
          tx.objectStore("reports").delete(reportId);
          for (const key of sourceKeys) tx.objectStore("sourceFiles").delete(key);
          for (const key of artifactKeys) tx.objectStore("derivedArtifacts").delete(key);
        }
        setResult(Boolean(report));
      };
      reportRequest.onsuccess = () => { report = reportRequest.result ?? null; reportReady = true; finish(); };
      sourceRequest.onsuccess = () => { sourceKeys = sourceRequest.result ?? []; sourcesReady = true; finish(); };
      artifactRequest.onsuccess = () => { artifactKeys = artifactRequest.result ?? []; artifactsReady = true; finish(); };
    });
  }

  async function deleteDossier(dossierId) {
    const db = await database();
    await transactionPromise(db, STORE_NAMES, "readwrite", (tx, setResult) => {
      const requests = STORE_NAMES.map(name => [name, tx.objectStore(name).getAll()]);
      const values = new Map();
      for (const [name, request] of requests) {
        request.onsuccess = () => {
          values.set(name, request.result ?? []);
          if (values.size !== STORE_NAMES.length) return;
          const reports = values.get("reports").filter(record => record.dossierId === dossierId);
          const reportIds = new Set(reports.map(record => record.id));
          tx.objectStore("dossiers").delete(dossierId);
          for (const report of reports) tx.objectStore("reports").delete(report.id);
          for (const record of values.get("sourceFiles")) {
            if (record.dossierId === dossierId || reportIds.has(record.reportId)) {
              tx.objectStore("sourceFiles").delete(record.id);
            }
          }
          for (const record of values.get("derivedArtifacts")) {
            if (record.dossierId === dossierId || reportIds.has(record.reportId)) {
              tx.objectStore("derivedArtifacts").delete(record.id);
            }
          }
          setResult(Boolean(values.get("dossiers").some(record => record.id === dossierId)));
        };
      }
    });
  }

  async function saveDerivedArtifact({ dossierId, reportId = null, artifact } = {}) {
    const normalized = normalizeArtifact(artifact, { id: makeId(cryptoImpl), dossierId, reportId });
    const db = await database();
    await transactionPromise(db, ["dossiers", "reports", "derivedArtifacts"], "readwrite", (tx, setResult, abort) => {
      const dossierRequest = tx.objectStore("dossiers").get(dossierId);
      dossierRequest.onsuccess = () => {
        if (!dossierRequest.result) {
          abort(new Error("El expediente seleccionado ya no existe."));
          return;
        }
        const insert = () => {
          tx.objectStore("derivedArtifacts").add(normalized);
          tx.objectStore("dossiers").put({ ...dossierRequest.result, updatedAt: normalized.createdAt });
          setResult(normalized);
        };
        if (!reportId) {
          insert();
          return;
        }
        const reportRequest = tx.objectStore("reports").get(reportId);
        reportRequest.onsuccess = () => {
          if (!reportRequest.result || reportRequest.result.dossierId !== dossierId) {
            abort(new Error("El informe asociado no pertenece al expediente seleccionado."));
            return;
          }
          insert();
        };
      };
    });
    return normalized;
  }

  async function listDerivedArtifacts(dossierId) {
    const db = await database();
    const records = await transactionPromise(db, ["derivedArtifacts"], "readonly", (tx, setResult) => {
      const request = tx.objectStore("derivedArtifacts").index("dossierId").getAll(dossierId);
      request.onsuccess = () => setResult(request.result ?? []);
    });
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function removeDerivedArtifact(artifactId) {
    const db = await database();
    await transactionPromise(db, ["derivedArtifacts"], "readwrite", (tx, setResult) => {
      const request = tx.objectStore("derivedArtifacts").get(artifactId);
      request.onsuccess = () => {
        const exists = Boolean(request.result);
        if (exists) tx.objectStore("derivedArtifacts").delete(artifactId);
        setResult(exists);
      };
    });
  }

  async function createBackup(dossierId) {
    const db = await database();
    const snapshot = await transactionPromise(
      db, ["dossiers", "reports", "sourceFiles", "derivedArtifacts"], "readonly",
      (tx, setResult) => {
        const result = {};
        const stores = ["dossiers", "reports", "sourceFiles", "derivedArtifacts"];
        for (const name of stores) {
          const request = name === "dossiers"
            ? tx.objectStore(name).get(dossierId)
            : tx.objectStore(name).index("dossierId").getAll(dossierId);
          request.onsuccess = () => {
            result[name] = request.result ?? (name === "dossiers" ? null : []);
            if (Object.keys(result).length === stores.length) setResult(result);
          };
        }
      },
    );
    if (!snapshot.dossiers) throw new Error("El expediente no existe o fue eliminado.");
    const reportIds = new Set(snapshot.reports.map(record => record.id));
    const archiveMetadata = snapshot.sourceFiles.map(record => ({
      role: record.role,
      reportId: record.reportId,
      name: record.name,
      size: record.size,
      mimeType: record.mimeType,
      sha256: record.sha256,
      storedAt: record.storedAt,
      contentIncluded: false,
    }));
    const backup = {
      schema: LOCAL_DOSSIER_BACKUP_SCHEMA,
      createdAt: nowIso(),
      dossier: {
        name: snapshot.dossiers.name,
        vehicleLabel: snapshot.dossiers.vehicleLabel,
        notes: snapshot.dossiers.notes,
        createdAt: snapshot.dossiers.createdAt,
        updatedAt: snapshot.dossiers.updatedAt,
      },
      reports: snapshot.reports.map(record => ({
        id: record.id,
        fileName: record.fileName,
        reportSchema: record.reportSchema,
        storedAt: record.storedAt,
        sourceReferences: record.sourceReferences,
        report: record.report,
      })),
      derivedArtifacts: snapshot.derivedArtifacts.map(record => ({
        id: record.id,
        reportId: reportIds.has(record.reportId) ? record.reportId : null,
        kind: record.kind,
        algorithm: record.algorithm,
        algorithmVersion: record.algorithmVersion,
        source: record.source,
        metadata: record.metadata,
        payload: record.payload,
        createdAt: record.createdAt,
      })),
      sourceArchives: {
        contentIncluded: false,
        archivedFileCount: archiveMetadata.length,
        references: archiveMetadata,
      },
      limitations: [
        "El respaldo contiene metadatos de expediente, informes de resumen y artefactos derivados.",
        "No incluye los bytes de los CSV originales. Estos permanecen en el almacén local separado y pueden descargarse desde el expediente.",
        "Los informes no contienen muestras crudas ni series temporales originales.",
      ],
    };
    const backupBytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength;
    if (backupBytes > LOCAL_DOSSIER_LIMITS.maxBackupBytes) {
      throw new RangeError("El respaldo supera el límite de 30 MiB.");
    }
    return backup;
  }

  async function restoreBackup(backup, { validateReport } = {}) {
    if (!backup || typeof backup !== "object" || Array.isArray(backup) ||
        backup.schema !== LOCAL_DOSSIER_BACKUP_SCHEMA) {
      throw new TypeError("El respaldo no corresponde al contrato local de expedientes.");
    }
    assertAllowedKeys(backup,
      ["schema", "createdAt", "dossier", "reports", "derivedArtifacts", "sourceArchives", "limitations"],
      "El respaldo");
    assertAllowedKeys(backup.dossier,
      ["name", "vehicleLabel", "notes", "createdAt", "updatedAt"],
      "Los metadatos del expediente");
    assertAllowedKeys(backup.sourceArchives,
      ["contentIncluded", "archivedFileCount", "references"],
      "El manifiesto de archivos originales");
    if (backup.sourceArchives.contentIncluded !== false ||
        !Array.isArray(backup.sourceArchives.references) ||
        backup.sourceArchives.archivedFileCount !== backup.sourceArchives.references.length) {
      throw new Error("El respaldo no puede contener bytes de CSV originales; solo se aceptan referencias verificables.");
    }
    for (const reference of backup.sourceArchives.references) {
      assertAllowedKeys(reference,
        ["role", "reportId", "name", "size", "mimeType", "sha256", "storedAt", "contentIncluded"],
        "La referencia de archivo original");
      if (reference.contentIncluded !== false ||
          !["reference", "candidate"].includes(reference.role) ||
          !/^[a-f0-9]{64}$/i.test(reference.sha256 ?? "")) {
        throw new Error("El manifiesto contiene una referencia de CSV no válida.");
      }
    }
    for (const item of backup.reports ?? []) {
      assertAllowedKeys(item,
        ["id", "fileName", "reportSchema", "storedAt", "sourceReferences", "report"],
        "Un informe del respaldo");
    }
    for (const item of backup.derivedArtifacts ?? []) {
      assertAllowedKeys(item,
        ["id", "reportId", "kind", "algorithm", "algorithmVersion", "source", "metadata", "payload", "createdAt"],
        "Un artefacto derivado del respaldo");
    }
    let backupBytes;
    try {
      backupBytes = new TextEncoder().encode(JSON.stringify(backup)).byteLength;
    } catch {
      throw new TypeError("El respaldo no se puede procesar como JSON.");
    }
    if (backupBytes > LOCAL_DOSSIER_LIMITS.maxBackupBytes) {
      throw new RangeError("El respaldo supera el límite de 30 MiB.");
    }
    if (typeof validateReport !== "function") {
      throw new TypeError("Se requiere un validador de informes antes de restaurar el respaldo.");
    }
    if (!Array.isArray(backup.reports) || backup.reports.length > LOCAL_DOSSIER_LIMITS.maxBackupReports) {
      throw new RangeError("El respaldo supera el máximo de 250 informes.");
    }
    if (!Array.isArray(backup.derivedArtifacts) ||
        backup.derivedArtifacts.length > LOCAL_DOSSIER_LIMITS.maxBackupArtifacts) {
      throw new RangeError("El respaldo supera el máximo de 1000 artefactos derivados.");
    }
    const dossierInput = backup.dossier;
    const dossier = {
      id: makeId(cryptoImpl),
      schema: "datalog-local-dossier/1",
      name: cleanText(dossierInput?.name, 100, "Nombre del expediente", { required: true }),
      vehicleLabel: cleanText(dossierInput?.vehicleLabel, 180, "Identificación del vehículo"),
      notes: cleanText(dossierInput?.notes, 2000, "Notas"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      restoredFrom: "datalog-local-dossier-backup/1",
    };
    const idMap = new Map();
    const reports = [];
    for (const item of backup.reports) {
      if (!item || typeof item !== "object" || !item.report ||
          typeof item.report.schema !== "string" ||
          item.reportSchema !== item.report.schema ||
          !item.report.schema.startsWith(REPORT_SCHEMA_PREFIX)) {
        throw new TypeError("El respaldo contiene un informe con versión o estructura incorrecta.");
      }
      const errors = await validateReport(item.report);
      if (Array.isArray(errors) && errors.length) {
        throw new Error("No se puede restaurar un informe inválido: " + errors.slice(0, 4).join(" · "));
      }
      const id = makeId(cryptoImpl);
      if (item.id) idMap.set(item.id, id);
      reports.push({
        id,
        dossierId: dossier.id,
        schema: "datalog-stored-report/1",
        reportSchema: item.reportSchema,
        fileName: safeFileName(item.fileName),
        storedAt: nowIso(),
        sourceReferences: sourceReferences(item.report),
        archivedSourceFileCount: 0,
        report: jsonClone(item.report, "El informe del respaldo"),
      });
    }
    const artifacts = backup.derivedArtifacts.map(item => {
      const mappedReportId = item.reportId ? idMap.get(item.reportId) : null;
      if (item.reportId && !mappedReportId) {
        throw new Error("El respaldo contiene un artefacto asociado a un informe inexistente.");
      }
      return normalizeArtifact(item, {
        id: makeId(cryptoImpl),
        dossierId: dossier.id,
        reportId: mappedReportId,
        createdAt: nowIso(),
      });
    });
    const serializedBytes = new TextEncoder().encode(JSON.stringify({ dossier, reports, artifacts })).byteLength;
    if (serializedBytes > LOCAL_DOSSIER_LIMITS.maxBackupBytes) {
      throw new RangeError("El contenido restaurado supera el límite de 30 MiB.");
    }

    const db = await database();
    await transactionPromise(db, ["dossiers", "reports", "derivedArtifacts"], "readwrite", (tx, setResult) => {
      tx.objectStore("dossiers").add(dossier);
      for (const record of reports) tx.objectStore("reports").add(record);
      for (const record of artifacts) tx.objectStore("derivedArtifacts").add(record);
      setResult(dossier);
    });
    return { dossier, reportCount: reports.length, derivedArtifactCount: artifacts.length, sourceFilesRestored: 0 };
  }

  async function close() {
    if (databasePromise) {
      const db = await databasePromise.catch(() => null);
      db?.close();
      databasePromise = null;
    }
  }

  return Object.freeze({
    createDossier,
    updateDossier,
    getDossier,
    listDossiers,
    saveReport,
    listReports,
    getReport,
    listSourceFiles,
    removeReport,
    deleteDossier,
    saveDerivedArtifact,
    listDerivedArtifacts,
    removeDerivedArtifact,
    createBackup,
    restoreBackup,
    close,
  });
}
