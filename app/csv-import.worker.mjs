import { parseCsvText } from "../src/csv-import.mjs";
import { parseTunerStudioMsl } from "../src/adapters/tunerstudio-msl.mjs";

self.addEventListener("message", event => {
  const message = event.data ?? {};
  if (message.type !== "parse") return;

  const { requestId, profile, text, delimiter = "auto" } = message;
  try {
    if (typeof text !== "string") {
      throw new TypeError("El contenido CSV debe recibirse como texto.");
    }

    const result = profile === "tunerstudio"
      ? parseTunerStudioMsl(text)
      : profile === "generic"
        ? parseCsvText(text, { delimiter })
        : (() => { throw new Error("El perfil de lectura solicitado no está soportado."); })();

    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: {
        name: error?.name ?? "Error",
        code: error?.code ?? "CSV_WORKER_FAILED",
        message: error?.message ?? "No se pudo analizar el archivo CSV.",
        details: error?.details ?? {},
      },
    });
  }
});
