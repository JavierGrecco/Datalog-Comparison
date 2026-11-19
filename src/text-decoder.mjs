/**
 * Decodifica bytes CSV sin reemplazar silenciosamente secuencias inválidas.
 *
 * Se aceptan UTF-8 (con o sin BOM) y UTF-16 LE/BE solo cuando trae BOM.
 * No se adivinan codificaciones regionales porque podrían alterar los datos.
 */
export const CSV_TEXT_ENCODINGS = Object.freeze([
  "utf-8",
  "utf-8-bom",
  "utf-16le-bom",
  "utf-16be-bom",
]);

export class CsvTextDecodingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CsvTextDecodingError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function asByteView(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new CsvTextDecodingError(
    "CSV_ENCODING_INPUT_INVALID",
    "El contenido del archivo debe recibirse como bytes.",
  );
}

/**
 * Devuelve el texto y el formato de codificación detectado.
 * Si la secuencia no es válida, falla antes de que el parser vea el contenido.
 */
export function decodeCsvBytes(input) {
  const bytes = asByteView(input);
  let encoding = "utf-8";
  let decoderLabel = "utf-8";
  let payloadStart = 0;

  if (bytes.length >= 3 &&
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = "utf-8-bom";
    payloadStart = 3;
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le-bom";
    decoderLabel = "utf-16le";
    payloadStart = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be-bom";
    decoderLabel = "utf-16be";
    payloadStart = 2;
  }

  try {
    const text = new TextDecoder(decoderLabel, { fatal: true })
      .decode(bytes.subarray(payloadStart));
    return { text, encoding };
  } catch {
    const hasBom = payloadStart > 0;
    throw new CsvTextDecodingError(
      hasBom ? "CSV_ENCODING_INVALID" : "CSV_ENCODING_UNSUPPORTED",
      hasBom
        ? "El archivo declara una codificación conocida, pero contiene una secuencia de bytes incompleta o inválida."
        : "No se pudo leer el archivo como UTF-8. Exportá el CSV como UTF-8 o UTF-16 con BOM; no se adivinará otra codificación.",
      { encoding },
    );
  }
}
