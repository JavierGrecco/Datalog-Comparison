import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import localDossierBackupSchema from "../../schemas/local-dossier-backup-1.schema.json" with { type: "json" };
import { LOCAL_DOSSIER_BACKUP_SCHEMA_DOCUMENT } from "../../src/report-schemas.mjs";
import importedReportSchema from "../../schemas/imported-run-comparison-1.schema.json" with { type: "json" };
import {
  validateImportedComparisonReport,
  validateJsonSchemaInstance,
} from "../../src/imported-comparison-report-validator.mjs";
import { validateDossierBackupIntegrity } from "../../src/local-dossier-store.mjs";

const backup = JSON.parse(await readFile(
  new URL("../../examples/local-dossier-backup-1.example.json", import.meta.url), "utf8",
));

test("el ejemplo público de respaldo cumple su contrato y contiene un informe válido", () => {
  assert.equal(localDossierBackupSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(localDossierBackupSchema.$id, "urn:datalog-comparison:local-dossier-backup:1");
  assert.deepEqual(LOCAL_DOSSIER_BACKUP_SCHEMA_DOCUMENT, localDossierBackupSchema,
    "el módulo de ejecución debe reflejar exactamente el contrato JSON publicado");
  assert.deepEqual(validateJsonSchemaInstance(backup, localDossierBackupSchema), []);
  assert.deepEqual(validateImportedComparisonReport(backup.reports[0].report, importedReportSchema), []);
  assert.equal(backup.sourceArchives.contentIncluded, false);
  assert.equal(backup.sourceArchives.archivedFileCount, 0);
});

test("el contrato de respaldo rechaza archivos originales incrustados y campos inesperados", () => {
  const withSourceBytes = structuredClone(backup);
  withSourceBytes.sourceArchives.contentIncluded = true;
  assert.ok(validateJsonSchemaInstance(withSourceBytes, localDossierBackupSchema).length > 0);

  const withExtraField = structuredClone(backup);
  withExtraField.reports[0].rawCsv = "must never be included";
  assert.ok(validateJsonSchemaInstance(withExtraField, localDossierBackupSchema).length > 0);
});

test("el manifiesto de originales admite varias comparaciones dentro de un mismo expediente", () => {
  const multiReportBackup = structuredClone(backup);
  for (let index = 1; index <= 2; index += 1) {
    const reportId = "example-report-" + (index + 1);
    multiReportBackup.reports.push({
      ...structuredClone(backup.reports[0]),
      id: reportId,
      fileName: "comparison-" + (index + 1) + ".json",
    });
    for (const role of ["reference", "candidate"]) {
      multiReportBackup.sourceArchives.references.push({
        role,
        reportId,
        name: reportId + "-" + role + ".csv",
        size: 128,
        mimeType: "text/csv",
        sha256: (role === "reference" ? "c" : "d").repeat(64),
        storedAt: "2026-11-20T17:40:00.000Z",
        contentIncluded: false,
      });
    }
  }
  multiReportBackup.sourceArchives.archivedFileCount = 4;
  assert.deepEqual(validateJsonSchemaInstance(multiReportBackup, localDossierBackupSchema), []);
});

test("la integridad del respaldo vincula informes, huellas, CSV archivados y artefactos", () => {
  assert.equal(validateDossierBackupIntegrity(backup), true);

  const orphanArchive = structuredClone(backup);
  orphanArchive.sourceArchives.references.push({
    role: "reference",
    reportId: "missing-report",
    name: "orphan.csv",
    size: 10,
    mimeType: "text/csv",
    sha256: "a".repeat(64),
    storedAt: "2026-11-20T17:40:00.000Z",
    contentIncluded: false,
  });
  orphanArchive.sourceArchives.archivedFileCount += 1;
  assert.throws(() => validateDossierBackupIntegrity(orphanArchive), /huérfanos/);

  const alteredHash = structuredClone(backup);
  alteredHash.sourceArchives.references.push({
    role: "reference",
    reportId: alteredHash.reports[0].id,
    name: "reference.csv",
    size: 10,
    mimeType: "text/csv",
    sha256: "b".repeat(64),
    storedAt: "2026-11-20T17:40:00.000Z",
    contentIncluded: false,
  });
  alteredHash.sourceArchives.archivedFileCount = 1;
  assert.throws(() => validateDossierBackupIntegrity(alteredHash), /huella/);

  const duplicateReport = structuredClone(backup);
  duplicateReport.reports.push(structuredClone(duplicateReport.reports[0]));
  assert.throws(() => validateDossierBackupIntegrity(duplicateReport), /duplicados/);

  const orphanArtifact = structuredClone(backup);
  orphanArtifact.derivedArtifacts.push({
    ...structuredClone(orphanArtifact.derivedArtifacts[0]),
    id: "orphan-artifact",
    reportId: "missing-report",
  });
  assert.throws(() => validateDossierBackupIntegrity(orphanArtifact), /inexistente/);
});
