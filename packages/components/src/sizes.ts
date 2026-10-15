import type { ConnectionPort } from '@scada3d/core';
import type { ChoiceParameterSpec } from './geometry';

/**
 * Pipe sizes offered by the catalog (ADR-0009). `bore` is the nominal bore in metres, used as the
 * port `nominalSize`; `outerDiameter` is what is drawn. DN150 keeps the original 168 mm so
 * existing scenes look identical; the others follow the steel-pipe series.
 */
export const pipeSizes = {
  DN50: { bore: 0.05, outerDiameter: 0.0603 },
  DN80: { bore: 0.08, outerDiameter: 0.0889 },
  DN100: { bore: 0.1, outerDiameter: 0.1143 },
  DN150: { bore: 0.15, outerDiameter: 0.168 },
  DN200: { bore: 0.2, outerDiameter: 0.2191 },
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
