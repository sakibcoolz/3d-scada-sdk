import type { Quantity } from './scene.js';

/** Canonical unit per quantity. Displayed and resolved values always use these. */
export const canonicalUnits: Readonly<Record<Quantity, string>> = { percent: '%', temperature: '°C', boolean: '', flow: 'm³/s' };

type Conversion = (value: number) => number;
const same: Conversion = (v) => v;

const conversions: Record<Quantity, Record<string, Conversion>> = {
  percent: { '%': same },
  temperature: { '°C': same, degC: same, C: same, K: (v) => v - 273.15, '°F': (v) => ((v - 32) * 5) / 9, degF: (v) => ((v - 32) * 5) / 9 },
  boolean: {},
  flow: { 'm³/s': same, 'm3/s': same, 'm³/h': (v) => v / 3600, 'm3/h': (v) => v / 3600, 'L/s': (v) => v / 1000, 'l/s': (v) => v / 1000, 'L/min': (v) => v / 60000, 'l/min': (v) => v / 60000 },
};

/** True when `unit` (or no unit, meaning canonical) is accepted for `quantity`. */
export function isKnownUnit(quantity: Quantity, unit: string | undefined): boolean {
  // Own string keys only: host data is untrusted, and `in` on a non-string key can throw or match inherited names.
  return unit === undefined || (typeof unit === 'string' && Object.hasOwn(conversions[quantity], unit));
}

/** Converts a value in `unit` (default canonical) to the canonical unit, or undefined if the unit is not accepted. */
export function toCanonical(quantity: Quantity, value: number, unit?: string): number | undefined {
  if (unit === undefined) return value;
  if (!isKnownUnit(quantity, unit)) return undefined;
  return conversions[quantity][unit](value);
}
