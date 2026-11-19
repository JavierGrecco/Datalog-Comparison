import assert from "node:assert/strict";
import test from "node:test";

import {
  CsvTextDecodingError,
  decodeCsvBytes,
} from "../../src/text-decoder.mjs";

function encodeUtf16(text, littleEndian) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes[2 + index * 2] = littleEndian ? unit & 0xff : unit >>> 8;
    bytes[3 + index * 2] = littleEndian ? unit >>> 8 : unit & 0xff;
  }
  return bytes;
}

test("decodifica UTF-8 sin BOM y conserva caracteres acentuados", () => {
  const source = "Tiempo,Régimen\n0,1800\n";
  const result = decodeCsvBytes(new TextEncoder().encode(source));

  assert.equal(result.text, source);
  assert.equal(result.encoding, "utf-8");
});

test("decodifica UTF-8 con BOM y no lo deja como parte del primer encabezado", () => {
  const source = "\uFEFFTiempo,Régimen\n0,1800\n";
  const result = decodeCsvBytes(new TextEncoder().encode(source));

  assert.equal(result.text, "Tiempo,Régimen\n0,1800\n");
  assert.equal(result.encoding, "utf-8-bom");
});

test("decodifica UTF-16 little-endian solo cuando identifica el BOM", () => {
  const source = "Tiempo,Régimen\r\n0,1800\r\n";
  const result = decodeCsvBytes(encodeUtf16(source, true));

  assert.equal(result.text, source);
  assert.equal(result.encoding, "utf-16le-bom");
});

test("decodifica UTF-16 big-endian solo cuando identifica el BOM", () => {
  const source = "Tiempo,Régimen\n0,1800\n";
  const result = decodeCsvBytes(encodeUtf16(source, false));

  assert.equal(result.text, source);
  assert.equal(result.encoding, "utf-16be-bom");
});

test("rechaza UTF-8 inválido en lugar de insertar caracteres de reemplazo", () => {
  assert.throws(() => decodeCsvBytes(Uint8Array.from([0x52, 0x50, 0x4d, 0x2c, 0xff])),
    error => error instanceof CsvTextDecodingError &&
      error.code === "CSV_ENCODING_UNSUPPORTED");
});

test("rechaza secuencias incompletas cuando el BOM declara la codificación", () => {
  assert.throws(() => decodeCsvBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0xc3])),
    error => error instanceof CsvTextDecodingError &&
      error.code === "CSV_ENCODING_INVALID" &&
      error.details.encoding === "utf-8-bom");
  assert.throws(() => decodeCsvBytes(Uint8Array.from([0xff, 0xfe, 0x54])),
    error => error instanceof CsvTextDecodingError &&
      error.code === "CSV_ENCODING_INVALID" &&
      error.details.encoding === "utf-16le-bom");
});

test("acepta una vista de bytes sin leer el contenido que queda fuera de ella", () => {
  const source = new TextEncoder().encode("Tiempo,RPM");
  const padded = new Uint8Array(source.length + 4);
  padded.set(source, 2);
  const result = decodeCsvBytes(padded.subarray(2, source.length + 2));

  assert.equal(result.text, "Tiempo,RPM");
  assert.equal(result.encoding, "utf-8");
});

test("rechaza entradas que no son bytes", () => {
  assert.throws(() => decodeCsvBytes("Tiempo,RPM"),
    error => error.code === "CSV_ENCODING_INPUT_INVALID");
});
