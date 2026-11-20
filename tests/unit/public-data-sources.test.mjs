import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../../data/sources.json", import.meta.url), "utf8"),
);

test("el catálogo de datos tiene identificadores únicos y una política explícita de reutilización", () => {
  assert.equal(catalog.schema, "datalog-public-data-sources/1");
  assert.equal(catalog.policy.publicAvailabilityIsNotAReuseLicense, true);
  assert.equal(catalog.policy.rawExternalFilesAreNotCommittedByDefault, true);

  const ids = catalog.sources.map(source => source.id);
  assert.ok(ids.every(id => typeof id === "string" && id.length > 0));
  assert.equal(new Set(ids).size, ids.length, "cada fuente debe tener un ID único");
});

test("los logs MoTeC de HPA quedan limitados a práctica local hasta verificar licencia y archivo", () => {
  const source = catalog.sources.find(item => item.id === "hpa-motec-example-logged-data");

  assert.ok(source, "la fuente de práctica MoTeC debe estar registrada");
  assert.match(source.url, /^https:\/\//);
  assert.match(source.downloadUrl, /^https:\/\//);
  assert.equal(source.localPracticePermission, "invited-by-source-post");
  assert.equal(source.license, null, "no se debe inventar una licencia para el archivo");
  assert.equal(source.redistribution, "not-cleared");
  assert.equal(source.fileSchemaStatus, "not-yet-downloaded");
  assert.match(source.deviceIdentity, /exact ECU\/model.*not been independently verified/i);
  assert.match(source.repositoryPolicy, /Do not commit/i);
});
