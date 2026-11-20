import assert from "node:assert/strict";
import test from "node:test";
import { buildRpmBandChartData, validateTelemetryChartData } from "../../app/telemetry-charts.mjs";

test("acepta bandas ascendentes con series numéricas alineadas", () => {
  const result = validateTelemetryChartData({
    xValues: [2500, 2700, 2900],
    series: [
      { label: "Mínimo", values: [120, 125, 130] },
      { label: "Mediana", values: [125, 130, 135] },
      { label: "Máximo", values: [130, 135, 140] },
    ],
  });
  assert.deepEqual(result, { valid: true, reason: null });
});

test("acepta valores nulos sin rellenar huecos", () => {
  const result = validateTelemetryChartData({
    xValues: [1000, 1100, 1200],
    series: [{ label: "Señal", values: [1.2, null, 1.5] }],
  });
  assert.equal(result.valid, true);
});

test("rechaza ejes RPM repetidos o desordenados sin ordenarlos automáticamente", () => {
  for (const xValues of [[1000, 1000, 1200], [1000, 1200, 1100]]) {
    const result = validateTelemetryChartData({
      xValues, series: [{ label: "Torque", values: [100, 110, 120] }],
    });
    assert.equal(result.valid, false);
    assert.match(result.reason, /estrictamente creciente/);
  }
});

test("rechaza series cuya longitud no coincide con el eje", () => {
  const result = validateTelemetryChartData({
    xValues: [1000, 1100, 1200],
    series: [{ label: "Potencia", values: [30, 31] }],
  });
  assert.equal(result.valid, false);
  assert.match(result.reason, /alineados/);
});

test("rechaza NaN e infinitos en las series", () => {
  for (const values of [[30, Number.NaN, 32], [30, Infinity, 32]]) {
    assert.equal(validateTelemetryChartData({
      xValues: [1000, 1100, 1200],
      series: [{ label: "Potencia", values }],
    }).valid, false);
  }
});


test("expande bandas RPM faltantes en null y mantiene el hueco sin interpolarlo", () => {
  const result = buildRpmBandChartData([
    { rpmLower: 2400, rpmUpper: 2600, valueMin: 150, valueMedian: 152, valueMax: 154, sampleCount: 2 },
    { rpmLower: 2600, rpmUpper: 2800, valueMin: 155, valueMedian: 157, valueMax: 159, sampleCount: 2 },
    { rpmLower: 3000, rpmUpper: 3200, valueMin: 160, valueMedian: 162, valueMax: 164, sampleCount: 2 },
  ], 200);
  assert.equal(result.valid, true);
  assert.deepEqual(result.xValues, [2500, 2700, 2900, 3100]);
  assert.deepEqual(result.minimumValues, [150, 155, null, 160]);
  assert.deepEqual(result.medianValues, [152, 157, null, 162]);
  assert.deepEqual(result.maximumValues, [154, 159, null, 164]);
  assert.equal(result.missingBandCount, 1);
  assert.equal(result.xAxisLabel, "Centro de banda (RPM)");
});

test("rechaza bandas RPM desordenadas, duplicadas o con envolvente inconsistente", () => {
  const first = { rpmLower: 1000, rpmUpper: 1200, valueMin: 10, valueMedian: 11, valueMax: 12, sampleCount: 2 };
  const second = { rpmLower: 1200, rpmUpper: 1400, valueMin: 12, valueMedian: 13, valueMax: 14, sampleCount: 2 };
  assert.equal(buildRpmBandChartData([second, first], 200).valid, false);
  assert.equal(buildRpmBandChartData([first, first], 200).valid, false);
  assert.equal(buildRpmBandChartData([
    { ...first, valueMin: 12, valueMedian: 11 },
    second,
  ], 200).valid, false);
});

test("limita la expansión visual para evitar arreglos enormes", () => {
  const result = buildRpmBandChartData([
    { rpmLower: 0, rpmUpper: 1, valueMin: 1, valueMedian: 1, valueMax: 1, sampleCount: 1 },
    { rpmLower: 6000, rpmUpper: 6001, valueMin: 2, valueMedian: 2, valueMax: 2, sampleCount: 1 },
  ], 1, { maxPoints: 1000 });
  assert.equal(result.valid, false);
  assert.match(result.reason, /demasiadas bandas/);
});

test("valida bandas high-low con índices de series válidos", () => {
  const valid = validateTelemetryChartData({
    xValues: [1000, 1200],
    series: [
      { label: "Mínimo", values: [10, 11] },
      { label: "Máximo", values: [12, 13] },
      { label: "Mediana", values: [11, 12] },
    ],
    bands: [{ series: [1, 2], fill: "rgba(0,0,0,0.1)" }],
  });
  assert.equal(valid.valid, true);
  const invalid = validateTelemetryChartData({
    xValues: [1000, 1200],
    series: [{ label: "Curva", values: [10, 11] }],
    bands: [{ series: [1, 2] }],
  });
  assert.equal(invalid.valid, false);
});
