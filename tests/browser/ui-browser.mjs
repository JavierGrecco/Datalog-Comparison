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
  page.on("pageerror", error => pageErrors.push(error.message));
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
  await page.locator("#casePicker [data-demo-case]").first().waitFor({ state: "visible" });
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

test("la inspección CSV es local, requiere mapeo explícito y no habilita la comparación", async t => {
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
  assert.match(await page.locator("#csvImportStatus").innerText(), /no se agregó a la matriz de comparación/i);
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
  assert.match(csp, /connect-src 'none'/);

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
  const csv = ["Elapsed [s],Engine speed [rpm],Vehicle Speed (km/h)", ...rows].join("\\n");
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
  const csv = ["Engine RPM,Wheel Torque (Nm),Wheel Power (kW)", ...rows].join("\\n");
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
  assert.match(derived, /2000–2200|2000-2200|2600–2800|2600-2800/);
  assert.match(await page.locator("#csvPreviewSummary").innerText(), /75 muestras/,
    "las curvas derivadas no modifican ni mezclan el registro fuente");
  assert.equal(await page.locator("#charts svg").count(), 2);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(externalRequests, []);
});
