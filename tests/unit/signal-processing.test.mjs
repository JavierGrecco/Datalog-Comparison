import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONTINUOUS_CHANNELS,
  SIGNAL_PROCESSING_SCHEMA,
  SIGNAL_PROCESSING_VERSION,
  buildRpmSweepCurves,
  resampleTimeBasedSignals,
} from "../../src/signal-processing.mjs";

function makeTimeRun({ rateHz = 100, durationSeconds = 10, channelBuilder, overrides = {} } = {}) {
  const count = Math.floor(durationSeconds * rateHz) + 1;
  return {
    id: "ecu-synthetic-time",
    sourceDomain: "ecu",
    units: { time_s: "s", rpm: "RPM", boost_actual: "kPa", gear: "1" },
    samples: Array.from({ length: count }, (_, index) => {
      const time = index / rateHz;
      return {
        time_s: time,
        channels: channelBuilder ? channelBuilder(time, index) : {
          rpm: 1500 + index,
          boost_actual: 120 + 10 * Math.sin(2 * Math.PI * 2 * time),
          gear: time < 4.3 ? 2 : 3,
        },
      };
    }),
    ...overrides,
  };
}

function rms(values) {
  return Math.sqrt(values.reduce((total, value) => total + value * value, 0) / values.length);
}

test("la decimación temporal aplica FIR antialias y conserva la escala de baja frecuencia", () => {
  const source = makeTimeRun({
    channelBuilder: time => ({
      rpm: 1800 + 500 * Math.sin(2 * Math.PI * 1 * time),
      boost_actual: 4 * Math.sin(2 * Math.PI * 2 * time) +
        2 * Math.sin(2 * Math.PI * 30 * time),
    }),
  });
  const result = resampleTimeBasedSignals(source, { targetRateHz: 20, channels: ["boost_actual"] });
  const output = result.signals.boost_actual.segments.flatMap(segment => segment.samples);
  const errors = output.map(point =>
    point.value - 4 * Math.sin(2 * Math.PI * 2 * point.time_s)
  );

  assert.equal(result.schema, SIGNAL_PROCESSING_SCHEMA);
  assert.equal(result.algorithm, SIGNAL_PROCESSING_VERSION);
  assert.equal(result.operation, "time-series-decimation");
  assert.ok(Math.abs(result.axis.estimatedSourceRateHz - 100) < 1e-8);
  assert.equal(result.axis.targetRateHz, 20);
  assert.equal(result.parameters.decimationFactor, 5);
  assert.equal(result.parameters.filter.type, "FIR low-pass");
  assert.equal(result.parameters.filter.window, "Blackman");
  assert.equal(result.parameters.filter.phase, "zero-phase symmetric");
  assert.ok(output.length > 150);
  assert.ok(rms(errors) < 0.08, "el componente de 30 Hz debe atenuarse antes de bajar a 20 Hz");
  assert.ok(output.every(point => point.sourceSampleIndex % 5 === 0));
  assert.equal(result.sourceUnmodified, true);
  assert.equal(source.samples.length, 1001);
});

test("las señales discretas se toman en la grilla sin interpolar estados", () => {
  const source = makeTimeRun({
    channelBuilder: (time, index) => ({ rpm: 2000 + index, gear: index < 43 ? 2 : 3 }),
  });
  const result = resampleTimeBasedSignals(source, {
    targetRateHz: 20, channels: ["gear"], signalKinds: { gear: "discrete" },
  });
  const points = result.signals.gear.segments.flatMap(segment => segment.samples);

  assert.equal(result.signals.gear.kind, "discrete");
  assert.equal(result.signals.gear.method, "zero-order-hold-on-observed-source-grid");
  assert.ok(points.some(point => point.sourceSampleIndex === 40 && point.value === 2));
  assert.ok(points.some(point => point.sourceSampleIndex === 45 && point.value === 3));
  assert.equal(points.some(point => point.value === 2.5), false);
});

test("los segmentos cortan celdas faltantes sin filtrar a través de ellas", () => {
  const source = makeTimeRun({
    durationSeconds: 12,
    channelBuilder: (time, index) => ({
      rpm: 1500 + index,
      boost_actual: index >= 500 && index < 520 ? null : Math.sin(index / 10),
    }),
  });
  const result = resampleTimeBasedSignals(source, { targetRateHz: 20, channels: ["boost_actual"] });
  const segments = result.signals.boost_actual.segments;

  assert.ok(segments.length >= 2);
  assert.ok(segments[0].sourceEndSampleIndex < 500);
  assert.ok(segments.at(-1).sourceStartSampleIndex >= 520);
  assert.ok(segments.every(segment => segment.samples.length > 0));
});

test("rechaza tiempo incompleto, duplicado, regresivo y una base demasiado irregular", () => {
  const incomplete = makeTimeRun();
  incomplete.samples[50].time_s = null;
  assert.throws(() => resampleTimeBasedSignals(incomplete, { targetRateHz: 20 }),
    error => error.code === "SIGNAL_PROCESSING_TIME_INVALID");

  const duplicate = makeTimeRun();
  duplicate.samples[50].time_s = duplicate.samples[49].time_s;
  assert.throws(() => resampleTimeBasedSignals(duplicate, { targetRateHz: 20 }),
    error => error.code === "SIGNAL_PROCESSING_TIME_NOT_MONOTONIC");

  const backwards = makeTimeRun();
  backwards.samples[50].time_s = backwards.samples[49].time_s - 0.001;
  assert.throws(() => resampleTimeBasedSignals(backwards, { targetRateHz: 20 }),
    error => error.code === "SIGNAL_PROCESSING_TIME_NOT_MONOTONIC");

  const irregular = makeTimeRun();
  irregular.samples[50].time_s += 0.001;
  for (let index = 51; index < irregular.samples.length; index += 1) {
    irregular.samples[index].time_s += 0.001;
  }
  assert.throws(() => resampleTimeBasedSignals(irregular, { targetRateHz: 20 }),
    error => error.code === "SIGNAL_PROCESSING_TIMEBASE_IRREGULAR");
});

test("rechaza factores no enteros, upsampling, canales sin tipo y señales demasiado cortas", () => {
  const source = makeTimeRun({ durationSeconds: 0.2 });
  assert.equal(DEFAULT_CONTINUOUS_CHANNELS.rpm, "continuous");
  assert.throws(() => resampleTimeBasedSignals(source, { targetRateHz: 30 }),
    error => error.code === "SIGNAL_PROCESSING_RATIO_UNSUPPORTED");
  assert.throws(() => resampleTimeBasedSignals(source, { targetRateHz: 200 }),
    error => error.code === "SIGNAL_PROCESSING_RATIO_UNSUPPORTED");
  assert.throws(() => resampleTimeBasedSignals(source, {
    targetRateHz: 20, channels: ["gear"],
  }), error => error.code === "SIGNAL_PROCESSING_CHANNEL_KIND_REQUIRED");

  const result = resampleTimeBasedSignals(source, { targetRateHz: 20, channels: ["boost_actual"] });
  assert.equal(result.signals.boost_actual.outputSampleCount, 0);
  assert.ok(result.warnings.some(warning => /segmentos/.test(warning)));
});

test("valida el origen temporal y parámetros numéricos", () => {
  const source = makeTimeRun();
  assert.throws(() => resampleTimeBasedSignals({ ...source, units: { rpm: "RPM" } }, { targetRateHz: 20 }),
    error => error.code === "SIGNAL_PROCESSING_TIME_AXIS_REQUIRED");
  assert.throws(() => resampleTimeBasedSignals(source, { targetRateHz: 0 }),
    error => error.code === "SIGNAL_PROCESSING_OPTION_INVALID");
  assert.throws(() => resampleTimeBasedSignals(source, { targetRateHz: 20, maxGapFactor: 1 }),
    error => error.code === "SIGNAL_PROCESSING_OPTION_INVALID");
});

function makeDynoRun({ measurementBasis = "wheel" } = {}) {
  const firstSweep = Array.from({ length: 36 }, (_, index) => 2500 + index * 100);
  const drop = [5700, 5300, 4900, 4500, 4100, 3700, 3300, 3000];
  const secondSweep = Array.from({ length: 31 }, (_, index) => 3000 + index * 100);
  const rpmValues = [...firstSweep, ...drop, ...secondSweep];
  return {
    id: "dyno-synthetic-pull",
    sourceDomain: "dyno",
    measurementBasis,
    units: { rpm: "RPM", torque_nm: "Nm", power_kw: "kW" },
    samples: rpmValues.map((rpm, index) => ({
      time_s: index * 0.05,
      channels: {
        rpm,
        torque_nm: 180 - Math.pow((rpm - 4400) / 2400, 2) * 80 + Math.sin(index) * 2,
        power_kw: 30 + rpm * 0.045 - Math.pow((rpm - 5500) / 2500, 2) * 30,
      },
    })),
  };
}

test("el dinamómetro separa dos barridos ascendentes y no mezcla las tiradas", () => {
  const source = makeDynoRun();
  const result = buildRpmSweepCurves(source, { rpmBinWidth: 200, minimumSweepSpanRpm: 1000 });

  assert.equal(result.operation, "dyno-rpm-sweep-binning");
  assert.equal(result.measurementBasis, "wheel");
  assert.equal(result.status, "ready");
  assert.equal(result.curves.length, 2);
  assert.ok(result.curves[0].sourceEndSampleIndex < result.curves[1].sourceStartSampleIndex);
  assert.equal(result.curves[0].direction, "increasing");
  assert.ok(result.curves.every(curve => curve.channels.torque_nm.bins.length >= 2));
  assert.ok(result.curves.every(curve => curve.channels.power_kw.bins.length >= 2));
  assert.ok(result.curves[0].channels.torque_nm.peak);
  assert.ok(result.curves[0].channels.torque_nm.bins.every(bin =>
    bin.valueMin <= bin.valueMedian && bin.valueMedian <= bin.valueMax));
  assert.equal(result.sourceUnmodified, true);
  assert.equal(source.samples.length, 75);
});

test("omite bandas vacías y conserva índices fuente en cada banda", () => {
  const source = makeDynoRun();
  const result = buildRpmSweepCurves(source, { rpmBinWidth: 250, minimumSweepSpanRpm: 1000 });
  const first = result.curves[0].channels.torque_nm.bins[0];

  assert.ok(first.sampleCount > 0);
  assert.equal(first.sourceSampleIndices.length, first.sampleCount);
  assert.ok(first.rpmMedian >= first.rpmLower);
  assert.ok(first.rpmMedian < first.rpmUpper);
});

test("conserva base desconocida como revisión y rechaza registros que no sean dyno", () => {
  const unknown = buildRpmSweepCurves(makeDynoRun({ measurementBasis: "unknown" }));
  assert.equal(unknown.status, "review_required");
  assert.ok(unknown.warnings.some(warning => /base física desconocida/.test(warning)));

  assert.throws(() => buildRpmSweepCurves({
    ...makeDynoRun(), sourceDomain: "ecu",
  }), error => error.code === "SIGNAL_PROCESSING_DYNO_REQUIRED");
});

test("rechaza curvas sin señales seleccionables ni metadatos de base física", () => {
  const source = makeDynoRun();
  assert.throws(() => buildRpmSweepCurves({ ...source, measurementBasis: null }),
    error => error.code === "SIGNAL_PROCESSING_DYNO_BASIS_REQUIRED");
  assert.throws(() => buildRpmSweepCurves(source, { channels: ["rpm"] }),
    error => error.code === "SIGNAL_PROCESSING_DYNO_CHANNEL_UNSUPPORTED");
});
