#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { assessTestProtocol } from "../src/test-protocol.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("Uso: npm run assess:protocol -- [archivo.json|-]");
  const input = args[0] && args[0] !== "-" ? await readFile(args[0]) : await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    process.stdin.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) reject(new Error("La entrada supera el límite de 2 MiB."));
      else chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
    process.stdin.on("error", reject);
  });
  if (input.length > MAX_BYTES) throw new Error("La entrada supera el límite de 2 MiB.");
  const payload = JSON.parse(input.toString("utf8"));
  const result = assessTestProtocol(payload.runs, payload.options ?? {});
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.status === "supported" ? 0 : 1;
}
main().catch(error => {
  process.stderr.write((error?.message ?? "Error al evaluar el protocolo.") + "\n");
  process.exitCode = 2;
});
