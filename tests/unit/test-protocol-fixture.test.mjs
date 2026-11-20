import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assessTestProtocol } from "../../src/test-protocol.mjs";

test("el caso de estudio ECU publicado se reproduce con tres réplicas sintéticas, sin atribuirle datos reales", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../examples/test-protocol-ecu-steady-state.synthetic.json", import.meta.url), "utf8"));
  assert.match(fixture.evidenceClass, /^synthetic_/);
  const result = assessTestProtocol(fixture.runs, fixture.options);
  assert.equal(result.status, "supported");
  assert.equal(result.findings.length, 0);
  assert.equal(result.repeatability.status, "within_user_limit");
  assert.equal(result.repeatability.replicateCount, 3);
});
