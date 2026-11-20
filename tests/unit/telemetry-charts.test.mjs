import assert from "node:assert/strict";
import test from "node:test";
import { validateTelemetryChartData } from "../../app/telemetry-charts.mjs";

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
