/**
 * Gráficas interactivas locales para señales derivadas.
 *
 * uPlot se sirve desde vendor/, sin CDN ni solicitudes externas.
 * Este módulo valida el eje antes de dibujar: no ordena ni interpola muestras.
 */
const activeObservers = new Set();
const activeCharts = new Set();

export function buildRpmBandChartData(bins, binWidth, { maxPoints = 5000 } = {}) {
  const invalid = reason => ({ valid: false, reason });
  if (!Array.isArray(bins) || bins.length < 2) {
    return invalid("Se necesitan al menos dos bandas observadas para construir la curva.");
  }
  if (!Number.isFinite(binWidth) || binWidth <= 0) {
    return invalid("El ancho de banda RPM debe ser un número positivo.");
  }
  if (!Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > 20000) {
    return invalid("El límite de puntos de visualización debe estar entre 2 y 20000.");
  }

  const firstLower = bins[0]?.rpmLower;
  if (!Number.isFinite(firstLower)) {
    return invalid("La primera banda no tiene un límite inferior válido.");
  }
  const byIndex = new Map();
  let previousIndex = -1;

  for (const bin of bins) {
    if (!bin || !Number.isFinite(bin.rpmLower) || !Number.isFinite(bin.rpmUpper) ||
        Math.abs((bin.rpmUpper - bin.rpmLower) - binWidth) > Math.max(1, binWidth) * 1e-8 ||
        !Number.isFinite(bin.valueMin) || !Number.isFinite(bin.valueMedian) ||
        !Number.isFinite(bin.valueMax) || !Number.isInteger(bin.sampleCount) || bin.sampleCount < 1 ||
        bin.valueMin > bin.valueMedian || bin.valueMedian > bin.valueMax) {
      return invalid("Una banda contiene límites, valores o recuentos inválidos.");
    }
    const offset = (bin.rpmLower - firstLower) / binWidth;
    const index = Math.round(offset);
    if (Math.abs(offset - index) > 1e-8 || index <= previousIndex) {
      return invalid("Las bandas deben llegar ordenadas, sin duplicados y alineadas con el ancho declarado.");
    }
    byIndex.set(index, bin);
    previousIndex = index;
  }

  const pointCount = previousIndex + 1;
  if (pointCount > maxPoints) {
    return invalid("La vista tendría demasiadas bandas (" + pointCount + "); aumentá el ancho de banda RPM.");
  }

  const xValues = [];
  const minimumValues = [];
  const medianValues = [];
  const maximumValues = [];
  let missingBandCount = 0;
  for (let index = 0; index < pointCount; index += 1) {
    const lower = firstLower + index * binWidth;
    const bin = byIndex.get(index);
    xValues.push(lower + binWidth / 2);
    minimumValues.push(bin ? bin.valueMin : null);
    medianValues.push(bin ? bin.valueMedian : null);
    maximumValues.push(bin ? bin.valueMax : null);
    if (!bin) missingBandCount += 1;
  }

  return {
    valid: true,
    xValues,
    minimumValues,
    medianValues,
    maximumValues,
    missingBandCount,
    xAxisLabel: "Centro de banda (RPM)",
  };
}

export function validateTelemetryChartData({ xValues, series, bands = [] } = {}) {
  if (!Array.isArray(xValues) || xValues.length < 2) {
    return { valid: false, reason: "Se necesitan al menos dos valores de eje X." };
  }
  if (xValues.some(value => !Number.isFinite(value))) {
    return { valid: false, reason: "El eje X contiene valores no numéricos." };
  }
  for (let index = 1; index < xValues.length; index += 1) {
    if (xValues[index] <= xValues[index - 1]) {
      return { valid: false, reason: "El eje X debe ser estrictamente creciente y no contener duplicados." };
    }
  }
  if (!Array.isArray(series) || !series.length) {
    return { valid: false, reason: "No hay series para representar." };
  }
  for (const item of series) {
    if (!item || typeof item.label !== "string" || !item.label.trim() ||
        !Array.isArray(item.values) || item.values.length !== xValues.length ||
        item.values.some(value => value !== null && !Number.isFinite(value))) {
      return { valid: false, reason: "Cada serie debe tener nombre y valores numéricos o nulos alineados con el eje X." };
    }
  }
  if (!Array.isArray(bands) || bands.some(band =>
    !Array.isArray(band?.series) || band.series.length !== 2 ||
    !band.series.every(index => Number.isInteger(index) && index > 0 && index <= series.length) ||
    band.series[0] >= band.series[1])) {
    return { valid: false, reason: "Las bandas de rango deben referenciar dos series válidas en orden inferior-superior." };
  }
  return { valid: true, reason: null };
}

export function disposeTelemetryCharts() {
  for (const observer of activeObservers) observer.disconnect();
  activeObservers.clear();
  for (const chart of activeCharts) chart.destroy();
  activeCharts.clear();
}

export function renderTelemetryChart(container, {
  title, xLabel, yLabel, xValues, series, bands = [],
} = {}) {
  if (!container || typeof document === "undefined") {
    throw new TypeError("Se necesita un contenedor DOM para dibujar la gráfica.");
  }
  container.replaceChildren();
  const validation = validateTelemetryChartData({ xValues, series, bands });
  if (!validation.valid) {
    const message = document.createElement("p");
    message.className = "csv-derived-note";
    message.textContent = "No se generó la gráfica: " + validation.reason;
    container.append(message);
    return null;
  }
  const UPlot = globalThis.uPlot;
  if (typeof UPlot !== "function") {
    const message = document.createElement("p");
    message.className = "csv-derived-note";
    message.textContent = "La biblioteca de gráficas local no está disponible. La tabla mantiene los datos derivados.";
    container.append(message);
    return null;
  }

  const plotHost = document.createElement("div");
  plotHost.className = "telemetry-chart-canvas";
  plotHost.setAttribute("role", "img");
  plotHost.setAttribute("aria-label",
    title + ". Gráfica de " + yLabel + " frente a " + xLabel +
    ", con mínimo, mediana y máximo observados por banda.");
  container.append(plotHost);

  const width = Math.max(280, Math.min(1100, Math.floor(container.clientWidth || 560)));
  const data = [xValues, ...series.map(item => item.values)];
  const options = {
    width,
    height: 236,
    title,
    scales: { x: { time: false } },
    axes: [
      { label: xLabel, stroke: "#9aabb8", grid: { stroke: "rgba(125,148,164,0.16)", width: 1 } },
      { label: yLabel, stroke: "#9aabb8", grid: { stroke: "rgba(125,148,164,0.16)", width: 1 } },
    ],
    series: [
      {},
      ...series.map(item => ({
        label: item.label,
        stroke: item.stroke,
        width: item.width ?? 1.5,
        fill: item.fill,
        spanGaps: item.spanGaps === true,
      })),
    ],
    bands,
    cursor: { drag: { x: true, y: false, setScale: true } },
    legend: { show: true },
  };
  const chart = new UPlot(options, data, plotHost);
  activeCharts.add(chart);

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(entries => {
      const measuredWidth = Math.floor(entries[0]?.contentRect?.width ?? container.clientWidth);
      if (measuredWidth > 0) {
        chart.setSize({ width: Math.max(280, Math.min(1100, measuredWidth)), height: 236 });
      }
    });
    observer.observe(container);
    activeObservers.add(observer);
  }
  return chart;
}
