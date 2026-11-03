import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPortfolioDemoReport,
  createPortfolioDemoCase,
  PORTFOLIO_DEMO_CASES,
} from "../../src/demo-model.mjs";
import { assessComparisonReadiness } from "../../src/comparison-readiness.mjs";

test("el demo de portfolio ofrece tres casos deterministas y todos quedan marcados como sintéticos", () => {
  assert.deepEqual(PORTFOLIO_DEMO_CASES.map(item => item.id), ["complete", "missing", "mixed"]);
  for (const id of ["complete", "missing", "mixed"]) {
    const demo = createPortfolioDemoCase(id);
    assert.equal(demo.reference.synthetic, true);
    assert.equal(demo.candidate.synthetic, true);
    assert.equal(demo.reference.samples.length, 101);
    assert.equal(demo.caseId, id);
  }
});

test("el caso base compara registros del mismo dominio, pero exige revisión de datos reales", () => {
  const demo = createPortfolioDemoCase("complete");
  const readiness = assessComparisonReadiness(demo.reference, demo.candidate);

  assert.equal(readiness.status, "review_required");
  assert.equal(readiness.gates.find(gate => gate.id === "source").status, "supported");
  assert.ok(readiness.assessments.comparison.commonChannels.some(channel => channel.key === "torque_nm"));
  assert.equal(readiness.gates.find(gate => gate.id === "real-world-validation").status, "review_required");
});

test("el caso de faltantes expone problemas de cobertura y tiempo sin rellenarlos", () => {
  const demo = createPortfolioDemoCase("missing");
  const readiness = assessComparisonReadiness(demo.reference, demo.candidate);

  assert.equal(readiness.status, "review_required");
  assert.equal(readiness.gates.find(gate => gate.id === "data").status, "review_required");
  assert.equal(readiness.gates.find(gate => gate.id === "channels").status, "review_required");
  assert.ok(readiness.assessments.dataQuality.candidate.timestamp.missingCount > 0);
  assert.ok(readiness.assessments.dataQuality.candidate.timestamp.retrogressions > 0);
  assert.ok(readiness.nextActions.some(action => /marcas de tiempo originales/i.test(action)));
});

test("el caso ECU frente a dinamómetro bloquea la comparación numérica conjunta", () => {
  const demo = createPortfolioDemoCase("mixed");
  const readiness = assessComparisonReadiness(demo.reference, demo.candidate);

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.gates.find(gate => gate.id === "source").status, "blocked");
  assert.ok(readiness.nextActions.some(action => /Separá los registros ECU\/logger y dinamómetro/i.test(action)));
});

test("el informe exportable conserva estado y procedencia sin incluir rutas locales ni logs completos", () => {
  const demo = createPortfolioDemoCase("missing");
  const report = buildPortfolioDemoReport(demo);
  const serialized = JSON.stringify(report);

  assert.equal(report.schema, "datalog-portfolio-comparison-demo/1");
  assert.equal(report.synthetic, true);
  assert.equal(report.runs.length, 2);
  assert.equal(report.readiness.status, "review_required");
  assert.ok(report.observedPeaks.reference.torque);
  assert.ok(report.observedPeaks.candidate.power);
  assert.match(serialized, /datos son sintéticos/i);
  assert.doesNotMatch(serialized, /\/Users\/|\/home\/|C:\\\\Users\\\\/i);
  assert.doesNotMatch(serialized, /"samples":\[/);
});

test("rechaza identificadores de caso desconocidos", () => {
  assert.throws(() => createPortfolioDemoCase("inventado"), /Caso de demo desconocido/);
});
