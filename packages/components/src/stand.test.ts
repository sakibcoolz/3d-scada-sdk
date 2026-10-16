import { describe, expect, it } from 'vitest';
import { componentCatalog, definitionFor, validateProperties } from './index.js';

const legs = (standHeight?: number) => definitionFor('tank', standHeight === undefined ? {} : { standHeight }).parts.filter((p) => p.role === 'shell' && p.shape === 'cylinder' && p.axis === 'y' && p.radius === 0.05);

describe('vertical tank stand', () => {
  it('declares an adjustable stand height: none when absent, 0.8 m for new tanks', () => {
    expect(componentCatalog.tank.parameters?.standHeight).toEqual({ label: 'Stand height', unit: 'm', default: 0, min: 0, max: 3, step: 0.1, initial: 0.8, keepsBottom: true });
  });

  it('has no stand in files without the setting, so saved scenes look the same', () => {
    expect(definitionFor('tank', {})).toBe(componentCatalog.tank);
    expect(legs()).toEqual([]);
    expect(componentCatalog.tank.bounds.min[1]).toBe(-1.535);
  });

  it('stands on four legs reaching the floor the stand height below the tank bottom', () => {
    const def = definitionFor('tank', { standHeight: 0.8 });
    expect(legs(0.8)).toHaveLength(4);
    for (const leg of legs(0.8)) if (leg.shape === 'cylinder') expect(leg.center[1] - leg.length / 2).toBeCloseTo(-2.335, 9);
    expect(def.bounds.min[1]).toBeCloseTo(-2.335, 9);
    expect(def.parts.filter((p) => p.shape === 'box' && p.role === 'shell')).toHaveLength(4); // a foot under each leg
  });

  it('keeps the ports exactly where they were', () => {
    expect(definitionFor('tank', { standHeight: 2 }).ports).toEqual(componentCatalog.tank.ports);
  });

  it('limits the height to 0–3 m', () => {
    expect(validateProperties('tank', { standHeight: 3.5 })).toEqual([{ property: 'standHeight', message: 'must be between 0 and 3 m' }]);
    expect(validateProperties('tank', { standHeight: 1.2 })).toEqual([]);
  });
});
