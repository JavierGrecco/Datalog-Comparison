/**
 * Manifiesto versionado que vincula un registro importado con su ensayo.
 *
 * Reutiliza operating-conditions.mjs como fuente de verdad para condiciones
 * de operación; no copia archivos completos ni guarda rutas locales.
 */
export const RUN_MANIFEST_SCHEMA = "datalog-workbench.run-manifest/1";
export const RUN_MANIFEST_EVIDENCE = Object.freeze([
  "unknown", "user_declared", "read_from_file", "inferred", "verified",
]);
export const RUN_MANIFEST_CONTEXT_DEFINITIONS = Object.freeze([
  { key: "ecuModel", label: "Modelo de ECU", hint: "Marca y modelo, si se conoce." },
  { key: "ecuFirmware", label: "Firmware de ECU", hint: "Versión declarada o leída de la herramienta." },
  { key: "logger", label: "Herramienta de registro/exportación", hint: "Por ejemplo, FTManager, Vision, VCDS o MoTeC i2." },
  { key: "loggerVersion", label: "Versión de la herramienta", hint: "Versión que produjo o exportó el registro." },
  { key: "hardwareRevision", label: "Revisión de hardware", hint: "ECU, sensores o cambios de hardware relevantes." },
  { key: "operator", label: "Operador", hint: "Nombre o identificador interno; evitá datos personales innecesarios." },
  { key: "dynoModel", label: "Dinamómetro / equipo externo", hint: "Marca/modelo del equipo cuando corresponda." },
  { key: "testPurpose", label: "Objetivo del ensayo", hint: "Qué se quería comprobar en esta prueba." },
  { key: "calibrationSha256", label: "SHA-256 de la calibración", hint: "Huella del archivo de calibración si está disponible; no es su contenido." },
]);
export const RUN_MANIFEST_CONTEXT_FIELDS = Object.freeze([
  "ecuModel",
  "ecuFirmware",
  "logger",
  "loggerVersion",
  "hardwareRevision",
  "operator",
  "dynoModel",
  "testPurpose",
  "calibrationSha256",
]);

const evidenceSet = new Set(RUN_MANIFEST_EVIDENCE);
const roles = new Set(["unknown", "reference", "candidate", "replicate", "exploratory"]);
const lifecycles = new Set(["draft", "ready", "archived"]);
const hashPattern = /^[a-fA-F0-9]{64}$/;
const validText = value => typeof value === "string" && value.trim().length > 0;
const exactKeys = (value, expected) =>
  Object.keys(value).filter(key => !expected.includes(key));

export function createEvidenceField() {
  return { value: null, evidence: "unknown", source: "", note: "" };
}

export function createSourceFileManifest({
  displayName,
  sha256 = null,
  sizeBytes = null,
  format = createEvidenceField(),
  parser = createEvidenceField(),
  sourceTool = createEvidenceField(),
  exportVersion = createEvidenceField(),
  importedAt = null,
} = {}) {
  return {
    displayName: displayName ?? "",
    sha256,
    sizeBytes,
    format,
    parser,
    sourceTool,
    exportVersion,
    importedAt,
  };
}

export function createRunManifest({ id, role = "unknown", createdAt = null } = {}) {
  if (!validText(id)) throw new TypeError("id debe ser un identificador no vacío.");
  const context = Object.fromEntries(
    RUN_MANIFEST_CONTEXT_FIELDS.map(key => [key, createEvidenceField()])
  );
  return {
    schema: RUN_MANIFEST_SCHEMA,
    id: id.trim(),
    createdAt,
    updatedAt: null,
    role,
    lifecycle: "draft",
    sourceFiles: [],
    context,
    notes: "",
  };
}

function isDateTimeOrNull(value) {
  return value === null ||
    (validText(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value)));
}

function validateEvidenceField(field, label, errors) {
  if (!field || typeof field !== "object" || Array.isArray(field)) {
    errors.push(label + " debe ser un objeto de procedencia.");
    return;
  }
  const allowed = ["value", "evidence", "source", "note"];
  const extras = exactKeys(field, allowed);
  if (extras.length) errors.push(label + " tiene propiedades desconocidas: " + extras.join(", ") + ".");
  if (!Object.hasOwn(field, "value") || !(field.value === null || validText(field.value))) {
    errors.push(label + ".value debe ser texto no vacío o null.");
  }
  if (!evidenceSet.has(field.evidence)) errors.push(label + ".evidence no está reconocido.");
  if (typeof field.source !== "string" || field.source.length > 255) {
    errors.push(label + ".source debe ser texto de hasta 255 caracteres.");
  }
  if (typeof field.note !== "string" || field.note.length > 1000) {
    errors.push(label + ".note debe ser texto de hasta 1000 caracteres.");
  }
  if (field.evidence === "unknown") {
    if (field.value !== null) errors.push(label + " no puede afirmar un valor con evidencia unknown.");
    if (field.source !== "") errors.push(label + " no debe inventar una fuente para un campo desconocido.");
  } else {
    if (!validText(field.value)) errors.push(label + " requiere valor para la evidencia declarada.");
    if (!validText(field.source)) errors.push(label + " requiere indicar la procedencia del valor.");
  }
  if (field.evidence === "inferred" && !validText(field.note)) {
    errors.push(label + " debe explicar cómo se obtuvo el valor inferido.");
  }
}

function validateSourceFile(file, index, errors) {
  const label = "sourceFiles[" + index + "]";
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    errors.push(label + " debe ser un objeto.");
    return;
  }
  const allowed = [
    "displayName", "sha256", "sizeBytes", "format", "parser",
    "sourceTool", "exportVersion", "importedAt",
  ];
  const extras = exactKeys(file, allowed);
  if (extras.length) errors.push(label + " tiene propiedades desconocidas: " + extras.join(", ") + ".");
  if (!validText(file.displayName) || file.displayName.length > 255 ||
      file.displayName === "." || file.displayName === ".." ||
      /[/\\]/.test(file.displayName)) {
    errors.push(label + ".displayName debe ser un nombre de archivo, no una ruta local.");
  }
  if (file.sha256 !== null && (typeof file.sha256 !== "string" || !hashPattern.test(file.sha256))) {
    errors.push(label + ".sha256 debe ser una huella SHA-256 hexadecimal o null.");
  }
  if (file.sizeBytes !== null &&
      (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0)) {
    errors.push(label + ".sizeBytes debe ser un entero no negativo o null.");
  }
  for (const key of ["format", "parser", "sourceTool", "exportVersion"]) {
    validateEvidenceField(file[key], label + "." + key, errors);
  }
  if (!isDateTimeOrNull(file.importedAt)) {
    errors.push(label + ".importedAt debe ser una fecha ISO válida o null.");
  }
}

function sourceBasename(name) {
  const parts = String(name ?? "").split(/[\\/]/);
  return parts[parts.length - 1] || "archivo-sin-nombre.csv";
}

function inferredEvidence(value, source, note) {
  return { value, evidence: "inferred", source, note };
}

/**
 * Builds the manifest alongside an already-parsed run.
 * Operating conditions remain in run.operatingConditions as the single source
 * of truth; this manifest records file provenance and equipment context only.
 */
export function createRunManifestFromRun(
  run,
  { role = "unknown", createdAt = null, importedAt = null } = {},
) {
  if (!run || typeof run !== "object" || Array.isArray(run) || !validText(run.id)) {
    throw new TypeError("run debe ser un registro importado con identificador.");
  }
  const manifest = createRunManifest({ id: run.id, role, createdAt });
  const parserId = run.importMetadata?.parserId;
  const source = "metadatos de importación de Datalog Workbench";
  const formatValue = parserId === "vcds-exploratory/1"
    ? "vcds_grouped_csv"
    : parserId === "csv-delimited/1"
      ? "delimited_csv"
      : null;
  const format = formatValue
    ? inferredEvidence(
      formatValue,
      source,
      "Categoría asignada por el parser utilizado; no autentica el programa exportador.",
    )
    : createEvidenceField();
  const parser = validText(parserId)
    ? inferredEvidence(
      parserId,
      source,
      "Identifica la ruta de importación aplicada, no una validación física del contenido.",
    )
    : createEvidenceField();
  const sha256 = typeof run.sha256 === "string" && hashPattern.test(run.sha256)
    ? run.sha256
    : null;
  const sizeBytes = Number.isSafeInteger(run.sizeBytes) && run.sizeBytes >= 0
    ? run.sizeBytes
    : null;

  manifest.sourceFiles = [{
    ...createSourceFileManifest({
      displayName: sourceBasename(run.filename),
      sha256,
      sizeBytes,
      format,
      parser,
      sourceTool: createEvidenceField(),
      exportVersion: createEvidenceField(),
      importedAt,
    }),
  }];
  if (run.synthetic === true) {
    manifest.notes = "Registro de demostración sintético; no representa una medición física.";
  }
  return manifest;
}

export function validateRunManifest(manifest, label = "runManifest") {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return [label + " debe ser un objeto."];
  }
  const allowed = [
    "schema", "id", "createdAt", "updatedAt", "role", "lifecycle",
    "sourceFiles", "context", "notes",
  ];
  const extras = exactKeys(manifest, allowed);
  if (extras.length) errors.push(label + " tiene campos desconocidos: " + extras.join(", ") + ".");
  if (manifest.schema !== RUN_MANIFEST_SCHEMA) errors.push(label + ".schema no es compatible.");
  if (!validText(manifest.id) || manifest.id.length > 128) errors.push(label + ".id debe ser un identificador no vacío.");
  if (!isDateTimeOrNull(manifest.createdAt)) errors.push(label + ".createdAt debe ser una fecha ISO válida o null.");
  if (!isDateTimeOrNull(manifest.updatedAt)) errors.push(label + ".updatedAt debe ser una fecha ISO válida o null.");
  if (!roles.has(manifest.role)) errors.push(label + ".role no está reconocido.");
  if (!lifecycles.has(manifest.lifecycle)) errors.push(label + ".lifecycle no está reconocido.");

  if (!Array.isArray(manifest.sourceFiles) || manifest.sourceFiles.length > 20) {
    errors.push(label + ".sourceFiles debe ser una lista de hasta 20 archivos.");
  } else {
    manifest.sourceFiles.forEach((file, index) => validateSourceFile(file, index, errors));
    if (["ready", "archived"].includes(manifest.lifecycle)) {
      if (manifest.sourceFiles.length === 0) {
        errors.push(label + " no puede pasar a ready/archived sin al menos un archivo de origen.");
      }
      manifest.sourceFiles.forEach((file, index) => {
        if (!file || !hashPattern.test(file.sha256 ?? "")) {
          errors.push(label + ".sourceFiles[" + index + "] necesita SHA-256 antes de marcar el manifiesto ready/archived.");
        }
      });
    }
  }

  if (!manifest.context || typeof manifest.context !== "object" || Array.isArray(manifest.context)) {
    errors.push(label + ".context debe ser un objeto.");
  } else {
    const extraContext = exactKeys(manifest.context, RUN_MANIFEST_CONTEXT_FIELDS);
    if (extraContext.length) errors.push(label + ".context tiene campos desconocidos: " + extraContext.join(", ") + ".");
    for (const key of RUN_MANIFEST_CONTEXT_FIELDS) {
      validateEvidenceField(manifest.context[key], label + ".context." + key, errors);
    }
    const calibrationHash = manifest.context.calibrationSha256;
    if (calibrationHash?.value !== null &&
        calibrationHash?.value !== undefined &&
        !hashPattern.test(calibrationHash.value)) {
      errors.push(label + ".context.calibrationSha256.value debe ser una huella SHA-256.");
    }
  }

  if (typeof manifest.notes !== "string" || manifest.notes.length > 5000) {
    errors.push(label + ".notes debe ser texto de hasta 5000 caracteres.");
  }
  return errors;
}


// Los valores de contexto se comparan como evidencia documentada, no como prueba
// de equivalencia mecánica. No se bloquea la comparación numérica existente.
const MANIFEST_COMPARISON_PRIORITY = Object.freeze({
  ecuModel: "critical",
  ecuFirmware: "critical",
  hardwareRevision: "critical",
  calibrationSha256: "critical",
  logger: "relevant",
  loggerVersion: "relevant",
  dynoModel: "relevant",
  testPurpose: "informational",
  operator: "informational",
});
const MANIFEST_SOURCE_COMPARISON_FIELDS = Object.freeze([
  { key: "format", label: "Formato identificado", priority: "relevant" },
  { key: "parser", label: "Parser aplicado", priority: "relevant" },
  { key: "sourceTool", label: "Herramienta de origen", priority: "relevant" },
  { key: "exportVersion", label: "Versión de exportación", priority: "relevant" },
]);

function evidenceForComparison(field) {
  if (!field || typeof field !== "object" || field.evidence === "unknown" ||
      !validText(field.value) || !evidenceSet.has(field.evidence)) {
    return { known: false, value: null, evidence: "unknown", source: "", note: "" };
  }
  return {
    known: true,
    value: field.value.trim(),
    evidence: field.evidence,
    source: typeof field.source === "string" ? field.source : "",
    note: typeof field.note === "string" ? field.note : "",
  };
}

function comparisonValue(value, key) {
  const normalized = String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return key.toLowerCase().includes("sha256") ? normalized : normalized;
}

function compareManifestEvidence(key, label, priority, referenceField, candidateField, kind) {
  const reference = evidenceForComparison(referenceField);
  const candidate = evidenceForComparison(candidateField);
  let status;
  let explanation;
  if (!reference.known || !candidate.known) {
    status = "unknown";
    explanation = "Falta un valor documentado con procedencia en al menos uno de los dos registros.";
  } else if (comparisonValue(reference.value, key) !== comparisonValue(candidate.value, key)) {
    status = "different_recorded_values";
    explanation = priority === "critical"
      ? "Los valores críticos documentados difieren; revisá el impacto antes de interpretar diferencias entre señales."
      : "Los valores documentados difieren; revisá si esto cambia el método o la interpretación.";
  } else if (reference.evidence === "verified" && candidate.evidence === "verified") {
    status = "same_value_marked_verified";
    explanation = "Ambos valores están marcados como verificados por quien los cargó; la aplicación no autentica la evidencia de forma independiente.";
  } else {
    status = "same_recorded_value";
    explanation = "El valor registrado coincide, pero su procedencia no está verificada de forma independiente por la aplicación.";
  }
  return {
    key,
    label,
    kind,
    priority,
    status,
    referenceValue: reference.known ? reference.value : null,
    candidateValue: candidate.known ? candidate.value : null,
    referenceEvidence: reference.evidence,
    candidateEvidence: candidate.evidence,
    referenceSource: reference.source,
    candidateSource: candidate.source,
    referenceNote: reference.note,
    candidateNote: candidate.note,
    explanation,
  };
}

function primarySourceFile(manifest) {
  return Array.isArray(manifest?.sourceFiles) ? manifest.sourceFiles[0] ?? null : null;
}

function manifestIsPresent(manifest) {
  return Boolean(manifest && typeof manifest === "object" && !Array.isArray(manifest));
}

/**
 * Compara el contexto y la procedencia declarados para una referencia y una
 * candidata. Un resultado favorable solo significa que no se encontraron
 * diferencias entre los campos conocidos; nunca certifica equivalencia física.
 * Esta revisión no impide hacer comparaciones numéricas descriptivas.
 */
export function assessManifestComparability(referenceManifest, candidateManifest, { candidateRole = "candidate" } = {}) {
  const expectedCandidateRole = ["candidate", "replicate", "exploratory"].includes(candidateRole)
    ? candidateRole
    : "candidate";
  const reference = manifestIsPresent(referenceManifest) ? referenceManifest : null;
  const candidate = manifestIsPresent(candidateManifest) ? candidateManifest : null;
  const items = [];

  for (const definition of RUN_MANIFEST_CONTEXT_DEFINITIONS) {
    items.push(compareManifestEvidence(
      "context." + definition.key,
      definition.label,
      MANIFEST_COMPARISON_PRIORITY[definition.key] ?? "informational",
      reference?.context?.[definition.key],
      candidate?.context?.[definition.key],
      "context",
    ));
  }

  const referenceSource = primarySourceFile(reference);
  const candidateSource = primarySourceFile(candidate);
  for (const definition of MANIFEST_SOURCE_COMPARISON_FIELDS) {
    items.push(compareManifestEvidence(
      "source." + definition.key,
      definition.label,
      definition.priority,
      referenceSource?.[definition.key],
      candidateSource?.[definition.key],
      "source",
    ));
  }

  const roleChecks = [
    {
      side: "reference",
      expected: "reference",
      actual: reference?.role ?? "unknown",
      matches: reference?.role === "reference",
    },
    {
      side: "candidate",
      expected: expectedCandidateRole,
      actual: candidate?.role ?? "unknown",
      matches: candidate?.role === expectedCandidateRole,
    },
  ];
  const roleMismatch = roleChecks.some(check => !check.matches);
  const sameSourceHash = Boolean(
    referenceSource?.sha256 && candidateSource?.sha256 &&
    hashPattern.test(referenceSource.sha256) &&
    hashPattern.test(candidateSource.sha256) &&
    referenceSource.sha256.toLowerCase() === candidateSource.sha256.toLowerCase()
  );
  const hasBothSourceHashes = Boolean(
    referenceSource?.sha256 && candidateSource?.sha256 &&
    hashPattern.test(referenceSource.sha256) &&
    hashPattern.test(candidateSource.sha256)
  );
  const criticalDifferences = items.filter(item =>
    item.priority === "critical" && item.status === "different_recorded_values"
  );
  const importantDifferences = items.filter(item =>
    ["critical", "relevant"].includes(item.priority) &&
    item.status === "different_recorded_values"
  );
  const criticalUnknown = items.filter(item =>
    item.priority === "critical" && item.status === "unknown"
  );
  const importantUnknown = items.filter(item =>
    ["critical", "relevant"].includes(item.priority) && item.status === "unknown"
  );
  const lifecycleDraft = [reference, candidate].some(manifest => manifest?.lifecycle === "draft");
  const missingManifest = !reference || !candidate;
  const referenceErrors = reference ? validateRunManifest(reference, "referencia") : [];
  const candidateErrors = candidate ? validateRunManifest(candidate, "candidata") : [];
  const manifestValidationErrors = [...referenceErrors, ...candidateErrors];
  const warnings = [];

  if (missingManifest) warnings.push("Falta el manifiesto de uno de los registros; el contexto ausente no se reconstruye por suposición.");
  if (manifestValidationErrors.length) warnings.push("Hay al menos un manifiesto estructuralmente inválido; revisá su contrato antes de interpretar sus metadatos.");
  if (roleMismatch) warnings.push("Revisá el rol asignado: la base debe figurar como referencia y el otro registro como candidata.");
  if (lifecycleDraft) warnings.push("Al menos un manifiesto sigue en borrador; revisá el contexto antes de sacar conclusiones.");
  if (!hasBothSourceHashes) warnings.push("No hay SHA-256 disponible en ambos archivos de origen; no se puede comprobar si son bytes idénticos.");
  if (sameSourceHash) warnings.push("Ambos manifiestos apuntan a la misma huella SHA-256: podrían referirse al mismo archivo, no a dos ensayos independientes.");
  if (criticalDifferences.length) warnings.push("Hay diferencias documentadas en campos críticos de ECU, hardware o calibración.");
  else if (importantDifferences.length) warnings.push("Hay diferencias documentadas en el contexto de medición o en la ruta de importación.");
  if (criticalUnknown.length) warnings.push("Faltan datos críticos de ECU, hardware o calibración en al menos uno de los registros.");
  else if (importantUnknown.length) warnings.push("Faltan datos relevantes de contexto o procedencia en al menos uno de los registros.");

  let status = "no_documented_differences";
  if (sameSourceHash) status = "possible_duplicate_source";
  else if (roleMismatch) status = "setup_review_required";
  else if (importantDifferences.length) status = "differences_found";
  else if (importantUnknown.length || lifecycleDraft || missingManifest ||
      !hasBothSourceHashes || manifestValidationErrors.length) {
    status = "insufficient_context";
  }

  return {
    status,
    items,
    contextMatches: items.filter(item =>
      ["same_recorded_value", "same_value_marked_verified"].includes(item.status)
    ).length,
    contextDifferences: items.filter(item => item.status === "different_recorded_values").length,
    contextUnknown: items.filter(item => item.status === "unknown").length,
    criticalDifferences,
    importantDifferences,
    criticalUnknown,
    importantUnknown,
    roleChecks,
    sourceIdentity: {
      status: sameSourceHash ? "same_bytes" : hasBothSourceHashes ? "different_bytes" : "unknown",
      sameSourceHash,
      hasBothSourceHashes,
    },
    manifestValidationErrors,
    warnings,
    // Este control informativo nunca bloquea la comparación descriptiva de señales.
    numericalComparisonBlocked: false,
    physicalEquivalenceCertified: false,
  };
}
