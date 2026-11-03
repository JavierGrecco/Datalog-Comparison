/**
 * Synthetic datasets for the portfolio demo.
 *
 * All values are generated for interface/testing demonstrations only. They are
 * not measurements from an engine and must never be used for calibration.
 */
import { assessComparisonReadiness } from "./comparison-readiness.mjs";
import {
  OPERATING_CONDITION_FIELDS,
  createEmptyOperatingConditions,
} from "./operating-conditions.mjs";
import {
  createRunManifest,
  createSourceFileManifest,
} from "./run-manifest.mjs";

export const PORTFOLIO_DEMO_CASES = Object.freeze([
  { id: "complete", label: "Dos registros sintéticos", description: "Canales y unidades disponibles; la matriz recuerda que aún falta validación real." },
  { id: "missing", label: "Datos incompletos", description: "Muestra faltantes y una secuencia temporal con problemas." },
  { id: "mixed", label: "ECU frente a banco", description: "Demuestra por qué dos fuentes distintas no se deben comparar como la misma medición." },
]);

const fixedTimestamp = "2026-10-28T00:00:00.000Z";

function smooth(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function makeSamples({ midGain = 0, highLoss = 0, targetShift = 0, intakeShift = 0 } = {}) {
  return Array.from({ length: 101 }, (_, index) => {
    const x = index / 100;
    const rpm = 1600 + 3400 * x;
    const torqueRise = smooth(x / 0.42);
    const torqueFall = smooth((x - 0.42) / 0.58);
    const torqueNm = 205 + 142 * torqueRise - 142 * torqueFall
      + midGain * Math.exp(-Math.pow((x - 0.5) / 0.19, 2))
      - highLoss * smooth((x - 0.73) / 0.27);
    const boostBase = 102 + 74 * smooth((x - 0.08) / 0.56);
    const boostTarget = boostBase + targetShift;
    const boostActual = boostBase - 4.5 * smooth((x - 0.83) / 0.17);
    const intakeTemp = 28 + intakeShift + 12 * smooth(x) + 1.2 * Math.sin(Math.PI * x);
    const powerKw = torqueNm * rpm / 9549.29658551372;
    const speedKmh = 32 + 34 * smooth(x / 0.3) + 33 * smooth((x - 0.3) / 0.3)
      + 34 * smooth((x - 0.62) / 0.28);

    return {
      time_s: index * 0.12,
      channels: {
        time_s: index * 0.12,
        rpm,
        speed_kmh: speedKmh,
        torque_nm: torqueNm,
        power_kw: powerKw,
        boost_target: boostTarget,
        boost_actual: boostActual,
        iat_c: intakeTemp,
      },
    };
  });
}

function conditionValue(key, definition, role) {
  const numeric = {
    throttle_pct: 68,
    load_pct: 74,
    ambient_temp_c: 24,
    intake_temp_c: role === "candidate" ? 39 : 36,
    coolant_temp_c: 88,
    ambient_pressure_kpa: 101.3,
    relative_humidity_pct: 48,
    vehicle_mass_kg: 1480,
    tire_pressure_kpa: 220,
    dyno_ramp_rate_rpm_s: 300,
  };
  if (definition.type === "number") return numeric[key] ?? 0;
  const values = {
    vehicle_engine: "Vehículo y motor ficticios",
    calibration_id: role === "candidate" ? "mapa-sintetico-B" : "mapa-sintetico-A",
    fuel: "Combustible de ejemplo, sin equivalencia real",
    gear: "3 (declaración sintética)",
    test_method: "Recorrido sintético de demostración",
    hardware_notes: "Hardware ficticio sin especificación de motor real",
    tire_size: "Neumático de ejemplo no asociado a vehículo real",
    dyno_smoothing_setting: "parámetro sintético; no representa software de banco",
    dyno_load_mode: "modo sintético de demostración",
  };
  return values[key] ?? "Dato descriptivo sintético";
}

function makeOperatingConditions(role) {
  const conditions = createEmptyOperatingConditions();
  for (const definition of OPERATING_CONDITION_FIELDS) {
    conditions.fields[definition.key] = {
      value: conditionValue(definition.key, definition, role),
      status: "reported",
      source: "Generador de datos sintéticos de portfolio",
      note: "Valor artificial para demostrar la interfaz; no es una condición medida en un vehículo.",
    };
  }
  conditions.updatedAt = fixedTimestamp;
  return conditions;
}

function makeManifest(run, role) {
  const manifest = createRunManifest({ id: run.id, role, createdAt: fixedTimestamp });
  manifest.updatedAt = fixedTimestamp;
  manifest.sourceFiles = [createSourceFileManifest({
    displayName: run.filename,
    sha256: null,
    sizeBytes: null,
    format: { value: "synthetic_internal_fixture", evidence: "inferred", source: "Generador interno de demo", note: "No existe un archivo real de origen." },
    parser: { value: "portfolio-demo/1", evidence: "inferred", source: "Generador interno de demo", note: "Los datos se generaron en memoria y no pasaron por un parser de archivos." },
    sourceTool: { value: "portfolio-demo", evidence: "inferred", source: "generador sintético de demo", note: "Identidad sintética generada dentro de la aplicación." },
    exportVersion: { value: "1", evidence: "inferred", source: "generador sintético de demo", note: "Versión declarada del ejemplo sintético." },
    importedAt: fixedTimestamp,
  })];
  manifest.notes = "Datos sintéticos generados en memoria para el portfolio. No representa una medición física.";
  return manifest;
}

function makeRun({ id, name, role, sourceDomain = "ecu", shape = {} }) {
  const run = {
    id,
    name,
    filename: id + ".synthetic.csv",
    sourceDomain,
    sourceType: sourceDomain === "dyno" ? "Dinamómetro sintético" : "ECU/logger sintético",
    synthetic: true,
    samples: makeSamples(shape),
    units: {
      time_s: "s",
      rpm: "RPM",
      speed_kmh: "km/h sintéticos",
      torque_nm: sourceDomain === "dyno" ? "Nm de banco sintéticos" : "Nm sintéticos de ejemplo",
      power_kw: sourceDomain === "dyno" ? "kW de banco sintéticos" : "kW sintéticos de ejemplo",
      boost_target: "kPa sintéticos",
      boost_actual: "kPa sintéticos",
      iat_c: "°C sintéticos",
    },
    importMetadata: {
      parserId: "portfolio-demo/1",
      sourceRowCount: 101,
      headerRows: [1],
      skippedNonEmptyRowCount: 0,
      parsedSampleCount: 101,
    },
    operatingConditions: makeOperatingConditions(role),
    warnings: ["Dato sintético: no usar para diagnóstico ni calibración."],
    note: "Escenario inventado para probar las reglas del software; no representa un motor real.",
  };
  run.runManifest = makeManifest(run, role);
  return run;
}

function cloneRun(run) {
  return {
    ...run,
    units: { ...run.units },
    importMetadata: { ...run.importMetadata },
    operatingConditions: structuredClone(run.operatingConditions),
    runManifest: structuredClone(run.runManifest),
    samples: run.samples.map(sample => ({ ...sample, channels: { ...sample.channels } })),
    warnings: [...run.warnings],
  };
}

function createBasePair() {
  return {
    reference: makeRun({
      id: "synthetic-reference",
      name: "A · Referencia sintética",
      role: "reference",
      shape: {},
    }),
    candidate: makeRun({
      id: "synthetic-candidate",
      name: "B · Candidata sintética",
      role: "candidate",
      shape: { midGain: 17, highLoss: 20, targetShift: 8, intakeShift: 2 },
    }),
  };
}

export function createPortfolioDemoCase(caseId = "complete") {
  const { reference, candidate } = createBasePair();
  let referenceRun = reference;
  let candidateRun = candidate;

  if (caseId === "missing") {
    candidateRun = cloneRun(candidate);
    candidateRun.name = "B · Candidata con faltantes";
    candidateRun.id = "synthetic-candidate-missing";
    candidateRun.runManifest.id = candidateRun.id;
    candidateRun.runManifest.role = "candidate";
    candidateRun.samples = candidateRun.samples.map((sample, index) => {
      const next = { ...sample, channels: { ...sample.channels } };
      if (index % 4 === 0) next.channels.boost_actual = null;
      if (index === 28) next.time_s = null;
      if (index === 61) next.time_s = candidateRun.samples[60].time_s - 0.05;
      return next;
    });
    candidateRun.importMetadata.parsedSampleCount = candidateRun.samples.length;
    candidateRun.importMetadata.sourceRowCount = candidateRun.samples.length + 1;
    candidateRun.warnings.push("Este escenario contiene faltantes y un retroceso temporal añadido deliberadamente.");
  } else if (caseId === "mixed") {
    candidateRun = cloneRun(candidate);
    candidateRun.name = "Banco · Curva sintética";
    candidateRun.id = "synthetic-dyno-candidate";
    candidateRun.sourceDomain = "dyno";
    candidateRun.sourceType = "Dinamómetro sintético";
    candidateRun.runManifest.id = candidateRun.id;
    candidateRun.runManifest.role = "candidate";
    candidateRun.units = {
      time_s: "s",
      rpm: "RPM",
      torque_nm: "Nm de banco sintéticos",
      power_kw: "kW de banco sintéticos",
    };
    candidateRun.samples = candidateRun.samples.map(sample => ({
      time_s: sample.time_s,
      channels: {
        time_s: sample.time_s,
        rpm: sample.channels.rpm,
        torque_nm: sample.channels.torque_nm,
        power_kw: sample.channels.power_kw,
      },
    }));
    candidateRun.warnings.push("Fuente sintética de banco usada para demostrar una comparación que debe bloquearse.");
  } else if (caseId !== "complete") {
    throw new RangeError("Caso de demo desconocido: " + caseId);
  }

  return { caseId, reference: referenceRun, candidate: candidateRun };
}

function peak(run, key) {
  let best = null;
  for (let index = 0; index < run.samples.length; index += 1) {
    const value = run.samples[index]?.channels?.[key];
    const rpm = run.samples[index]?.channels?.rpm;
    if (!Number.isFinite(value) || !Number.isFinite(rpm)) continue;
    if (!best || value > best.value) best = { value, rpm, index };
  }
  return best;
}

export function buildPortfolioDemoReport(demoCase) {
  const readiness = assessComparisonReadiness(demoCase.reference, demoCase.candidate);
  return {
    schema: "datalog-portfolio-comparison-demo/1",
    generatedAt: new Date().toISOString(),
    demoCase: demoCase.caseId,
    synthetic: true,
    runs: [demoCase.reference, demoCase.candidate].map(run => ({
      id: run.id,
      name: run.name,
      sourceDomain: run.sourceDomain,
      sourceType: run.sourceType,
      synthetic: run.synthetic === true,
      sampleCount: run.samples.length,
      sourceFiles: run.runManifest?.sourceFiles?.map(file => ({
        displayName: file.displayName,
        sha256: file.sha256,
        format: file.format?.value ?? null,
        parser: file.parser?.value ?? null,
      })) ?? [],
    })),
    readiness: {
      status: readiness.status,
      headline: readiness.headline,
      summary: readiness.summary,
      gates: readiness.gates,
      nextActions: readiness.nextActions,
    },
    observedPeaks: {
      reference: {
        torque: peak(demoCase.reference, "torque_nm"),
        power: peak(demoCase.reference, "power_kw"),
      },
      candidate: {
        torque: peak(demoCase.candidate, "torque_nm"),
        power: peak(demoCase.candidate, "power_kw"),
      },
    },
    limitations: [
      "Todos los datos son sintéticos, generados en memoria y no representan mediciones de un motor real.",
      "Los máximos son observaciones del fixture y no establecen equivalencia física ni causalidad.",
      "No escribir en ECU ni usar para calibración; las conclusiones requieren datos reales autorizados y revisión experta.",
    ],
  };
}
