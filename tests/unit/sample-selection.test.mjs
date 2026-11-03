import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PREVIEW_SAMPLE_LIMIT,
  SAMPLE_SELECTION_VERSION,
  selectPreviewSamples,
} from "../../src/sample-selection.mjs";

test("la vista previa distribuye muestras reales e incluye ambos extremos", () => {
  const samples = Object.freeze(Array.from({ length: 101 }, (_, index) =>
    Object.freeze({ value: index })
  ));
  const selected = selectPreviewSamples(samples);

  assert.equal(SAMPLE_SELECTION_VERSION, "datalog-sample-selection/1");
  assert.equal(DEFAULT_PREVIEW_SAMPLE_LIMIT, 8);
  assert.deepEqual(selected.map(item => item.index), [0, 14, 29, 43, 57, 71, 86, 100]);
  for (const item of selected) {
    assert.strictEqual(item.sample, samples[item.index]);
  }
  assert.equal(selected[0].sample.value, 0);
  assert.equal(selected.at(-1).sample.value, 100);
  assert.equal(samples.length, 101);
});

test("conserva todas las muestras cuando la serie cabe en el límite", () => {
  const samples = [{ value: 1 }, { value: 2 }, { value: 3 }];
  const selected = selectPreviewSamples(samples, { limit: 8 });

  assert.deepEqual(selected.map(item => item.index), [0, 1, 2]);
  assert.deepEqual(selected.map(item => item.sample), samples);
});

test("una serie vacía devuelve una selección vacía", () => {
  assert.deepEqual(selectPreviewSamples([]), []);
});

test("permite configurar un límite mayor o igual a dos", () => {
  const samples = Array.from({ length: 10 }, (_, index) => index);
  assert.deepEqual(
    selectPreviewSamples(samples, { limit: 2 }).map(item => item.index),
    [0, 9]
  );
  assert.equal(selectPreviewSamples(samples, { limit: 5 }).length, 5);
});

test("rechaza entradas y límites inválidos sin modificar datos", () => {
  assert.throws(() => selectPreviewSamples(null), TypeError);
  assert.throws(() => selectPreviewSamples([], { limit: 1 }), RangeError);
  assert.throws(() => selectPreviewSamples([], { limit: 2.5 }), RangeError);
  assert.throws(() => selectPreviewSamples([], { limit: 0 }), RangeError);
});
