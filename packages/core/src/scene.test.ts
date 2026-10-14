import { describe, expect, it } from 'vitest';
import { createEmptyScene, portsCompatible, type ConnectionPort } from './index';

const fluid = (nominalSize?: number): ConnectionPort => ({
  id: 'out',
  kind: 'fluid',
  position: [0, 0, 0],
  direction: [1, 0, 0],
  nominalSize,
});

describe('createEmptyScene', () => {
  it('starts with no components or connections', () => {
    expect(createEmptyScene()).toEqual({ schemaVersion: 2, units: 'm', components: [], connections: [] });
  });
});

describe('portsCompatible', () => {
  it('accepts the same domain when bores match', () => {
    expect(portsCompatible(fluid(0.15), fluid(0.15))).toBe(true);
  });

  it('accepts an unspecified bore', () => {
    expect(portsCompatible(fluid(0.15), fluid())).toBe(true);
  });

  it('rejects a different domain', () => {
    expect(portsCompatible(fluid(0.15), { ...fluid(0.15), kind: 'signal' })).toBe(false);
  });

  it('rejects bores outside the tolerance', () => {
    expect(portsCompatible(fluid(0.15), fluid(0.2))).toBe(false);
  });
});
