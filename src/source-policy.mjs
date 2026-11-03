/**
 * Políticas de interpretación por origen de datos.
 *
 * ECU/logger y dinamómetro no son fuentes intercambiables. Este módulo define
 * límites de lectura y comparabilidad; no intenta diagnosticar ni inferir
 * magnitudes ausentes. Se mantiene independiente de la interfaz.
 */
export const SOURCE_DOMAIN = Object.freeze({
  ECU: "ecu",
  DYNO: "dyno",
  UNKNOWN: "unknown",
});

const DOMAIN_POLICIES = Object.freeze({
  ecu: Object.freeze({
    id: "ecu",
    title: "ECU y logger",
    purpose: "Interpretar señales registradas por la ECU, logger o sensores externos identificados.",
    evidence: Object.freeze([
      "Conservar etiqueta original, unidad, frecuencia, faltantes y procedencia de cada canal.",
      "RPM, velocidad registrada, presión, lambda/AFR, mariposa, avance, temperaturas y estados solo significan lo que declare la fuente.",
      "Torque o potencia solo se consideran si el archivo los trae o si existe un cálculo explícito con entradas, fórmula, unidades y estado derivados.",
    ]),
    notAllowed: Object.freeze([
      "No reemplazar una señal ausente de ECU por una curva de dinamómetro.",
      "No inferir torque, potencia, marcha, velocidad de carretera, detonación ni causa mecánica sin entradas y método verificados.",
      "No confundir una consigna solicitada con la lectura medida.",
    ]),
  }),
  dyno: Object.freeze({
    id: "dyno",
    title: "Banco de potencia / rodillos",
    purpose: "Analizar curvas y canales exportados por el software del banco, preservando qué midió o calculó el equipo.",
    evidence: Object.freeze([
      "Verificar exportación, software/versión, unidad, eje X, base física (rodillo, rueda, cubo o motor) y tipo de resultado.",
      "Mostrar torque y potencia contra RPM con ejes verticales independientes cuando ambos canales estén presentes.",
      "Conservar por separado resultados medidos, corregidos por el software del banco, derivados y estimados.",
      "Tratar velocidad del rodillo y velocidad registrada del vehículo como canales distintos salvo documentación explícita.",
    ]),
    notAllowed: Object.freeze([
      "No inventar torque o potencia si la exportación no los contiene ni sustituirlos automáticamente por una estimación de ECU.",
      "No mezclar potencia/torque de rueda, cubo, rodillo y motor ni resultados con métodos de corrección distintos sin compatibilidad declarada y verificada.",
      "No aplicar conversiones de unidades, factores de corrección atmosférica ni pérdidas de transmisión en silencio.",
      "No declarar compatible un formato propietario solo porque parece un CSV válido.",
    ]),
  }),
  unknown: Object.freeze({
    id: "unknown",
    title: "Origen por verificar",
    purpose: "Inspeccionar el archivo sin atribuirle automáticamente una semántica de ECU o de banco.",
    evidence: Object.freeze([
      "Verificar de dónde sale cada canal, cómo se obtuvo y en qué unidad está expresado.",
      "Mantener valores, orden de muestras y datos ausentes tal como se recibieron.",
    ]),
    notAllowed: Object.freeze([
      "No asumir que un nombre de columna garantiza que la magnitud fue medida.",
      "No tratar valores desconocidos como unidades estándar ni mezclar el archivo con ECU/banco sin clasificarlo.",
    ]),
  }),
});

export function classifyRunSource(run) {
  const declared = String(run?.sourceDomain ?? run?.analysisContext?.sourceDomain ?? "").trim().toLowerCase();
  if (declared === SOURCE_DOMAIN.ECU || declared === SOURCE_DOMAIN.DYNO) return declared;

  if (run?.dynoMetadata || String(run?.sourceType ?? "").toLowerCase().includes("dinam")) {
    return SOURCE_DOMAIN.DYNO;
  }
  const sourceType = String(run?.sourceType ?? "").toLowerCase();
  if (/\becu\b|logger|vcds|can log/.test(sourceType)) return SOURCE_DOMAIN.ECU;
  return SOURCE_DOMAIN.UNKNOWN;
}

export function getSourceDomainPolicy(domain) {
  return DOMAIN_POLICIES[domain] ?? DOMAIN_POLICIES.unknown;
}

/**
 * Evalúa si un grupo puede dibujarse como comparación numérica homogénea.
 * La decisión no sustituye las comprobaciones de unidad, base física,
 * corrección, sincronización y cobertura que requieren los analizadores.
 */
export function assessSourceSet(runs) {
  const records = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const domains = records.map(classifyRunSource);
  const known = [...new Set(domains.filter(domain => domain !== SOURCE_DOMAIN.UNKNOWN))];

  if (records.length < 2) {
    return {
      status: "single-source",
      allowed: true,
      domains,
      reasons: [],
      message: "Se muestra una sola corrida; todavía no se ha establecido comparabilidad.",
    };
  }

  if (known.length > 1) {
    return {
      status: "cross-domain",
      allowed: false,
      domains,
      reasons: [
        "El grupo mezcla registros de ECU/logger y resultados de dinamómetro.",
        "Son evidencias complementarias, no mediciones automáticamente equivalentes.",
        "Una comparación conjunta requiere asociación explícita del mismo ensayo, sincronización comprobada, canal/unidad compatibles y base física documentada.",
      ],
      message: "Se mantienen separados ECU/logger y dinamómetro. No se calcularon deltas, cruces ni una superposición numérica entre estas fuentes.",
    };
  }

  if (known.length === 1 && domains.includes(SOURCE_DOMAIN.UNKNOWN)) {
    return {
      status: "source-unverified",
      allowed: false,
      domains,
      reasons: [
        "Al menos una corrida no tiene el origen clasificado.",
        "Verificá su procedencia antes de combinarla con el grupo identificado.",
      ],
      message: "No se mezclan curvas hasta identificar el origen de cada corrida.",
    };
  }

  if (known.length === 1) {
    return {
      status: "same-domain",
      allowed: true,
      domains,
      reasons: [],
      message: known[0] === SOURCE_DOMAIN.DYNO
        ? "Misma familia de fuente: aun así deben coincidir magnitud, unidad, base física, tipo de dato y corrección."
        : "Misma familia de fuente: aun así deben coincidir canal, unidad, eje y contexto del ensayo.",
    };
  }

  return {
    status: "unclassified",
    allowed: true,
    domains,
    reasons: ["El origen de los registros no está clasificado; la comparación solo puede ser exploratoria."],
    message: "Origen no verificado: no interpretes similitudes visuales como equivalencia física.",
  };
}

export function getModuleSourcePolicy(moduleId) {
  if (moduleId === "ecu") return DOMAIN_POLICIES.ecu;
  if (moduleId === "dyno") return DOMAIN_POLICIES.dyno;
  return Object.freeze({
    id: "comparison",
    title: "Comparación por evidencia",
    purpose: "Reunir evidencias relacionadas sin convertir fuentes diferentes en una misma magnitud.",
    evidence: Object.freeze([
      "Primero comparar ECU con ECU y banco con banco, con unidades, cobertura y contexto compatibles.",
      "Relacionar ECU y banco dentro de un mismo expediente cuando se pueda demostrar que pertenecen al mismo ensayo.",
      "La sincronización entre archivos, la corrección de banco y la base física deben quedar documentadas; el tiempo relativo de dos archivos no prueba sincronía.",
    ]),
    notAllowed: Object.freeze([
      "No calcular automáticamente diferencias de torque/potencia entre una estimación ECU y una medición de banco.",
      "No convertir asociación temporal en causalidad ni usar una curva para rellenar señales ausentes de la otra.",
    ]),
  });
}
