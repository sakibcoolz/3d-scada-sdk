import type { ConnectionPort } from '@scada3d/core';
import type { ChoiceParameterSpec } from './geometry.js';
import { asme } from './asme.js';

/**
 * Pipe sizes offered by the catalog (ADR-0009). `bore` is the nominal size in metres, used as the
 * port `nominalSize` for matching; `outerDiameter` is what is drawn: the ASME B36.10M outside
 * diameter (ADR-0014; DN150 is 168.3 mm, previously drawn at 168 mm).
 */
export const pipeSizes = {
  DN50: { bore: 0.05, outerDiameter: asme.DN50.outsideDiameter },
  DN80: { bore: 0.08, outerDiameter: asme.DN80.outsideDiameter },
  DN100: { bore: 0.1, outerDiameter: asme.DN100.outsideDiameter },
  DN150: { bore: 0.15, outerDiameter: asme.DN150.outsideDiameter },
  DN200: { bore: 0.2, outerDiameter: asme.DN200.outsideDiameter },
} as const;

export type PipeSize = keyof typeof pipeSizes;

export const DEFAULT_SIZE: PipeSize = 'DN150';

export const isPipeSize = (value: unknown): value is PipeSize => typeof value === 'string' && Object.hasOwn(pipeSizes, value);

/** Outer radius drawn for a size, metres. */
export function outerRadiusFor(size: PipeSize): number {
  return pipeSizes[size].outerDiameter / 2;
}

/** The size whose bore matches a port's `nominalSize`, if any. */
export function sizeOfPort(port: ConnectionPort): PipeSize | undefined {
  return (Object.keys(pipeSizes) as PipeSize[]).find((s) => port.nominalSize !== undefined && Math.abs(pipeSizes[s].bore - port.nominalSize) < 0.0001);
}

/** The size choice shared by every sized kind. */
export const SIZE_PARAMETER: ChoiceParameterSpec = { label: 'Size', choices: Object.keys(pipeSizes), default: DEFAULT_SIZE };
