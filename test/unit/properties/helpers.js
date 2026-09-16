// Shared generators for the property tests.
import * as fc from 'fast-check';

export { fc };

export const RUNS = { numRuns: 200 };

// Reasonable finite numbers (no NaN/Infinity — those never come out of an <input type=number>).
// (-0 is normalised to 0: it is the same number to a person, but Object.is tells them apart.)
export const num = (min = -1e6, max = 1e6) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true }).map((x) => (x === 0 ? 0 : x));
export const int = (min = 0, max = 1000) => fc.integer({ min, max });
export const nullable = (arb) => fc.option(arb, { nil: null });

// True if a value (deeply) contains NaN or Infinity — results must never.
export function hasBadNumber(value, seen = new Set()) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((v) => typeof v !== 'function' && hasBadNumber(v, seen));
}
