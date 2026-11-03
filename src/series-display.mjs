/**
 * Decimación exclusivamente visual mediante envolvente min/max.
 *
 * Conserva referencias a muestras originales, extremos y separadores de huecos.
 * Nunca se usa para cálculos, exportación ni remuestreo de la señal.
 */
export const SERIES_DISPLAY_DECIMATION_VERSION = "datalog-series-display/1";
export const DEFAULT_MAX_DISPLAY_POINTS = 1200;

function chooseSegmentEntries(entries, budget, getX, getY) {
  const length = entries.length;
  if (length <= budget) return entries.map(entry => entry.point);
  if (budget <= 2) return [entries[0].point, entries.at(-1).point];

  const selected = new Set([0, length - 1]);
  const addExtremes = (start, end) => {
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minYIndex = -1;
    let maxYIndex = -1;
    let minXIndex = -1;
    let maxXIndex = -1;
    for (let index = start; index < end; index += 1) {
      const point = entries[index].point;
      const x = getX(point);
      const y = getY(point);
      if (y < minY) { minY = y; minYIndex = index; }
      if (y > maxY) { maxY = y; maxYIndex = index; }
      if (x < minX) { minX = x; minXIndex = index; }
      if (x > maxX) { maxX = x; maxXIndex = index; }
    }
    for (const index of [minYIndex, maxYIndex, minXIndex, maxXIndex]) {
      if (index >= 0) selected.add(index);
    }
  };

  if (budget < 6) {
    addExtremes(1, length - 1);
  } else {
    const interiorLength = length - 2;
    const bucketCount = Math.max(1, Math.floor((budget - 2) / 4));
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = 1 + Math.floor(bucket * interiorLength / bucketCount);
      const end = 1 + Math.floor((bucket + 1) * interiorLength / bucketCount);
      if (end > start) addExtremes(start, end);
    }
  }

  return [...selected].sort((a, b) => a - b).map(index => entries[index].point);
}

/**
 * Reduce a large ordered series for drawing only.
 * getX/getY define the plotted axes; non-finite points split the path.
 * The point limit is soft when preserving every gap requires more markers.
 */
export function decimateSeriesForDisplay(points, {
  maxPoints = DEFAULT_MAX_DISPLAY_POINTS,
  getX = point => point?.x,
  getY = point => point?.y,
} = {}) {
  if (!Array.isArray(points)) {
    throw new TypeError("La serie debe recibirse como un array.");
  }
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 4) {
    throw new RangeError("El límite de puntos debe ser un entero igual o mayor que 4.");
  }
  if (typeof getX !== "function" || typeof getY !== "function") {
    throw new TypeError("Los selectores de los ejes deben ser funciones.");
  }
  if (points.length <= maxPoints) return points.slice();
  if (points.length === 0) return [];

  const segments = [];
  let current = null;
  let pendingGap = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const valid = Number.isFinite(getX(point)) && Number.isFinite(getY(point));
    if (valid) {
      if (!current) {
        current = {
          entries: [],
          gapBefore: segments.length ? pendingGap : null,
        };
        segments.push(current);
        pendingGap = null;
      }
      current.entries.push({ index, point });
    } else {
      current = null;
      if (segments.length && pendingGap === null) pendingGap = point;
    }
  }

  if (segments.length === 0) return [points[0]];

  const basePointCount = segments.reduce((total, segment) =>
    total + Math.min(2, segment.entries.length), 0);
  const gapMarkerCount = segments.length - 1;
  const mandatoryPointCount = basePointCount + gapMarkerCount;
  const effectiveLimit = Math.max(maxPoints, mandatoryPointCount);
  const extraBudget = effectiveLimit - mandatoryPointCount;
  const capacities = segments.map(segment =>
    Math.max(0, segment.entries.length - Math.min(2, segment.entries.length))
  );
  const totalCapacity = capacities.reduce((total, capacity) => total + capacity, 0);
  const allocations = capacities.map(capacity => {
    const quota = totalCapacity ? extraBudget * capacity / totalCapacity : 0;
    const extra = Math.min(capacity, Math.floor(quota));
    return { extra, capacity, remainder: quota - Math.floor(quota) };
  });
  let remaining = extraBudget - allocations.reduce((total, item) => total + item.extra, 0);
  const allocationOrder = allocations
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of allocationOrder) {
    if (remaining <= 0) break;
    if (item.extra >= item.capacity) continue;
    allocations[item.index].extra += 1;
    remaining -= 1;
  }

  const output = [];
  segments.forEach((segment, index) => {
    if (index > 0) output.push(segment.gapBefore);
    const budget = Math.min(segment.entries.length,
      Math.min(2, segment.entries.length) + allocations[index].extra);
    output.push(...chooseSegmentEntries(segment.entries, budget, getX, getY));
  });
  return output;
}
