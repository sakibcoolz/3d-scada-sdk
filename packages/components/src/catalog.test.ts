import { describe, expect, it } from 'vitest';
import { validateScene, type ComponentKind } from '@scada3d/core';
import { componentCatalog } from './index';

const resolvePorts = (kind: ComponentKind) => componentCatalog[kind].ports;

const component = (id: string, kind: ComponentKind) => ({
  id,
  kind,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  properties: {},
});

describe('componentCatalog with validateScene', () => {
  it('validates the MVP tank -> valve -> pipe -> tee chain', () => {
    const scene = {
      version: 1,
      components: [
        component('tank', 'tank'),
        component('valve', 'valve'),
        component('pipe', 'pipe'),
        component('tee', 'tee'),
      ],
      connections: [
        { id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } },
        { id: 'e2', from: { instanceId: 'valve', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } },
        { id: 'e3', from: { instanceId: 'pipe', portId: 'out' }, to: { instanceId: 'tee', portId: 'left' } },
      ],
    };
    expect(validateScene(scene, { resolvePorts }).ok).toBe(true);
  });

  it('declares unique port ids for every component kind', () => {
    for (const definition of Object.values(componentCatalog)) {
      const ids = definition.ports.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
