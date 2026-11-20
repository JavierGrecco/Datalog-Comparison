import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import localDossierBackupSchema from "../../schemas/local-dossier-backup-1.schema.json" with { type: "json" };
import importedReportSchema from "../../schemas/imported-run-comparison-1.schema.json" with { type: "json" };
import {
  validateImportedComparisonReport,
  validateJsonSchemaInstance,
} from "../../src/imported-comparison-report-validator.mjs";

const backup = JSON.parse(await readFile(
  new URL("../../examples/local-dossier-backup-1.example.json", import.meta.url), "utf8",
));

test("el ejemplo público de respaldo cumple su contrato y contiene un informe válido", () => {
  assert.equal(localDossierBackupSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(localDossierBackupSchema.$id, "urn:datalog-comparison:local-dossier-backup:1");
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
