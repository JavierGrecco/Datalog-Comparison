import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const PROTOTYPE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
});

let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const target = resolve(PROTOTYPE_ROOT, relative || "index.html");
      if (target !== PROTOTYPE_ROOT && !target.startsWith(PROTOTYPE_ROOT + sep)) {
        response.writeHead(403).end("Ruta fuera del prototipo");
        return;
      }
      const canonical = await realpath(target);
      if (canonical !== PROTOTYPE_ROOT && !canonical.startsWith(PROTOTYPE_ROOT + sep)) {
        response.writeHead(403).end("Ruta fuera del prototipo");
        return;
      }
      const bytes = await readFile(canonical);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(canonical)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("No se pudo servir el archivo local.");
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No se obtuvo el puerto local.");
  baseUrl = "http://127.0.0.1:" + address.port;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server?.listening) {
    await new Promise((resolveClose, reject) =>
      server.close(error => error ? reject(error) : resolveClose()));
  }
});

async function openDemo(t, viewport) {
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  t.after(() => context.close());
  const page = await context.newPage();
  const pageErrors = [];
  const externalRequests = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    if (!request.url().startsWith(baseUrl + "/")) externalRequests.push(request.url());
  });
  await page.goto(baseUrl + "/app/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#casePicker [data-demo-case]").first().waitFor({ state: "visible" });
  return { page, pageErrors, externalRequests };
}

test("portfolio demo recorre casos sintéticos, bloqueos de fuente, exportación y viewport móvil", async t => {
  const { page, pageErrors, externalRequests } = await openDemo(t, { width: 390, height: 844 });

  assert.match(await page.locator("#readinessSummary").innerText(), /revisión/i);
  assert.equal(await page.locator("#charts svg").count(), 2, "el caso base debe dibujar torque y potencia");
  const initialOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(initialOverflow, false, "los gráficos deben caber en móvil cuando ambos paneles están visibles");
  assert.equal(await page.locator("#casePicker button[aria-pressed=true]").count(), 1);

  const screenshotDirectory = process.env.PORTFOLIO_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDirectory, "demo-base-movil.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: resolve(screenshotDirectory, "demo-base-escritorio.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.locator('#casePicker [data-demo-case="missing"]').click();
  assert.match(await page.locator("#gateList").innerText(), /retroceso|faltan|ausentes/i);
  assert.equal(await page.locator("#charts svg").count(), 2,
    "los canales que sí tienen datos pueden mostrarse aunque otra señal falte");

  await page.locator('#casePicker [data-demo-case="mixed"]').click();
  assert.match(await page.locator("#readinessSummary").innerText(), /Comparación bloqueada/i);
  assert.match(await page.locator("#chartStatus").innerText(), /Gráficos comparativos ocultos/i);
  assert.equal(await page.locator("#charts svg").count(), 0,
    "no dibujar una superposición que la política de origen bloquea");

  if (screenshotDirectory) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: resolve(screenshotDirectory, "caso-bloqueo-ecu-banco.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportReport").click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "datalog-comparison-demo-mixed.json");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, "el diseño móvil no debe exigir desplazamiento horizontal global");
  assert.deepEqual(pageErrors, [], "la demo no debe generar errores de JavaScript");
  assert.deepEqual(externalRequests, [], "la demo no debe enviar solicitudes externas");
});
