import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_DISPLAY_POINTS,
  SERIES_DISPLAY_DECIMATION_VERSION,
  decimateSeriesForDisplay,
} from "../../src/series-display.mjs";

test("reduce series grandes y conserva picos positivos, negativos y extremos", () => {
  const points = Array.from({ length: 5001 }, (_, index) => ({ x: index, y: 0 }));
  points[2222] = Object.freeze({ x: 2222, y: 950 });
  points[4444] = Object.freeze({ x: 4444, y: -870 });
  const first = points[0];
  const last = points.at(-1);

  const reduced = decimateSeriesForDisplay(points, { maxPoints: 200 });

  assert.equal(SERIES_DISPLAY_DECIMATION_VERSION, "datalog-series-display/1");
  assert.equal(DEFAULT_MAX_DISPLAY_POINTS, 1200);
  assert.ok(reduced.length <= 200);
  assert.strictEqual(reduced[0], first);
  assert.strictEqual(reduced.at(-1), last);
  assert.ok(reduced.includes(points[2222]), "debe conservar el pico positivo");
  assert.ok(reduced.includes(points[4444]), "debe conservar el pico negativo");
  assert.equal(points.length, 5001);
});

test("preserva un separador real cuando faltan muestras dentro de una serie larga", () => {
  const points = Array.from({ length: 3000 }, (_, index) => ({ x: index, y: index }));
  for (let index = 1000; index < 1100; index += 1) {
    points[index] = Object.freeze({ x: index, y: null });
  }

  const reduced = decimateSeriesForDisplay(points, { maxPoints: 100 });

  assert.ok(reduced.length <= 100);
  assert.ok(reduced.includes(points[1000]), "el primer faltante debe interrumpir el trazo");
  assert.ok(reduced.includes(points[0]));
  assert.ok(reduced.includes(points[999]));
  assert.ok(reduced.includes(points[1100]));
  assert.ok(reduced.includes(points[2999]));
});

test("prioriza no conectar segmentos aunque el número de huecos supere el presupuesto", () => {
  const points = [];
  for (let index = 0; index < 40; index += 1) {
    points.push({ x: index, y: index });
    if (index < 39) points.push({ x: index + 0.5, y: null });
  }

  const reduced = decimateSeriesForDisplay(points, { maxPoints: 4 });
  const gapMarkers = reduced.filter(point => !Number.isFinite(point?.y));

  assert.equal(gapMarkers.length, 39);
  assert.ok(reduced.length > 4, "el presupuesto es flexible cuando preservar huecos es necesario");
});

test("conserva todas las referencias cuando la serie ya cabe en el presupuesto", () => {
  const points = [{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }];
  const reduced = decimateSeriesForDisplay(points, { maxPoints: 4 });

  assert.deepEqual(reduced, points);
  assert.strictEqual(reduced[1], points[1]);
});

test("admite ejes definidos por el consumidor sin convertir ni mutar muestras", () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    channels: { rpm: 1000 + index * 10, torque_nm: index === 51 ? 500 : 100 },
  }));
  const reduced = decimateSeriesForDisplay(samples, {
    maxPoints: 20,
    getX: sample => sample.channels.rpm,
    getY: sample => sample.channels.torque_nm,
  });

  assert.ok(reduced.includes(samples[51]));
  assert.strictEqual(reduced[0], samples[0]);
  assert.strictEqual(reduced.at(-1), samples.at(-1));
  assert.equal(samples.length, 100);
});

test("valida entradas y límites", () => {
  assert.throws(() => decimateSeriesForDisplay(null), TypeError);
  assert.throws(() => decimateSeriesForDisplay([], { maxPoints: 3 }), RangeError);
  assert.throws(() => decimateSeriesForDisplay([], { getX: 1 }), TypeError);
  assert.deepEqual(decimateSeriesForDisplay([]), []);
});
