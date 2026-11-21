import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsvText } from "../../src/csv-import.mjs";

const SEED = 0xdada2026;
const HEADERS = ["record_id", "channel", "raw_value", "notes"];
const ALPHABET = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  " ", ",", ";", '"', "\n", "\t", "á", "ñ", "ü", "Ω", "λ", "✓", "🚗", "<", ">",
];

function createRandom(seed) {
  let state = seed >>> 0;
  return {
    integer(maximum) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % maximum;
    },
    text(maxLength = 64) {
      const length = this.integer(maxLength + 1);
      let value = "";
      for (let index = 0; index < length; index += 1) {
        value += ALPHABET[this.integer(ALPHABET.length)];
      }
      return value;
    },
  };
}

function encodeCsvCell(value) {
  return /[",\n]/.test(value)
    ? '"' + value.replaceAll('"', '""') + '"'
    : value;
}

function serializeCsv(records) {
  return records
    .map(record => record.map(encodeCsvCell).join(","))
    .join("\r\n") + "\r\n";
}

test("el parser conserva celdas generadas con comillas, separadores, saltos de línea y Unicode", () => {
  const random = createRandom(SEED);

  for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
    const rowCount = 1 + random.integer(24);
    const expectedRows = Array.from({ length: rowCount }, (_, rowIndex) => [
      `case-${caseIndex}-row-${rowIndex}`,
      random.text(),
      random.text(),
      rowIndex % 4 === 0 ? "" : random.text(),
    ]);
    const source = serializeCsv([HEADERS, ...expectedRows]);

    const parsed = parseCsvText(source);

    assert.deepEqual(parsed.headers, HEADERS, `encabezados del caso ${caseIndex}`);
    assert.deepEqual(parsed.rows, expectedRows, `celdas del caso ${caseIndex}`);
    assert.equal(parsed.delimiter, ",", `delimitador del caso ${caseIndex}`);
    assert.equal(parsed.sourceRowCount, rowCount + 1, `recuento de filas del caso ${caseIndex}`);
    assert.equal(parsed.skippedEmptyRows, 0, `filas vacías del caso ${caseIndex}`);
    assert.deepEqual(parsed.warnings, [], `advertencias del caso ${caseIndex}`);

    assert.equal(parsed.sourceLineNumbers.length, rowCount);
    assert.ok(parsed.sourceLineNumbers.every((line, index, lines) =>
      Number.isInteger(line) && line >= 2 && (index === 0 || line > lines[index - 1])),
    `líneas físicas crecientes del caso ${caseIndex}`);
  }
});
