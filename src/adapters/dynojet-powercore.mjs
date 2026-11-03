/**
 * Perfil guiado Dynojet PowerCore / WinPEP para exportaciones CSV configurables.
 * No presupone un esquema de columnas fijo ni lee archivos nativos del software.
 */
import { CsvImportError, mapCsvToRun } from "../csv-import.mjs";

export const DYNOJET_POWERCORE_ADAPTER_ID = "dynojet-powercore-guided-csv/1";

function fail(code, message, details = {}) {
  throw new CsvImportError(code, message, details);
}

export function importDynojetPowerCoreCsv(parsed, {
  id, name, channelMapping, units, decimalSeparator = ".",
  measurementBasis = null, importedAt = new Date().toISOString(),
} = {}) {
  if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
    fail("DYNOJET_PARSED_CSV_REQUIRED", "Se necesita un CSV genérico parseado antes de aplicar el perfil Dynojet.");
  }
  if (!measurementBasis || !["wheel", "roller", "hub", "engine", "unknown"].includes(measurementBasis)) {
    fail("DYNOJET_MEASUREMENT_BASIS_REQUIRED",
      "Declarar la base de medición como rueda, rodillo, cubo, motor o desconocida es obligatorio.");
  }

  const run = mapCsvToRun(parsed, {
    id: id ?? "dynojet-csv-import",
    name,
    sourceDomain: "dyno",
    channelMapping,
    units,
    decimalSeparator,
    importedAt,
    parserId: DYNOJET_POWERCORE_ADAPTER_ID,
    importFormat: "dynojet-powercore-guided-csv/1",
    measurementBasis,
    adapterMetadata: {
      vendor: "Dynojet",
      softwareFamily: "PowerCore / WinPEP",
      importMode: "guided-column-mapping",
      schemaDetection: "not-available",
      measurementBasis,
    },
  });
  run.warnings.push(
    "Perfil Dynojet PowerCore/WinPEP guiado: el CSV se mapeó manualmente porque los canales y la exportación son configurables; no se presupone un esquema fijo del fabricante.",
    "La base de medición fue declarada por quien importa y no se autentica desde el archivo.",
  );
  run.note = "CSV de dinamómetro inspeccionado mediante mapeo guiado. Confirmá método, corrección y base de medición en el software original.";
  return run;
}
