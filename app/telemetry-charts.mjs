/**
 * Gráficas interactivas locales para señales derivadas.
 *
 * uPlot se sirve desde vendor/, sin CDN ni solicitudes externas.
 * Este módulo valida el eje antes de dibujar: no ordena ni interpola muestras.
 */
const activeObservers = new Set();
const activeCharts = new Set();

export function validateTelemetryChartData({ xValues, series } = {}) {
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
  return { valid: true, reason: null };
}

export function disposeTelemetryCharts() {
  for (const observer of activeObservers) observer.disconnect();
  activeObservers.clear();
  for (const chart of activeCharts) chart.destroy();
  activeCharts.clear();
}

export function renderTelemetryChart(container, {
  title, xLabel, yLabel, xValues, series,
} = {}) {
  if (!container || typeof document === "undefined") {
    throw new TypeError("Se necesita un contenedor DOM para dibujar la gráfica.");
  }
  container.replaceChildren();
  const validation = validateTelemetryChartData({ xValues, series });
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
      })),
    ],
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
