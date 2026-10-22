import { isBuiltInKind, type ComponentInstance, type ComponentType, type ConnectionPort } from '@sakibcoolz/core';
import { definitionFor } from './parameters.js';
import { pipeSizes, type PipeSize } from './sizes.js';

// Port positions of the fittings before ASME dimensions (ADR-0014) and of the 1.2 m valve before
// B16.10 (ADR-0016), used only to recognise joints
// in older files so `upgradeDimensions` can re-seat them. Everything else is unchanged.
const port = (id: string, position: [number, number, number], direction: [number, number, number], size: PipeSize): ConnectionPort => ({ id, kind: 'fluid', position, direction, nominalSize: pipeSizes[size].bore });
const sizeOf = (p: ComponentInstance['properties'], name = 'size'): PipeSize => (typeof p[name] === 'string' && Object.hasOwn(pipeSizes, p[name] as string) ? (p[name] as PipeSize) : 'DN150');

function legacyPorts(type: ComponentType, properties: ComponentInstance['properties'] = {}): readonly ConnectionPort[] | undefined {
  // Only built-in kinds changed size; registered types have no older generation.
  if (!isBuiltInKind(type)) return undefined;
  switch (type) {
    case 'elbow': {
      const s = sizeOf(properties);
      return [port('in', [-0.3, 0, 0], [-1, 0, 0], s), port('out', [0, 0.3, 0], [0, 1, 0], s)];
    }
    case 'tee': {
      const s = sizeOf(properties);
      return [port('left', [-1, 0, 0], [-1, 0, 0], s), port('right', [1, 0, 0], [1, 0, 0], s), port('branch', [0, 1, 0], [0, 1, 0], s)];
    }
    case 'reducer':
      return [port('in', [-0.15, 0, 0], [-1, 0, 0], sizeOf(properties)), port('out', [0.15, 0, 0], [1, 0, 0], sizeOf(properties, 'outletSize') === sizeOf(properties) ? 'DN100' : sizeOf(properties, 'outletSize'))];
    case 'valve':
      return [port('in', [-0.6, 0, 0], [-1, 0, 0], sizeOf(properties)), port('out', [0.6, 0, 0], [1, 0, 0], sizeOf(properties))];
    default:
      return definitionFor(type, properties).ports;
  }
}

/** Pass with `catalogResolvers` to `upgradeDimensions` to bring older scene files up to ASME fitting and valve sizes. */
export const legacyCatalogResolvers = { resolveLegacyPorts: legacyPorts };
