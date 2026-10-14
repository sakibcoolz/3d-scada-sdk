import { describe, expect, it } from 'vitest';
import { componentKinds, snapComponent, validateScene, type ComponentInstance, type ComponentKind, type ScadaScene } from '@scada3d/core';
import { componentCatalog, pipeOuterRadius, type GeometryPart } from './index';

const resolvePorts = (kind: ComponentKind) => componentCatalog[kind].ports;

const component = (id: string, kind: ComponentKind) => ({
  id,
  kind,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  properties: {},
});

const definitions = Object.values(componentCatalog);
const axisIndex = (direction: readonly number[]) => direction.findIndex((n) => n !== 0);

describe('componentCatalog with validateScene', () => {
  it('validates the MVP tank -> valve -> pipe -> elbow -> tee chain', () => {
    const scene = {
      version: 1,
      components: [
        component('tank', 'tank'),
        component('valve', 'valve'),
        component('pipe', 'pipe'),
        component('elbow', 'elbow'),
        component('tee', 'tee'),
      ],
      connections: [
        { id: 'e1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } },
        { id: 'e2', from: { instanceId: 'valve', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } },
        { id: 'e3', from: { instanceId: 'pipe', portId: 'out' }, to: { instanceId: 'elbow', portId: 'in' } },
        { id: 'e4', from: { instanceId: 'elbow', portId: 'out' }, to: { instanceId: 'tee', portId: 'left' } },
      ],
    };
    expect(validateScene(scene, { resolvePorts })).toEqual(expect.objectContaining({ ok: true }));
  });
});

describe('componentCatalog with snapComponent', () => {
  it('snaps an elbow onto the tee branch and the result validates', () => {
    const tee: ComponentInstance = { id: 'tee', kind: 'tee', position: [0, 0, 0], rotation: [0, 0, 0], properties: {} };
    // Elbow dropped near the branch with its "in" port roughly facing down.
    const elbow: ComponentInstance = { id: 'elbow', kind: 'elbow', position: [0.25, 1.4, 0.05], rotation: [0, 0, Math.PI / 2 + 0.2], properties: {} };
    const scene: ScadaScene = { version: 1, components: [tee], connections: [] };
    const result = snapComponent(scene, elbow, { resolvePorts });
    if (!result.ok) throw new Error('expected a snap');
    expect(result.connection).toEqual({ from: { instanceId: 'elbow', portId: 'in' }, to: { instanceId: 'tee', portId: 'branch' } });
    const snapped = { ...elbow, position: result.position, rotation: result.rotation };
    const validated = validateScene({ ...scene, components: [tee, snapped], connections: [{ id: 'e1', ...result.connection }] }, { resolvePorts });
    expect(validated.ok).toBe(true);
  });
});

describe('componentCatalog definitions', () => {
  it('defines every component kind under its own key', () => {
    expect(Object.keys(componentCatalog).sort()).toEqual([...componentKinds].sort());
    for (const [key, definition] of Object.entries(componentCatalog)) expect(definition.kind).toBe(key);
  });

  it('includes the MVP equipment set', () => {
    for (const kind of ['tank', 'valve', 'pipe', 'elbow', 'tee', 'pump', 'motor', 'sensor'] as const) {
      expect(componentCatalog[kind]).toBeDefined();
    }
  });

  it.each(definitions)('$kind declares unique port ids', ({ ports }) => {
    const ids = ports.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(definitions)('$kind has non-empty bounds that match defaultSize', ({ bounds, defaultSize }) => {
    for (let i = 0; i < 3; i++) {
      expect(bounds.max[i]).toBeGreaterThan(bounds.min[i]);
      expect(bounds.max[i] - bounds.min[i]).toBeCloseTo(defaultSize[i], 10);
    }
  });

  it.each(definitions)('$kind has at least one shell part', ({ parts }) => {
    expect(parts.some((p) => p.role === 'shell')).toBe(true);
  });

  it.each(definitions.flatMap((d) => d.ports.map((p) => [`${d.kind}.${p.id}`, d, p] as const)))(
    '%s points outward along one axis from the matching bounds face',
    (_, definition, port) => {
      const axis = axisIndex(port.direction);
      expect(port.direction.filter((n) => n !== 0)).toHaveLength(1);
      expect(Math.abs(port.direction[axis])).toBe(1);
      const face = port.direction[axis] > 0 ? definition.bounds.max[axis] : definition.bounds.min[axis];
      expect(port.position[axis]).toBeCloseTo(face, 10);
      for (let i = 0; i < 3; i++) {
        expect(port.position[i]).toBeGreaterThanOrEqual(definition.bounds.min[i] - 1e-9);
        expect(port.position[i]).toBeLessThanOrEqual(definition.bounds.max[i] + 1e-9);
      }
    },
  );

  it('uses one nominal bore for every fluid port, matched by the pipe radius', () => {
    const fluid = definitions.flatMap((d) => d.ports).filter((p) => p.kind === 'fluid');
    expect(fluid.length).toBeGreaterThan(0);
    for (const port of fluid) expect(port.nominalSize).toBe(0.15);
    expect(pipeOuterRadius).toBeGreaterThan(0.15 / 2);
  });

  it('gives the tee three genuine fluid ports', () => {
    expect(componentCatalog.tee.ports.map((p) => [p.id, p.kind])).toEqual([
      ['left', 'fluid'],
      ['right', 'fluid'],
      ['branch', 'fluid'],
    ]);
  });

  it('turns the elbow through 90 degrees', () => {
    const [a, b] = componentCatalog.elbow.ports;
    const dot = a.direction.reduce((sum, n, i) => sum + n * b.direction[i], 0);
    expect(componentCatalog.elbow.ports).toHaveLength(2);
    expect(dot).toBe(0);
  });

  it('gives the tank a liquid part inside its shell', () => {
    const liquid = componentCatalog.tank.parts.filter((p): p is Extract<GeometryPart, { shape: 'cylinder' }> => p.role === 'liquid');
    expect(liquid).toHaveLength(1);
    const { bounds } = componentCatalog.tank;
    expect(liquid[0].axis).toBe('y');
    expect(liquid[0].center[1] - liquid[0].length / 2).toBeGreaterThan(bounds.min[1]);
    expect(liquid[0].center[1] + liquid[0].length / 2).toBeLessThan(bounds.max[1]);
  });

  it('gives the valve a ball and a handle', () => {
    const roles = componentCatalog.valve.parts.map((p) => p.role);
    expect(roles).toContain('valve-ball');
    expect(roles).toContain('valve-handle');
  });
});
