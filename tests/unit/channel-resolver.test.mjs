import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUnitForChannel,
  resolveUnitToken,
} from "../../src/unit-registry.mjs";
import {
  profileColumnValues,
  resolveColumnHeader,
  suggestColumnMappings,
} from "../../src/channel-resolver.mjs";
import { mapCsvToRun, parseCsvText } from "../../src/csv-import.mjs";
import { assessRunDataQuality } from "../../src/data-quality.mjs";

test("los símbolos UCUM conservan el significado de mayúsculas y prefijos", () => {
  assert.equal(resolveUnitToken("Pa").dimension, "pressure");
  assert.equal(resolveUnitToken("pA").dimension, "electric_current");
  assert.equal(resolveUnitToken("pa").status, "unknown");
  assert.equal(resolveUnitForChannel("boost_actual", "pA").status, "dimension_mismatch");

  const milliWatt = resolveUnitForChannel("power_kw", "mW");
  const megaWatt = resolveUnitForChannel("power_kw", "MW");
  assert.equal(milliWatt.dimension, "power");
  assert.equal(megaWatt.dimension, "power");
  assert.equal(milliWatt.factor, 0.000001);
  assert.equal(megaWatt.factor, 1000);
  assert.notEqual(milliWatt.factor, megaWatt.factor);
});

test("la dimensión distingue km de km/h y acepta variantes explícitas de velocidad", () => {
  assert.equal(resolveUnitToken("km").dimension, "distance");
  assert.equal(resolveUnitToken("km/h").dimension, "speed");
  assert.equal(resolveUnitToken("KM/H").dimension, "speed");
  assert.equal(resolveUnitToken("kmh").dimension, "speed");
  assert.equal(resolveUnitToken("kmph").dimension, "speed");
  assert.equal(resolveUnitToken("KPH").dimension, "speed");
});

test("convierte tiempo en milisegundos y distancia en metros sin alterar las unidades originales", () => {
  const parsed = parseCsvText(
    "Elapsed Time (ms),Engine RPM,Distance (m)\n0,1800,1200\n100,1900,1350\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "unit-normalization-v2",
    name: "Fixture sintético de unidades",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (ms)",
      rpm: "Engine RPM",
      distance_km: "Distance (m)",
    },
    units: { time_s: "ms", rpm: "RPM", distance_km: "m" },
    importedAt: "2026-11-03T00:00:00.000Z",
  });

  assert.equal(run.samples[1].time_s, 0.1);
  assert.equal(run.samples[1].channels.distance_km, 1.35);
  assert.equal(run.units.time_s, "s");
  assert.equal(run.units.distance_km, "km");
  assert.equal(run.importMetadata.unitNormalizationVersion, "datalog-units/2");
  assert.equal(run.importMetadata.sourceUnits.time_s, "ms");
  assert.equal(run.importMetadata.sourceUnits.distance_km, "m");
  assert.equal(run.samples[1].sourceValues.time_s, "100");
  assert.equal(run.samples[1].sourceValues.distance_km, "1350");
  assert.equal(run.samples[1].channels.distance_km, 1.35);
});

test("identifica velocidad con unidad aunque el encabezado cambie mayúsculas", () => {
  const result = resolveColumnHeader("Vehicle Speed (KM/H)");
  assert.equal(result.status, "exact");
  assert.equal(result.suggestedKey, "speed_kmh");
  assert.equal(result.autoAssignable, true);
  assert.equal(result.unit.dimension, "speed");
  assert.equal(result.unit.raw, "KM/H");
});

test("una variante con error de tipeo se propone, pero nunca se asigna automáticamente", () => {
  const result = resolveColumnHeader("Vehcile Speed (kmh)");
  assert.equal(result.status, "fuzzy");
  assert.equal(result.suggestedKey, "speed_kmh");
  assert.equal(result.autoAssignable, false);
  assert.match(result.reason, /error de tipeo/i);
});

test("la detección de RPM no confunde motor con rueda o rodillo", () => {
  const bare = resolveColumnHeader("RPM");
  assert.equal(bare.status, "review_unit_only");
  assert.equal(bare.suggestedKey, null);
  assert.equal(bare.candidates.some(candidate => candidate.key === "rpm"), false);
  assert.equal(bare.candidates[0].label, "Velocidad angular (motor/rueda/árbol/rodillo)");
  assert.match(bare.reason, /motor, rueda.*rodillo/i);

  const linear = resolveColumnHeader("Vehicle Logger Channel 2 (km/h)");
  assert.equal(linear.status, "review_unit_only");
  assert.equal(linear.suggestedKey, null);
  assert.equal(linear.candidates[0].key, null);
  assert.match(linear.candidates[0].label, /vehículo\/rueda\/rodillo/i);

  const engine = resolveColumnHeader("Engine RPM");
  assert.equal(engine.status, "exact");
  assert.equal(engine.suggestedKey, "rpm");
  assert.equal(engine.autoAssignable, true);

  const elapsed = resolveColumnHeader("Elapsed [s]");
  assert.equal(elapsed.status, "exact");
  assert.equal(elapsed.suggestedKey, "time_s");
  assert.equal(elapsed.autoAssignable, true);

  const wheel = resolveColumnHeader("Wheel RPM");
  assert.equal(wheel.status, "unsupported");
  assert.equal(wheel.suggestedKey, null);
  assert.equal(wheel.autoAssignable, false);
});

test("la unidad kPa limita a presión, pero no elige MAP, boost o combustible", () => {
  const result = resolveColumnHeader("Logger Channel 8 (kPa)");
  assert.equal(result.status, "review_unit_only");
  assert.equal(result.suggestedKey, null);
  assert.equal(result.unit.dimension, "pressure");
  assert.equal(result.candidates.length, 4);
});

test("la unidad km identifica distancia y nunca se interpreta como velocidad", () => {
  const bare = resolveColumnHeader("km");
  assert.equal(bare.status, "review_unit_only");
  assert.equal(bare.candidates.length, 1);
  assert.equal(bare.candidates[0].key, "distance_km");
  assert.equal(bare.candidates.some(candidate => candidate.key === "speed_kmh"), false);

  const odometer = resolveColumnHeader("Odometer (km)");
  assert.equal(odometer.status, "exact");
  assert.equal(odometer.suggestedKey, "distance_km");
  assert.equal(odometer.autoAssignable, true);
});

test("bloquea una unidad incompatible con el significado del encabezado", () => {
  const result = resolveColumnHeader("Vehicle Speed (Pa)");
  assert.equal(result.status, "conflict");
  assert.equal(result.suggestedKey, null);
  assert.equal(result.autoAssignable, false);
  assert.match(result.reason, /corresponde a pressure/i);
});

test("no interpreta señales derivadas ni consignas como canales medidos equivalentes", () => {
  const derivative = resolveColumnHeader("Manifold Pressure Derivative (kPa)");
  assert.equal(derivative.suggestedKey, null);
  assert.equal(derivative.autoAssignable, false);

  const targetLambda = resolveColumnHeader("Target Lambda (λ)");
  assert.equal(targetLambda.status, "unsupported");
  assert.equal(targetLambda.suggestedKey, null);
});

test("el mapeo automático requiere una sola coincidencia exacta por canal", () => {
  const result = suggestColumnMappings([
    "Vehicle Speed (km/h)",
    "Vehcile Speed (kmh)",
    "Road Speed (km/h)",
    "Logger Channel 8 (kPa)",
  ]);

  // Dos encabezados exactos significan que no hay una única columna para velocidad.
  assert.equal(Object.hasOwn(result.assignments, "speed_kmh"), false);
  assert.equal(result.resolutions.find(item => item.header.startsWith("Vehcile")).autoAssignable, false);
  assert.ok(result.unmatchedHeaders.includes("Logger Channel 8 (kPa)"));
});

test("un encabezado de boost genérico conserva la ambigüedad actual/objetivo", () => {
  const result = resolveColumnHeader("Boost Pressure (kPa)");
  assert.equal(result.status, "ambiguous");
  assert.equal(result.suggestedKey, null);
  assert.equal(result.autoAssignable, false);
  assert.deepEqual(result.candidates.map(candidate => candidate.key).sort(),
    ["boost_actual", "boost_target"]);
});


test("admite un log ECU con tiempo y sin RPM sin inventar el canal faltante", () => {
  const parsed = parseCsvText(
    "Elapsed Time (ms),Throttle Position (%)\n0,5\n100,12\n200,30\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "missing-rpm",
    name: "ECU sin canal RPM",
    sourceDomain: "ecu",
    channelMapping: { time_s: "Elapsed Time (ms)", throttle_pct: "Throttle Position (%)" },
    units: { throttle_pct: "%" },
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  const quality = assessRunDataQuality(run);
  assert.equal(run.samples[1].time_s, 0.1);
  assert.equal(Object.hasOwn(run.samples[1].channels, "rpm"), false);
  assert.equal(run.units.time_s, "s");
  assert.equal(quality.timestamp.axis, "time_s");
  assert.equal(quality.timestamp.available, true);
  assert.ok(run.warnings.some(warning => /no incluye RPM/i.test(warning)));
});

test("admite una curva de dinamómetro RPM vs torque sin eje temporal", () => {
  const parsed = parseCsvText(
    "Engine RPM,Wheel Torque (Nm)\n2000,180\n3000,210\n4000,195\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "dyno-no-time",
    name: "Curva dyno sin tiempo",
    sourceDomain: "dyno",
    measurementBasis: "wheel",
    channelMapping: { rpm: "Engine RPM", torque_nm: "Wheel Torque (Nm)" },
    units: { torque_nm: "Nm" },
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  const quality = assessRunDataQuality(run);
  assert.equal(run.samples[0].time_s, null);
  assert.equal(run.samples[1].channels.rpm, 3000);
  assert.equal(quality.timestamp.available, false);
  assert.equal(quality.timestamp.axis, "rpm");
  assert.equal(quality.timestamp.missingCount, 0);
  assert.equal(quality.timestamp.positiveIntervalMedianSeconds, null);
  assert.equal(run.warnings.some(warning => /no incluye eje temporal/i.test(warning)), true);
  assert.equal(quality.warnings.some(warning => /no tienen un tiempo numérico/i.test(warning)), false);
});

test("requiere al menos un eje y no admite torque/potencia dyno sin RPM", () => {
  const parsed = parseCsvText(
    "Throttle Position (%),Coolant Temperature (C)\n10,85\n20,90\n",
  );
  assert.throws(() => mapCsvToRun(parsed, {
    id: "no-axis",
    name: "CSV sin eje",
    sourceDomain: "ecu",
    channelMapping: { throttle_pct: "Throttle Position (%)", coolant_temp_c: "Coolant Temperature (C)" },
    units: { throttle_pct: "%", coolant_temp_c: "C" },
    importedAt: "2026-11-03T00:00:00.000Z",
  }), error => error.code === "CSV_AXIS_REQUIRED");

  const dyno = parseCsvText("Time (s),Wheel Torque (Nm)\n0,180\n0.1,195\n");
  assert.throws(() => mapCsvToRun(dyno, {
    id: "dyno-no-rpm",
    name: "Dyno sin RPM",
    sourceDomain: "dyno",
    measurementBasis: "wheel",
    channelMapping: { time_s: "Time (s)", torque_nm: "Wheel Torque (Nm)" },
    units: { torque_nm: "Nm" },
    importedAt: "2026-11-03T00:00:00.000Z",
  }), error => error.code === "CSV_DYNO_RPM_REQUIRED");
});

test("calcula frecuencia observada y jitter robusto por canal sin afirmar frecuencia configurada", () => {
  const parsed = parseCsvText(
    "Elapsed Time (s),Engine RPM,Throttle Position (%)\n0,1000,5\n0.1,1100,10\n0.2,1200,15\n0.4,1400,20\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "sampling-profile",
    name: "Perfil de muestreo sintético",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (s)",
      rpm: "Engine RPM",
      throttle_pct: "Throttle Position (%)",
    },
    units: { throttle_pct: "%" },
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  const quality = assessRunDataQuality(run);
  const rpm = quality.channels.find(channel => channel.key === "rpm");
  assert.equal(rpm.sampling.observedAdjacentIntervalCount, 3);
  assert.equal(rpm.sampling.medianIntervalSeconds, 0.1);
  assert.equal(rpm.sampling.medianObservedRateHz, 10);
  assert.equal(rpm.sampling.maximumAdjacentIntervalSeconds, 0.2);
  assert.equal(rpm.sampling.relativeJitterPct, 0);
});


test("el perfil numérico produce pistas débiles y nunca asigna una columna desconocida", () => {
  const profile = profileColumnValues(["1000", "1800", "2600", "3400"]);
  assert.equal(profile.numericCount, 4);
  assert.equal(profile.min, 1000);
  assert.equal(profile.max, 3400);
  assert.ok(profile.valueCandidates.some(candidate => candidate.key === "rpm"));
  assert.ok(profile.valueCandidates.some(candidate => candidate.key === "power_kw"));

  const suggestions = suggestColumnMappings(["Analog Input 7"], {
    rows: [["1000"], ["1800"], ["2600"], ["3400"]],
  });
  const result = suggestions.resolutions[0];
  assert.equal(result.status, "review_values_only");
  assert.equal(result.suggestedKey, null);
  assert.equal(result.autoAssignable, false);
  assert.ok(result.candidates.some(candidate => candidate.key === "rpm"));
  assert.equal(Object.keys(suggestions.assignments).length, 0);
});

test("el perfil numérico respeta el separador decimal declarado y no interpreta texto como dato", () => {
  const profile = profileColumnValues(["0,5", "0,8", "1,0", "—", "signal error"], {
    decimalSeparator: ",",
  });
  assert.equal(profile.numericCount, 3);
  assert.equal(profile.missingOrNonNumericCount, 2);
  assert.equal(profile.min, 0.5);
  assert.equal(profile.max, 1);
  assert.ok(profile.valueCandidates.some(candidate => candidate.key === "lambda"));
});


test("una alerta de plausibilidad señala el rango sin corregir ni descartar la muestra", () => {
  const parsed = parseCsvText(
    "Elapsed Time (s),Engine RPM,Throttle Position (%)\n0,1000,50\n0.1,1100,110\n0.2,1200,60\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "plausibility-review",
    name: "Canal fuera de rango sintético",
    sourceDomain: "ecu",
    channelMapping: {
      time_s: "Elapsed Time (s)",
      rpm: "Engine RPM",
      throttle_pct: "Throttle Position (%)",
    },
    units: { throttle_pct: "%" },
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  const quality = assessRunDataQuality(run);
  const throttle = quality.channels.find(channel => channel.key === "throttle_pct");
  assert.equal(run.samples[1].channels.throttle_pct, 110);
  assert.equal(throttle.plausibility.status, "outside_broad_envelope");
  assert.equal(throttle.plausibility.outsideCount, 1);
  assert.ok(quality.warnings.some(warning => /rango amplio de plausibilidad/i.test(warning)));
});


test("no preselecciona dos encabezados que coinciden exactamente con el mismo canal", () => {
  const result = suggestColumnMappings(["Engine RPM", "Engine speed"]);
  assert.equal(Object.hasOwn(result.assignments, "rpm"), false);
  for (const resolution of result.resolutions) {
    assert.equal(resolution.status, "ambiguous");
    assert.equal(resolution.suggestedKey, null);
    assert.equal(resolution.autoAssignable, false);
  }
  assert.deepEqual(result.unmatchedHeaders, ["Engine RPM", "Engine speed"]);
});

test("reconoce Engine/Eng RPM como motor, pero deja Wheel RPM fuera del canal de motor", () => {
  for (const header of ["Engine RPM", "Eng RPM", "Motor RPM"]) {
    const result = resolveColumnHeader(header);
    assert.equal(result.status, "exact", header);
    assert.equal(result.suggestedKey, "rpm", header);
    assert.equal(result.autoAssignable, true, header);
    assert.equal(result.unit.dimension, "rotational_speed", header);
  }
  const wheelWithUnit = resolveColumnHeader("Wheel RPM (rpm)");
  assert.equal(wheelWithUnit.status, "unsupported");
  assert.equal(wheelWithUnit.suggestedKey, null);
  assert.equal(wheelWithUnit.autoAssignable, false);
});

test("un perfil de 3.000 celdas informa solo las 1.500 observaciones realmente examinadas", () => {
  const values = Array.from({ length: 3000 }, (_, index) => String(index + 1000));
  const profile = profileColumnValues(values);
  assert.equal(profile.sampleCount, 1500);
  assert.equal(profile.numericCount, 1500);
  assert.equal(profile.missingOrNonNumericCount, 0);
});


test("los alias imperiales comunes de torque se reconocen sin perder dimensión", () => {
  for (const spelling of ["ft-lb", "ftlb", "lbft", "lbfft", "lb-ft"]) {
    const result = resolveUnitForChannel("torque_nm", spelling);
    assert.equal(result.status, "matched", spelling);
    assert.equal(result.dimension, "torque", spelling);
    assert.ok(Math.abs(result.factor - 1.3558179483314004) < 1e-12, spelling);
  }
  assert.equal(resolveUnitForChannel("torque_nm", "nm").status, "dimension_mismatch");
});


test("no confunde velocidad de rueda/rodillo con velocidad del vehículo", () => {
  for (const header of ["Wheel Speed (km/h)", "Front Wheel Speed (kmh)", "Roller Speed (km/h)"]) {
    const result = resolveColumnHeader(header);
    assert.equal(result.status, "unsupported", header);
    assert.equal(result.suggestedKey, null, header);
    assert.equal(result.autoAssignable, false, header);
  }
});


test("el jitter se informa con MAD de intervalos por canal", () => {
  const parsed = parseCsvText(
    "Elapsed Time (s),Engine RPM\n0,1000\n0.1,1100\n0.3,1200\n0.6,1300\n",
  );
  const run = mapCsvToRun(parsed, {
    id: "irregular-sampling",
    name: "Muestreo irregular sintético",
    sourceDomain: "ecu",
    channelMapping: { time_s: "Elapsed Time (s)", rpm: "Engine RPM" },
    units: {},
    importedAt: "2026-11-03T00:00:00.000Z",
  });
  const quality = assessRunDataQuality(run);
  const rpm = quality.channels.find(channel => channel.key === "rpm");
  assert.equal(rpm.sampling.medianIntervalSeconds, 0.2);
  assert.equal(rpm.sampling.medianAbsoluteDeviationSeconds, 0.1);
  assert.equal(rpm.sampling.relativeJitterPct, 50);
});
