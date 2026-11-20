import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import localDossierBackupSchema from "../../schemas/local-dossier-backup-1.schema.json" with { type: "json" };
import { validateJsonSchemaInstance } from "../../src/imported-comparison-report-validator.mjs";

const PROTOTYPE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
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
  const consoleErrors = [];
  const externalRequests = [];
  const httpErrors = [];
  const failedRequests = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => {
    failedRequests.push(request.url() + " · " + (request.failure()?.errorText ?? "request failed"));
  });
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", request => {
    if (!request.url().startsWith(baseUrl + "/")) externalRequests.push(request.url());
  });
  page.on("response", response => {
    if (response.url().startsWith(baseUrl + "/") && response.status() >= 400) {
      httpErrors.push(response.status() + " " + response.url());
    }
  });
  await page.goto(baseUrl + "/app/index.html", { waitUntil: "domcontentloaded" });
  try {
    await page.locator("#casePicker [data-demo-case]").first().waitFor({ state: "visible", timeout: 10000 });
  } catch (error) {
    throw new Error(
      "La aplicación no llegó a inicializar el selector de escenarios. " +
      JSON.stringify({ pageErrors, consoleErrors, httpErrors, failedRequests }) +
      " · " + error.message,
    );
  }
  return { page, pageErrors, consoleErrors, externalRequests, httpErrors };
}

test("la entrada raíz es una redirección estática sin JavaScript inline", async t => {
  const rootResponse = await fetch(baseUrl + "/");
  const rootHtml = await rootResponse.text();

  assert.equal(rootResponse.status, 200);
  assert.match(rootHtml, /Content-Security-Policy/i);
  assert.match(rootHtml, /url=\.\/app\/index\.html/i);
  assert.doesNotMatch(rootHtml, /<script\b/i);

  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded" });
  await page.waitForURL(baseUrl + "/app/index.html");
  assert.match(await page.title(), /Datalog Comparison/);
  assert.equal(await page.locator("#pageTitle").innerText(), "La evidencia antes que la comparación.");
});

test("la inspección CSV es local, requiere mapeo explícito y no altera los escenarios sintéticos", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });

  const csv = [
    "Elapsed [s];Engine speed [rpm];Torque [Nm];Power [kW]",
    "0,00;1800;142,50;26,86",
    "0,10;2100;151,25;33,27",
    "0,20;2400;158,00;39,72",
  ].join("\n");

  await page.locator("#csvFile").setInputFiles({
    name: "inspection-fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  assert.equal(await page.locator('[data-channel-key="time_s"]').inputValue(), "Elapsed [s]",
    "una etiqueta exacta de tiempo transcurrido puede preseleccionarse para revisión");
  assert.equal(await page.locator('[data-channel-key="rpm"]').inputValue(), "Engine speed [rpm]",
    "una etiqueta tipada de velocidad de motor puede preseleccionarse para revisión");
  await page.locator("#csvSourceDomain").selectOption("ecu");
  await page.locator("#csvColumnDelimiter").selectOption(";");
  await page.locator("#csvDecimalSeparator").selectOption(",");
  await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
  await page.locator('[data-channel-key="torque_nm"]').selectOption("Torque [Nm]");
  await page.locator('[data-unit-key="torque_nm"]').fill("Nm");
  await page.locator("#csvInspectButton").click();

  await page.locator("#csvPreview").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /3 muestras/);
  assert.match(await page.locator("#csvQualityTable").innerText(), /Torque/);
  assert.match(await page.locator("#csvImportStatus").innerText(), /podés asignarlo como referencia o candidata para una comparación descriptiva/i);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    "la vista previa CSV debe mantenerse dentro del viewport móvil",
  );
  assert.equal(await page.locator("#charts svg").count(), 2,
    "la importación aislada no debe sustituir ni mezclar los escenarios sintéticos");
  assert.equal(await page.locator("#casePicker button").count(), 4);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);

  await page.locator("#csvClearButton").click();
  assert.equal(await page.locator("#csvPreview").isVisible(), false);
  assert.equal(await page.locator("#csvFile").inputValue(), "");
});

test("los encabezados CSV importados se muestran como texto y no inyectan HTML", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const injectedHeader = '<img src=x onerror=window.__csvInjected=true>';
  const csv = [
    "Elapsed [s],Engine RPM," + injectedHeader,
    "0,850,10",
    "0.1,900,20",
  ].join("\n");

  await page.locator("#csvFile").setInputFiles({
    name: "untrusted-header.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });

  const mapping = page.locator("#csvMappingFields");
  assert.ok((await mapping.textContent()).includes(injectedHeader),
    "el encabezado original debe permanecer visible como texto");
  assert.equal(await mapping.locator("img, svg, script").count(), 0,
    "el contenido importado no debe crear elementos HTML");
  assert.equal(await page.evaluate(() => Boolean(window.__csvInjected)), false,
    "el contenido importado no debe ejecutar atributos de evento");
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});


test("importa CSV UTF-16LE con BOM y conserva la codificación en la procedencia", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const csv = "Elapsed [s],Engine speed [rpm]\n0,1000\n0.1,1100\n";
  const buffer = Buffer.from("\uFEFF" + csv, "utf16le");

  await page.locator("#csvFile").setInputFiles({
    name: "utf16le-synthetic.csv",
    mimeType: "text/csv",
    buffer,
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvImportStatus").innerText(), /UTF-16LE con BOM/);

  await page.locator("#csvSourceDomain").selectOption("ecu");
  await page.locator("#csvColumnDelimiter").selectOption(",");
  await page.locator("#csvDecimalSeparator").selectOption(".");
  await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });

  assert.match(await page.locator("#csvPreviewSummary").innerText(), /Codificación de origen: UTF-16LE con BOM/);
  assert.match(await page.locator("#csvImportStatus").innerText(), /podés asignarlo como referencia o candidata para una comparación descriptiva/i);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("rechaza bytes CSV que no cumplen UTF-8 estricto sin reemplazar caracteres", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });

  await page.locator("#csvFile").setInputFiles({
    name: "invalid-encoding.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([0x52, 0x50, 0x4d, 0x2c, 0xff]),
  });
  await page.waitForFunction(() => document.querySelector("#csvImportStatus")?.textContent.includes("CSV_ENCODING_UNSUPPORTED"));
  assert.match(await page.locator("#csvImportStatus").innerText(), /CSV_ENCODING_UNSUPPORTED/);
  assert.match(await page.locator("#csvImportStatus").innerText(), /no se adivinará otra codificación/i);
  assert.equal(await page.locator("#csvMappingSection").isVisible(), false);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});


test("los errores de tipeo y rangos numéricos no asignan canales automáticamente", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const csv = [
    "Elapsed [s],Vehcile Speed (kmh),Analog Input 7",
    "0,0,1000",
    "0.1,30,1800",
    "0.2,60,2500",
  ].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "unknown-columns.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  assert.equal(await page.locator('[data-channel-key="time_s"]').inputValue(), "Elapsed [s]");
  assert.equal(await page.locator('[data-channel-key="speed_kmh"]').inputValue(), "",
    "un posible error de tipeo no debe convertirse en una asignación automática");
  const recognition = await page.locator("#csvMappingFields").innerText();
  assert.match(recognition, /Posible error de tipeo/i);
  assert.match(recognition, /Rango numérico orientativo/i);
  assert.match(recognition, /no identifica la señal ni su unidad/i);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("la variante Haltech Channel/ID/Type se importa localmente y muestra sus canales exactos", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const text = [
    "%DataLog%",
    "DataLogVersion : 1.1",
    "Software : Haltech NSP",
    "Channel : Manifold Pressure Derivative",
    "ID : 1592",
    "Type : AbsPressure",
    "DisplayMaxMin : 32000,-32000",
    "Channel : RPM",
    "ID : 384",
    "Type : EngineSpeed",
    "DisplayMaxMin : 20000,0",
    "Channel : Boost Control Actual Pressure",
    "ID : 1463",
    "Type : Pressure",
    "DisplayMaxMin : 15013,13",
    "Channel : Wideband O2 Overall",
    "ID : 8018",
    "Type : AFR",
    "DisplayMaxMin : 1361,-110",
    "00:00:00.000,50,1450,1250,965",
    "00:00:00.020,30,1650,1300,980",
    "00:00:00.040,70,1800,1400,950",
  ].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "haltech-metadata-variant.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text, "utf8"),
  });
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  const summary = await page.locator("#csvPreviewSummary").innerText();
  assert.match(summary, /Haltech NSP CSV/);
  assert.match(await page.locator("#csvWarnings").innerText(), /Manifold Pressure Derivative/);
  assert.match(await page.locator("#csvWarnings").innerText(), /Wideband O2 Overall.*lambda/i);
  assert.equal(await page.locator("#csvMappingSection").isVisible(), false);
  assert.equal(await page.locator("#charts svg").count(), 2);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("la variante Haltech NSP se detecta por marcador y se inspecciona sin mapeo manual", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const haltech = [
    "%DataLog%",
    "",
    "Time(Time_ms:ms),RPM(EngineSpeed:rpm),MAP(AbsPressure:kPa),Boost(Pressure:kPa),Throttle(Percentage:%),IAT(Temperature:C)",
    "00:00:01.000,1800,1000,1800,250,2981.5",
    "00:00:01.100,2100,1020,1850,350,2982.5",
    "00:00:01.200,2400,1040,1900,450,2983.5",
  ].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "haltech-nsp-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(haltech, "utf8"),
  });
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /Haltech NSP CSV/);
  assert.match(await page.locator("#csvQualityTable").innerText(), /Velocidad de motor/);
  assert.equal(await page.locator("#csvMappingSection").isVisible(), false);
  assert.match(await page.locator("#csvImportStatus").innerText(), /variante Haltech NSP/i);
  assert.equal(await page.locator("#charts svg").count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("el perfil Dynojet exige base de medición antes de inspeccionar torque/potencia", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const dynoCsv = [
    "Time (s),Engine RPM,Wheel Torque (ft-lb),Wheel Power (hp)",
    "0.00,2200,101.8,42.7",
    "0.10,2500,106.9,50.9",
    "0.20,2800,111.7,59.6",
  ].join("\n");
  await page.locator("#csvFormatProfile").selectOption("dynojet");
  await page.locator("#csvFile").setInputFiles({
    name: "powercore-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(dynoCsv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  await page.locator('[data-channel-key="time_s"]').selectOption("Time (s)");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine RPM");
  await page.locator('[data-channel-key="torque_nm"]').selectOption("Wheel Torque (ft-lb)");
  await page.locator('[data-unit-key="torque_nm"]').fill("ft-lb");
  await page.locator('[data-channel-key="power_kw"]').selectOption("Wheel Power (hp)");
  await page.locator('[data-unit-key="power_kw"]').fill("hp");
  await page.locator("#csvInspectButton").click();
  assert.match(await page.locator("#csvImportStatus").innerText(), /base de medición/i);
  assert.equal(await page.locator("#csvPreview").isVisible(), false);

  await page.locator("#csvMeasurementBasis").selectOption("wheel");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /Rueda/);
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /Torque · ft-lb → Nm/);
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /Potencia · hp → kW/);
  assert.match(await page.locator("#csvWarnings").innerText(), /mapeó manualmente/i);
  assert.equal(await page.locator("#charts svg").count(), 2);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("portfolio demo recorre casos sintéticos, bloqueos de fuente, exportación y viewport móvil", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });

  assert.match(await page.locator("#readinessSummary").innerText(), /revisión/i);
  assert.equal(await page.locator("#charts svg").count(), 2, "el caso base debe dibujar torque y potencia");
  assert.equal(await page.locator("#casePicker button").count(), 4);
  assert.equal(await page.locator("#casePicker button[aria-pressed=true]").count(), 1);

  const initialOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(initialOverflow, false, "los gráficos deben caber en móvil cuando ambos paneles están visibles");

  const firstCase = page.locator('#casePicker [data-demo-case="complete"]');
  await firstCase.focus();
  await page.keyboard.press("Enter");
  assert.equal(await firstCase.getAttribute("aria-pressed"), "true",
    "los escenarios deben poder seleccionarse con teclado");

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  assert.match(csp, /connect-src 'self'/);

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

  await page.locator('#casePicker [data-demo-case="bases"]').click();
  assert.match(await page.locator("#readinessSummary").innerText(), /Revisión de evidencia necesaria/i);
  assert.match(await page.locator("#gateList").innerText(), /referencia: rueda; candidata: motor/i);
  assert.match(await page.locator("#chartStatus").innerText(), /ningún canal superó los controles de compatibilidad/i);
  assert.match(await page.locator("#charts").innerText(), /Torque no graficado:.*referencia: rueda; candidata: motor/i);
  assert.equal(await page.locator("#charts svg").count(), 0,
    "no mostrar torque ni potencia cuando la base física de banco difiere");

  await page.locator('#casePicker [data-demo-case="mixed"]').click();
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
  const downloadPath = await download.path();
  assert.ok(downloadPath, "el navegador debe completar la descarga del informe");
  const report = JSON.parse(await readFile(downloadPath, "utf8"));
  assert.equal(report.schema, "datalog-portfolio-comparison-demo/1");
  assert.equal(report.synthetic, true);
  assert.equal(report.readiness.status, "blocked");
  assert.equal(report.runs.length, 2);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, "el diseño móvil no debe exigir desplazamiento horizontal global");
  assert.deepEqual(pageErrors, [], "la demo no debe generar errores de JavaScript");
  assert.deepEqual(consoleErrors, [], "la demo no debe escribir errores en la consola");
  assert.deepEqual(httpErrors, [], "la demo no debe solicitar recursos inexistentes");
  assert.deepEqual(externalRequests, [], "la demo no debe enviar solicitudes externas");
});


test("la inspección ECU puede generar señales temporales derivadas sin alterar la fuente", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const rows = Array.from({ length: 501 }, (_, index) => {
    const time = (index / 100).toFixed(2);
    const rpm = 1800 + index * 2;
    const speed = 40 + 0.02 * index;
    return time + "," + rpm + "," + speed.toFixed(2);
  });
  const csv = ["Elapsed [s],Engine speed [rpm],Vehicle Speed (km/h)", ...rows].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "ecu-derived-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  await page.locator("#csvSourceDomain").selectOption("ecu");
  await page.locator("#csvColumnDelimiter").selectOption(",");
  await page.locator("#csvDecimalSeparator").selectOption(".");
  await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
  await page.locator('[data-unit-key="time_s"]').fill("s");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
  await page.locator('[data-unit-key="rpm"]').fill("RPM");
  await page.locator('[data-channel-key="speed_kmh"]').selectOption("Vehicle Speed (km/h)");
  await page.locator('[data-unit-key="speed_kmh"]').fill("km/h");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /501 muestras/);
  await page.locator("#csvDerivedTimeControls").waitFor({ state: "visible" });
  await page.locator("#csvTimeDecimationFactor").selectOption("5");
  await page.locator("#csvTimeDeriveButton").click();
  await page.waitForFunction(() => document.querySelector("#csvDerivedStatus")?.textContent.includes("Procesamiento temporal completado"));
  assert.match(await page.locator("#csvDerivedResults").innerText(), /muestras derivadas/);
  assert.match(await page.locator("#csvDerivedResults").innerText(), /Hz/);
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /501 muestras/,
    "el registro original conserva su recuento de muestras");
  assert.equal(await page.locator("#charts svg").count(), 2,
    "el procesamiento derivado no habilita ni modifica la matriz de comparación");
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("el dinamómetro muestra curvas independientes por barrido y banda RPM", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const firstSweep = Array.from({ length: 36 }, (_, index) => 2500 + index * 100);
  const drop = [5700, 5300, 4900, 4500, 4100, 3700, 3300, 3000];
  const secondSweep = Array.from({ length: 31 }, (_, index) => 3000 + index * 100);
  const rpms = [...firstSweep, ...drop, ...secondSweep];
  const rows = rpms.map((rpm, index) => {
    const torque = 180 - Math.pow((rpm - 4400) / 2400, 2) * 80 + Math.sin(index) * 2;
    const power = 30 + rpm * 0.045 - Math.pow((rpm - 5500) / 2500, 2) * 30;
    return rpm + "," + torque.toFixed(2) + "," + power.toFixed(2);
  });
  const csv = ["Engine RPM,Wheel Torque (Nm),Wheel Power (kW)", ...rows].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "dyno-derived-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  await page.locator("#csvSourceDomain").selectOption("dyno");
  await page.locator("#csvColumnDelimiter").selectOption(",");
  await page.locator("#csvDecimalSeparator").selectOption(".");
  await page.locator("#csvMeasurementBasis").selectOption("wheel");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine RPM");
  await page.locator('[data-unit-key="rpm"]').fill("RPM");
  await page.locator('[data-channel-key="torque_nm"]').selectOption("Wheel Torque (Nm)");
  await page.locator('[data-unit-key="torque_nm"]').fill("Nm");
  await page.locator('[data-channel-key="power_kw"]').selectOption("Wheel Power (kW)");
  await page.locator('[data-unit-key="power_kw"]').fill("kW");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /75 muestras/);
  await page.locator("#csvDerivedDynoControls").waitFor({ state: "visible" });
  await page.locator("#csvDynoBinWidth").selectOption("200");
  await page.locator("#csvDynoCurveButton").click();
  await page.waitForFunction(() => document.querySelector("#csvDerivedStatus")?.textContent.includes("2 barrido"));
  const derived = await page.locator("#csvDerivedResults").innerText();
  assert.match(derived, /Barrido 1/);
  assert.match(derived, /Barrido 2/);
  assert.match(derived, /Torque/);
  assert.match(derived, /Potencia/);
  assert.match(derived, /2400–2600/);
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /75 muestras/,
    "las curvas derivadas no modifican ni mezclan el registro fuente");

  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("Almacenamiento local disponible"),
  );
  await page.locator("#dossierName").fill("Dyno · artefacto de prueba");
  await page.locator("#dossierCreateButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierActiveSelect")?.selectedOptions[0]?.textContent.includes("Dyno"),
  );
  assert.equal(await page.locator("#dossierSaveDerivedButton").isEnabled(), true);
  await page.locator("#dossierSaveDerivedButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierArtifactList")?.textContent.includes("dyno_rpm_sweep_curve"),
  );
  const backupDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.locator("#dossierExportBackupButton").click();
  const backupDownload = await backupDownloadPromise;
  const backupText = await readFile(await backupDownload.path(), "utf8");
  const backup = JSON.parse(backupText);
  assert.equal(backup.derivedArtifacts.length, 1);
  assert.deepEqual(validateJsonSchemaInstance(backup, localDossierBackupSchema), []);
  assert.equal(backup.derivedArtifacts[0].kind, "dyno_rpm_sweep_curve");
  assert.equal(backup.derivedArtifacts[0].payload.curves.length, 2);
  assert.equal(backup.sourceArchives.contentIncluded, false);
  assert.equal(await page.locator("#charts svg").count(), 2);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});


test("compara dos CSV importados por distribuciones y explica señales unilaterales", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });

  const referenceCsv = [
    "Elapsed [s],Engine speed [rpm],Vehicle Speed (km/h)",
    "0,1800,40",
    "0.1,2000,45",
    "0.2,2200,50",
  ].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "reference-run.csv", mimeType: "text/csv", buffer: Buffer.from(referenceCsv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  await page.locator("#csvSourceDomain").selectOption("ecu");
  await page.locator("#csvColumnDelimiter").selectOption(",");
  await page.locator("#csvDecimalSeparator").selectOption(".");
  await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
  await page.locator('[data-channel-key="speed_kmh"]').selectOption("Vehicle Speed (km/h)");
  await page.locator('[data-unit-key="speed_kmh"]').fill("km/h");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  await page.locator("#csvSetReference").click();
  assert.match(await page.locator("#csvReferenceSlotStatus").innerText(), /reference-run\.csv/);

  const candidateCsv = [
    "Elapsed [s],Engine speed [rpm],Vehicle Speed (km/h),Throttle Position (%)",
    "0,1900,45,20",
    "0.15,2100,52,40",
    "0.30,2300,60,65",
  ].join("\n");
  await page.locator("#csvFile").setInputFiles({
    name: "candidate-run.csv", mimeType: "text/csv", buffer: Buffer.from(candidateCsv, "utf8"),
  });
  await page.locator("#csvMappingSection").waitFor({ state: "visible" });
  await page.locator("#csvSourceDomain").selectOption("ecu");
  await page.locator("#csvColumnDelimiter").selectOption(",");
  await page.locator("#csvDecimalSeparator").selectOption(".");
  await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
  await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
  await page.locator('[data-channel-key="speed_kmh"]').selectOption("Vehicle Speed (km/h)");
  await page.locator('[data-unit-key="speed_kmh"]').fill("km/h");
  await page.locator('[data-channel-key="throttle_pct"]').selectOption("Throttle Position (%)");
  await page.locator('[data-unit-key="throttle_pct"]').fill("%");
  await page.locator("#csvInspectButton").click();
  await page.locator("#csvPreview").waitFor({ state: "visible" });
  await page.locator("#csvSetCandidate").click();
  await page.locator("#csvCompareButton").click();

  await page.locator("#csvComparisonResult").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvComparisonStatus").innerText(), /requiere revisión/i);
  const channels = await page.locator("#csvComparisonChannels").innerText();
  assert.match(channels, /Velocidad del vehículo/i);
  assert.match(channels, /Mediana ref\./i);
  const exclusions = await page.locator("#csvComparisonExclusions").innerText();
  assert.match(exclusions, /Acelerador/i);
  assert.match(exclusions, /missing_in_reference/i);
  assert.match(exclusions, /no existe una base compartida/i);
  assert.match(await page.locator("#csvComparisonResultSummary").innerText(), /referencia temporal común verificada/i);
  const reportDownloadPromise = page.waitForEvent("download");
  await page.locator("#csvExportComparisonReport").click();
  const reportDownload = await reportDownloadPromise;
  const reportPath = await reportDownload.path();
  assert.ok(reportPath, "el navegador debe completar la descarga del informe importado");
  const reportText = await readFile(reportPath, "utf8");
  const importedReport = JSON.parse(reportText);
  assert.equal(importedReport.schema, "datalog-imported-run-comparison/1");
  assert.equal(importedReport.reference.name, "reference-run.csv");
  assert.equal(importedReport.candidate.name, "candidate-run.csv");
  assert.equal(importedReport.timeAlignment.performed, false);
  assert.ok(importedReport.channels.some(channel => channel.key === "speed_kmh"));
  assert.doesNotMatch(reportText, /"samples"\\s*:|originalCells|0,1800,40|0,1900,45/);
  assert.match(await page.locator("#csvComparisonExportStatus").innerText(), /Informe JSON generado localmente/i);

  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("Almacenamiento local disponible"),
  );
  await page.locator("#dossierName").fill("Falcon · comparación motor");
  await page.locator("#dossierVehicleLabel").fill("Ford Falcon · 221");
  await page.locator("#dossierNotes").fill("Caso de prueba de persistencia local");
  await page.locator("#dossierCreateButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierActiveSelect")?.selectedOptions[0]?.textContent.includes("Falcon"),
  );
  assert.equal(await page.locator("#dossierArchiveOriginals").isEnabled(), true,
    "los dos CSV deben estar disponibles para archivado consentido");
  await page.locator("#dossierArchiveOriginals").check();
  await page.locator("#dossierSaveReportButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("archivaron 2 CSV originales"),
  );
  assert.match(await page.locator("#dossierReportList").innerText(), /2 CSV original\(es\) archivado\(s\)/);

  const originalDownloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Descargar CSV referencia" }).click();
  const originalDownload = await originalDownloadPromise;
  const originalPath = await originalDownload.path();
  assert.ok(originalPath);
  assert.equal(await readFile(originalPath, "utf8"), referenceCsv,
    "el CSV archivado debe conservar los bytes de origen sin alteraciones");

  const backupDownloadPromise = page.waitForEvent("download");
  await page.locator("#dossierExportBackupButton").click();
  const backupDownload = await backupDownloadPromise;
  const backupPath = await backupDownload.path();
  assert.ok(backupPath);
  const backupText = await readFile(backupPath, "utf8");
  const backup = JSON.parse(backupText);
  assert.equal(backup.schema, "datalog-local-dossier-backup/1");
  assert.equal(backup.reports.length, 1);
  assert.equal(backup.sourceArchives.contentIncluded, false);
  assert.equal(backup.sourceArchives.archivedFileCount, 2);
  assert.doesNotMatch(backupText, /"blob"\s*:|"samples"\s*:|0,1800,40|0,1900,45/);

  await page.locator("#dossierBackupFile").setInputFiles({
    name: "falcon-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupText, "utf8"),
  });
  await page.locator("#dossierRestoreButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("Respaldo restaurado como expediente nuevo"),
  );
  assert.equal(await page.locator("#dossierCardList .dossier-card").count(), 2);
  assert.match(await page.locator("#dossierReportList").innerText(), /Solo informe y referencias SHA-256/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("Almacenamiento local disponible"),
  );
  assert.equal(await page.locator("#dossierCardList .dossier-card").count(), 2,
    "los expedientes deben sobrevivir a una recarga en el mismo perfil del navegador");

  assert.equal(await page.locator("#charts svg").count(), 2);
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowingElements: [...document.querySelectorAll("body *")]
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || "",
          className: typeof element.className === "string" ? element.className : "",
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(item => item.width > 0 && item.right > window.innerWidth + 1)
      .slice(0, 8),
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth,
    "desbordamiento horizontal: " + JSON.stringify(layout));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("bloquea dos importaciones cuyos bytes de origen tienen el mismo SHA-256", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const csv = [
    "Elapsed [s],Engine speed [rpm]",
    "0,1800",
    "0.1,2000",
    "0.2,2200",
  ].join("\n");

  const upload = async name => {
    await page.locator("#csvFile").setInputFiles({
      name, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8"),
    });
    await page.locator("#csvMappingSection").waitFor({ state: "visible" });
    await page.locator("#csvSourceDomain").selectOption("ecu");
    await page.locator("#csvColumnDelimiter").selectOption(",");
    await page.locator("#csvDecimalSeparator").selectOption(".");
    await page.locator('[data-channel-key="time_s"]').selectOption("Elapsed [s]");
    await page.locator('[data-channel-key="rpm"]').selectOption("Engine speed [rpm]");
    await page.locator("#csvInspectButton").click();
    await page.locator("#csvPreview").waitFor({ state: "visible" });
  };

  await upload("same-source-reference.csv");
  await page.locator("#csvSetReference").click();
  await upload("same-source-copy.csv");
  await page.locator("#csvSetCandidate").click();
  await page.locator("#csvCompareButton").click();

  await page.locator("#csvComparisonResult").waitFor({ state: "visible" });
  assert.match(await page.locator("#csvComparisonStatus").innerText(), /Comparación bloqueada/i);
  assert.match(await page.locator("#csvComparisonBlockedReasons").innerText(), /mismo identificador o SHA-256/i);
  assert.match(await page.locator("#csvComparisonChannels").innerText(), /No hay canales que superen los controles/i);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});

test("abre un informe JSON guardado, valida el contrato y renderiza texto no confiable sin ejecutarlo", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });
  const report = JSON.parse(await readFile(
    resolve(PROTOTYPE_ROOT, "examples/imported-run-comparison-1.example.json"), "utf8",
  ));
  report.reference.name = '<img src=x onerror="window.__reportXss=true">';
  await page.locator("#savedReportFile").setInputFiles({
    name: "comparison-report.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report), "utf8"),
  });
  assert.equal(await page.locator("#savedReportOpenButton").isEnabled(), true);
  await page.locator("#savedReportOpenButton").click();
  await page.waitForFunction(() => document.querySelector("#savedReportStatus")?.textContent.includes("Informe validado y abierto correctamente"), null, { timeout: 5000 });
  assert.match(await page.locator("#savedReportStatus").innerText(), /Informe validado y abierto correctamente/i);
  await page.locator("#savedReportResult").waitFor({ state: "visible" });
  assert.match(await page.locator("#savedReportOverview").innerText(), /Requiere revisión/i);
  assert.match(await page.locator("#savedReportRuns").innerText(), /window.__reportXss=true/);
  assert.equal(await page.locator("#savedReportResult img").count(), 0,
    "los metadatos de texto no deben insertarse como HTML ejecutable");
  assert.match(await page.locator("#savedReportChannels").innerText(), /rpm/i);
  assert.match(await page.locator("#savedReportChannels").innerText(), /2.000/);
  assert.match(await page.locator("#savedReportExclusions").innerText(), /missing_in_reference/);
  assert.match(await page.locator("#savedReportGates").innerText(), /Origen de datos/i);
  assert.match(await page.locator("#savedReportMessages").innerText(), /No se alinearon relojes/i);
  assert.match(await page.locator("#csvReferenceSlotStatus").innerText(), /Sin registro asignado/i,
    "abrir un informe no debe rellenar ni alterar el expediente CSV");
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth, "desbordamiento móvil: " + JSON.stringify(layout));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);

  await page.locator("#savedReportCloseButton").click();
  assert.equal(await page.locator("#savedReportResult").isVisible(), false);
  assert.match(await page.locator("#savedReportStatus").innerText(), /No hay ningún informe abierto/i);
});

test("rechaza JSON inválido e informes manipulados sin mostrar resultados anteriores", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 1280, height: 900 });

  await page.locator("#savedReportFile").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{", "utf8"),
  });
  await page.locator("#savedReportOpenButton").click();
  await page.waitForFunction(() => document.querySelector("#savedReportStatus")?.textContent.includes("no contiene JSON válido"), null, { timeout: 5000 });
  assert.match(await page.locator("#savedReportStatus").innerText(), /no contiene JSON válido/i);
  assert.equal(await page.locator("#savedReportResult").isVisible(), false);

  const report = JSON.parse(await readFile(
    resolve(PROTOTYPE_ROOT, "examples/imported-run-comparison-1.example.json"), "utf8",
  ));
  report.channels[0].difference.median = 999;
  await page.locator("#savedReportFile").setInputFiles({
    name: "tampered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report), "utf8"),
  });
  await page.locator("#savedReportOpenButton").click();
  await page.waitForFunction(() => document.querySelector("#savedReportStatus")?.textContent.includes("no coincide con candidata menos referencia"), null, { timeout: 5000 });
  assert.match(await page.locator("#savedReportStatus").innerText(), /no coincide con candidata menos referencia/i);
  assert.equal(await page.locator("#savedReportResult").isVisible(), false);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});


test("los expedientes locales permiten crear un expediente y ejecutar una auditoría de integridad", async t => {
  const { page, pageErrors, consoleErrors, httpErrors, externalRequests } = await openDemo(t);
  await page.locator("#dossierName").fill("Expediente de prueba de integridad");
  await page.locator("#dossierVehicleLabel").fill("Vehículo sintético QA");
  await page.locator("#dossierCreateButton").click();
  await page.locator("#dossierActiveSelect").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const select = document.querySelector("#dossierActiveSelect");
    return select && select.options.length === 1 &&
      select.options[0].textContent.includes("Expediente de prueba de integridad");
  });
  await page.locator("#dossierAuditButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#dossierStatus")?.textContent.includes("Integridad correcta")
  );
  assert.match(await page.locator("#dossierStatus").innerText(), /0 informe\(s\), 0 CSV y 0 artefacto\(s\)/);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});


test("la evaluación de protocolos se integra en la interfaz y mantiene la evidencia sintética", async t => {
  const { page, pageErrors, consoleErrors, externalRequests, httpErrors } =
    await openDemo(t, { width: 390, height: 844 });

  await page.locator(".protocol-advanced summary").click();
  await page.locator("#protocolLoadExampleButton").click();
  await page.waitForFunction(() =>
    document.querySelector("#protocolJsonInput")?.value.includes("synthetic_test_fixture"));
  await page.locator("#protocolAssessmentForm button[type=submit]").click();
  await page.locator("#protocolResult").waitFor({ state: "visible" });

  const result = await page.locator("#protocolResult").innerText();
  assert.match(result, /Requiere revisión/);
  assert.match(result, /within_user_limit/);
  assert.match(result, /condition_not_evidenced|invalid_conditions_contract/);
  assert.match(await page.locator("#protocolInputStatus").innerText(), /no certifica una norma/i);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);

  await page.locator("#protocolClearButton").click();
  assert.equal(await page.locator("#protocolResult").isVisible(), false);
  assert.equal(await page.locator("#protocolJsonInput").inputValue(), "");
});


test("el constructor guiado crea repeticiones ECU estacionarias sin elevar datos reportados a mediciones", async t => {
  const { page, pageErrors, consoleErrors, httpErrors, externalRequests } =
    await openDemo(t, { width: 390, height: 844 });
  await page.locator("#dossierName").fill("Protocolo ECU · integración local");
  await page.locator("#dossierVehicleLabel").fill("Vehículo sintético QA");
  await page.locator("#dossierCreateButton").click();
  await page.waitForFunction(() => document.querySelector("#dossierActiveSelect")?.options.length === 1);

  await page.locator("#protocolDomain").selectOption("ecu");
  await page.locator("#protocolMode").selectOption("steady_state");
  await page.locator("#protocolRpm").fill("3000");
  await page.locator("#protocolLoad").fill("100");
  await page.locator("#protocolMetricsInput").fill('{"power_kw":[100,101,99]}');
  for (const [key,value] of [["calibration_id","cal-2026"],["fuel","RON 98"],["intake_temp_c","35"],["coolant_temp_c","85"]]) {
    await page.locator('[data-condition-key="'+key+'"]').fill(value);
    await page.locator('[data-condition-status="'+key+'"]').selectOption("measured");
    await page.locator('[data-condition-source="'+key+'"]').fill("Sensor / registro de prueba");
  }
  await page.locator("#protocolBuildButton").click();
  await page.locator("#protocolResult").waitFor({state:"visible"});
  const json=JSON.parse(await page.locator("#protocolJsonInput").inputValue());
  assert.equal(json.runs.length,3);
  assert.equal(json.runs[0].operatingConditions.fields.coolant_temp_c.status,"measured");
  assert.equal(json.runs[0].operatingConditions.fields.coolant_temp_c.source,"Sensor / registro de prueba");
  assert.equal(json.runs[0].metrics.power_kw,100);
  assert.equal(json.runs[2].metrics.power_kw,99);
  assert.match(await page.locator("#protocolBuilderStatus").innerText(),/no certifica una norma/i);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(consoleErrors,[]);
  assert.deepEqual(httpErrors,[]);
  assert.equal(await page.locator("#dossierSaveDerivedButton").isEnabled(), true);
  assert.match(await page.locator("#dossierPendingDerivedStatus").innerText(), /test_protocol_assessment/i);
  await page.locator("#dossierSaveDerivedButton").click();
  await page.waitForFunction(() => document.querySelector("#dossierArtifactList")?.textContent.includes("test_protocol_assessment"));
  assert.match(await page.locator("#dossierStatus").innerText(), /Artefacto derivado guardado/i);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(consoleErrors,[]);
  assert.deepEqual(httpErrors,[]);
  assert.equal(await page.locator("#dossierSaveDerivedButton").isEnabled(), true);
  assert.match(await page.locator("#dossierPendingDerivedStatus").innerText(), /test_protocol_assessment/i);
  await page.locator("#dossierSaveDerivedButton").click();
  await page.waitForFunction(() => document.querySelector("#dossierArtifactList")?.textContent.includes("test_protocol_assessment"));
  assert.match(await page.locator("#dossierStatus").innerText(), /Artefacto derivado guardado/i);
  assert.deepEqual(externalRequests,[]);
});
