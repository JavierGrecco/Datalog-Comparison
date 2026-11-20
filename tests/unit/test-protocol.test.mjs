import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyOperatingConditions } from "../../src/operating-conditions.mjs";
import { assessRepeatability, assessTestProtocol } from "../../src/test-protocol.mjs";

function conditions(values) {
  const result = createEmptyOperatingConditions();
  for (const [key, value] of Object.entries(values)) {
    result.fields[key] = { value, status: "measured", source: "instrumento / hoja de ensayo", note: "" };
  }
  result.updatedAt = "2026-11-20T12:00:00.000Z";
  return result;
}
function ecuRun(id, rpm) {
  return { id, domain: "ecu", protocol: { id: "ecu-steady-v1", mode: "steady_state", stabilizationMinutes: 5 },
    operatingPointId: "3000rpm-80pct-load",
    operatingPoint: { rpm: 3000, loadPct: 80 },
    operatingConditions: conditions({ calibration_id: "map-A", fuel: "nafta 98 RON",
      intake_temp_c: 32, coolant_temp_c: 88 }),
    metrics: { torque_nm: 150 + rpm, lambda: 0.98 + rpm / 100000 } };
}
function dynoRun(id, torque) {
  return { id, domain: "dyno", protocol: { id: "dynojet-roller-v1", mode: "inertia_sweep" },
    operatingPointId: "sweep-2500-6500-rpm",
    operatingPoint: { rpmStart: 2500, rpmEnd: 6500 },
    operatingConditions: conditions({
      vehicle_engine: "1.6 SI", fuel: "nafta 98 RON", gear: "4",
      test_method: "chassis dynamometer", dyno_model: "Dynojet 224x",
      dyno_type: "chassis", dyno_measurement_basis: "wheel",
      dyno_load_mode: "inercial", dyno_ramp_rate_rpm_s: 300,
      dyno_smoothing_setting: "5", dyno_correction_standard: "SAE J1349:2025",
      dyno_fan_setup: "ventilador frontal fijo", instrument_calibration: "verificación 2026-11-01",
      tire_size: "205/55 R16", tire_pressure_kpa: 230, tire_condition: "neumáticos calientes, sin cambios",
      dyno_strapping: "4 puntos, misma tensión", ambient_temp_c: 24,
      ambient_pressure_kpa: 99.8, relative_humidity_pct: 48,
    }),
    metrics: { torque_nm: torque, power_kw: 80 + torque / 100 } };
}

test("un ensayo ECU estacionario exige calibración, combustible y temperaturas con fuente", () => {
  const runs = [ecuRun("a", 0), ecuRun("b", 1), ecuRun("c", -1)];
  const result = assessTestProtocol(runs, { maximumCvPct: 2 });
  assert.equal(result.status, "supported");
  assert.equal(result.repeatability.status, "within_user_limit");
  assert.equal(result.repeatability.replicateCount, 3);
});

test("un estudio ECU con menos de tres adquisiciones no se aprueba por repetibilidad", () => {
  const result = assessTestProtocol([ecuRun("a", 0), ecuRun("b", 1)], { maximumCvPct: 2 });
  assert.equal(result.status, "review_required");
  assert.ok(result.findings.some(item => item.code === "insufficient_replicates"));
});

test("un banco de chasis exige configuración, neumáticos, sujeción, ambiente y corrección declarados", () => {
  const result = assessTestProtocol([dynoRun("a", 100), dynoRun("b", 100.2), dynoRun("c", 99.9)],
    { maximumCvPct: 1 });
  assert.equal(result.status, "supported");
  assert.equal(result.domain, "dyno");
  assert.equal(result.mode, "inertia_sweep");
});

test("una diferencia de combustible o rampa impide agrupar tiradas como repeticiones idénticas", () => {
  const a = dynoRun("a", 100), b = dynoRun("b", 100), c = dynoRun("c", 100);
  b.operatingConditions.fields.fuel.value = "nafta 95 RON";
  c.operatingConditions.fields.dyno_ramp_rate_rpm_s.value = 350;
  const result = assessTestProtocol([a, b, c], { maximumCvPct: 2 });
  assert.equal(result.status, "review_required");
  assert.ok(result.findings.some(item => item.code === "setup_mismatch"));
});

test("el dominio ECU y dinamómetro no se mezclan en el mismo protocolo", () => {
  const result = assessTestProtocol([ecuRun("ecu", 0), dynoRun("dyno", 100)]);
  assert.equal(result.status, "blocked");
  assert.equal(result.findings[0].code, "mixed_or_unknown_domain");
});

test("el CV se calcula con desviación estándar muestral y no aprueba sin límite explícito", () => {
  const result = assessRepeatability([
    { metrics: { torque_nm: 99 } }, { metrics: { torque_nm: 100 } }, { metrics: { torque_nm: 101 } },
  ]);
  assert.equal(result.status, "threshold_not_configured");
  assert.ok(result.metrics[0].cvPct > 0.9 && result.metrics[0].cvPct < 1.1);
  assert.equal(result.metrics[0].count, 3);
});

test("un CV por encima del límite configurado requiere revisión", () => {
  const result = assessRepeatability([
    { metrics: { torque_nm: 90 } }, { metrics: { torque_nm: 100 } }, { metrics: { torque_nm: 110 } },
  ], { maximumCvPct: 2 });
  assert.equal(result.status, "review_required");
  assert.equal(result.metrics[0].status, "above_user_limit");
});

test("una ECU transitoria requiere identificación del vehículo, mapa, combustible y ambiente", () => {
  const run = ecuRun("a", 0);
  run.protocol = { id: "ecu-road-v1", mode: "transient" };
  run.operatingConditions = conditions({ vehicle_engine: "1.6 SI", calibration_id: "map-A",
    fuel: "nafta 98 RON", ambient_temp_c: 25 });
  const result = assessTestProtocol([run], { maximumCvPct: 3 });
  assert.equal(result.status, "review_required");
  assert.ok(result.findings.some(item => item.code === "insufficient_replicates"));
});

test("no declara repetibilidad si no hay métricas numéricas", () => {
  const result = assessRepeatability([{ metrics: {} }, { metrics: {} }, { metrics: {} }], { maximumCvPct: 2 });
  assert.equal(result.status, "no_metrics");
  assert.equal(result.metrics.length, 0);
});

test("un punto ECU sin RPM o carga y sin estabilización queda en revisión", () => {
  const run = ecuRun("a", 0);
  run.operatingPoint = { rpm: 3000 };
  run.protocol.stabilizationMinutes = 0;
  const result = assessTestProtocol([run], { maximumCvPct: 2 });
  assert.ok(result.findings.some(item => item.code === "operating_point_incomplete"));
  assert.ok(result.findings.some(item => item.code === "stabilization_not_declared"));
});


function engineDynoRun(id, torque) {
  const run = dynoRun(id, torque);
  run.protocol = { id: "engine-steady-v1", mode: "steady_state" };
  run.operatingPointId = "engine-3000rpm-300nm";
  run.operatingPoint = { rpm: 3000, loadNm: 300 };
  const fields = run.operatingConditions.fields;
  for (const key of ["gear", "tire_size", "tire_pressure_kpa", "tire_condition",
    "dyno_strapping", "dyno_ramp_rate_rpm_s", "dyno_smoothing_setting"]) {
    fields[key] = { value: null, status: "unknown", source: "", note: "" };
  }
  fields.test_method.value = "Banco de motor estacionario";
  fields.dyno_type.value = "engine";
  fields.dyno_measurement_basis.value = "engine";
  return run;
}

test("un banco de motor estacionario no exige marcha, neumáticos, sujeción, rampa ni suavizado", () => {
  const result = assessTestProtocol([
    engineDynoRun("a", 100), engineDynoRun("b", 100.1), engineDynoRun("c", 99.9),
  ], { maximumCvPct: 1 });
  assert.equal(result.status, "supported");
  assert.equal(result.domain, "dyno");
  assert.equal(result.mode, "steady_state");
  for (const key of ["gear", "tire_size", "tire_pressure_kpa", "tire_condition",
    "dyno_strapping", "dyno_ramp_rate_rpm_s", "dyno_smoothing_setting"]) {
    assert.equal(result.requiredConditions.includes(key), false, key + " no debe ser obligatorio en banco de motor estacionario");
  }
});

test("un protocolo no agrupa bases rueda y rodillo como una misma medición", () => {
  const runs = [dynoRun("a", 100), dynoRun("b", 100.1), dynoRun("c", 99.9)];
  runs[2].operatingConditions.fields.dyno_measurement_basis.value = "roller";
  const result = assessTestProtocol(runs, { maximumCvPct: 1 });
  assert.equal(result.status, "blocked");
  assert.ok(result.findings.some(item => item.code === "dyno_measurement_basis_mismatch"));
});

test("un banco de chasis no puede declarar base motor y un banco de motor no puede declarar base rueda", () => {
  const chassis = dynoRun("chassis", 100);
  chassis.operatingConditions.fields.dyno_measurement_basis.value = "engine";
  const invalidChassis = assessTestProtocol([chassis, dynoRun("b", 100.1), dynoRun("c", 99.9)], { maximumCvPct: 1 });
  assert.equal(invalidChassis.status, "blocked");
  assert.ok(invalidChassis.findings.some(item => item.code === "dyno_measurement_basis_incompatible"));

  const engine = engineDynoRun("engine", 100);
  engine.operatingConditions.fields.dyno_measurement_basis.value = "wheel";
  const invalidEngine = assessTestProtocol([engine, engineDynoRun("b", 100.1), engineDynoRun("c", 99.9)], { maximumCvPct: 1 });
  assert.equal(invalidEngine.status, "blocked");
  assert.ok(invalidEngine.findings.some(item => item.code === "dyno_measurement_basis_incompatible"));
});

test("los barridos requieren rampa y suavizado, pero el punto estacionario no", () => {
  const sweepRuns = [dynoRun("a", 100), dynoRun("b", 100.1), dynoRun("c", 99.9)];
  for (const run of sweepRuns) {
    for (const key of ["dyno_ramp_rate_rpm_s", "dyno_smoothing_setting"]) {
      run.operatingConditions.fields[key] = { value: null, status: "unknown", source: "", note: "" };
    }
  }
  const sweep = assessTestProtocol(sweepRuns, { maximumCvPct: 1 });
  assert.equal(sweep.status, "review_required");
  assert.ok(sweep.findings.some(item => item.code === "condition_not_evidenced" && item.field === "dyno_ramp_rate_rpm_s"));

  const steadyRuns = [engineDynoRun("a", 100), engineDynoRun("b", 100.1), engineDynoRun("c", 99.9)];
  const steady = assessTestProtocol(steadyRuns, { maximumCvPct: 1 });
  assert.equal(steady.status, "supported");
});
