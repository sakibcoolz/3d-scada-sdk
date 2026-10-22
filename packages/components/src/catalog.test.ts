import { describe, expect, it } from 'vitest';
import { componentKinds, quaternionFromEuler, rotateVector, snapComponent, validateScene, type ComponentInstance, type ComponentKind, type ScadaScene } from '@sakibcoolz/core';
import { componentCatalog, definitionFor, outerRadiusFor, pipeOuterRadius, sizeOfPort, type GeometryPart } from './index.js';

const resolvePorts = (type: ComponentKind) => componentCatalog[type].ports;

const component = (id: string, type: ComponentKind) => ({
  id,
  type,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
});

const definitions = Object.values(componentCatalog);
const axisIndex = (direction: readonly number[]) => direction.findIndex((n) => n !== 0);

describe('componentCatalog with validateScene', () => {
  it('validates the MVP tank -> valve -> pipe -> elbow -> tee chain', () => {
    const scene = {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
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
    const tee: ComponentInstance = { id: 'tee', type: 'tee', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} };
    // Elbow dropped near the branch with its "in" port roughly facing down, about 6 cm off.
    const rotation = quaternionFromEuler({ x: 0, y: 0, z: Math.PI / 2 + 0.2 });
    const [inPort] = componentCatalog.elbow.ports;
    const branch = componentCatalog.tee.ports.find((p) => p.id === 'branch')!.position;
    const offset = rotateVector({ x: inPort.position[0], y: inPort.position[1], z: inPort.position[2] }, rotation);
    const elbow: ComponentInstance = {
      id: 'elbow',
      type: 'elbow',
      position: { x: branch[0] + 0.04 - offset.x, y: branch[1] + 0.03 - offset.y, z: 0.03 - offset.z },
      rotation,
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
    };
    const scene: ScadaScene = { schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm', components: [tee], connections: [] };
    const result = snapComponent(scene, elbow, { resolvePorts });
    if (!result.ok) throw new Error('expected a snap');
    expect(result.connection).toEqual({ from: { instanceId: 'elbow', portId: 'in' }, to: { instanceId: 'tee', portId: 'branch' } });
    const snapped = { ...elbow, position: result.position, rotation: result.rotation };
    const validated = validateScene({ ...scene, components: [tee, snapped], connections: [{ id: 'e1', ...result.connection }] }, { resolvePorts });
    expect(validated.ok).toBe(true);
  });
});

describe('componentCatalog definitions', () => {
  it('defines every component type under its own key', () => {
    expect(Object.keys(componentCatalog).sort()).toEqual([...componentKinds].sort());
    for (const [key, definition] of Object.entries(componentCatalog)) expect(definition.type).toBe(key);
  });

  it('includes the MVP equipment set', () => {
    for (const kind of ['tank', 'valve', 'pipe', 'elbow', 'tee', 'pump', 'motor', 'sensor'] as const) {
      expect(componentCatalog[kind]).toBeDefined();
    }
  });

  it.each(definitions)('$type declares unique port ids', ({ ports }) => {
    const ids = ports.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(definitions)('$type has non-empty bounds that match defaultSize', ({ bounds, defaultSize }) => {
    for (let i = 0; i < 3; i++) {
      expect(bounds.max[i]).toBeGreaterThan(bounds.min[i]);
      expect(bounds.max[i] - bounds.min[i]).toBeCloseTo(defaultSize[i], 10);
    }
  });

  it.each(definitions)('$type has at least one shell part', ({ parts }) => {
    expect(parts.some((p) => p.role === 'shell')).toBe(true);
  });

  it.each(definitions.flatMap((d) => d.ports.map((p) => [`${d.type}.${p.id}`, d, p] as const)))(
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

  it('uses DN150 for every default fluid port except the reducer outlet, matched by the pipe radius', () => {
    const fluid = definitions.flatMap((d) => d.ports.map((p) => [d.type, p] as const)).filter(([, p]) => p.kind === 'fluid');
    expect(fluid.length).toBeGreaterThan(0);
    for (const [type, port] of fluid) expect(port.nominalSize).toBe(type === 'reducer' && port.id === 'out' ? 0.1 : 0.15);
    expect(pipeOuterRadius).toBeGreaterThan(0.15 / 2);
  });

  // Every joint looks the same from the outside: whatever part ends at a fluid port is pipe-sized,
  // so a valve, tee, elbow, tank nozzle, pump stub and pipe meet flush.
  it.each(
    [...definitions, definitionFor('pipe', { length: 0.2 }), definitionFor('pipe', { length: 7.3 })].flatMap((d) =>
      d.ports.filter((p) => p.kind === 'fluid').map((p) => [`${d.type} "${p.id}"`, d, p] as const),
    ),
  )('draws %s with a pipe-sized part ending exactly at the port', (_, definition, port) => {
    const axis = axisIndex(port.direction);
    const close = (a: readonly number[], b: readonly number[]) => a.every((n, i) => Math.abs(n - b[i]) < 1e-9);
    const ends = definition.parts.flatMap((part): { at: number[]; radius: number }[] => {
      if (part.role !== 'shell') return [];
      if (part.shape === 'cylinder' && 'xyz'.indexOf(part.axis) === axis) {
        return [-1, 1].map((s) => ({ at: part.center.map((n, i) => (i === axis ? n + (s * part.length) / 2 : n)), radius: part.radius }));
      }
      if (part.shape === 'cone' && 'xyz'.indexOf(part.axis) === axis) {
        return [-1, 1].map((s) => ({ at: part.center.map((n, i) => (i === axis ? n + (s * part.length) / 2 : n)), radius: s < 0 ? part.radiusStart : part.radiusEnd }));
      }
      if (part.shape === 'bend') {
        return [part.startAngle, part.startAngle + Math.PI / 2].map((a) => ({
          at: [part.center[0] + part.bendRadius * Math.cos(a), part.center[1] + part.bendRadius * Math.sin(a), part.center[2]],
          radius: part.tubeRadius,
        }));
      }
      return [];
    });
    const atPort = ends.filter((e) => close(e.at, port.position));
    expect(atPort.length).toBeGreaterThan(0);
    for (const e of atPort) expect(e.radius).toBeCloseTo(outerRadiusFor(sizeOfPort(port)!), 12);
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
    // The main liquid column; the sight gauge has its own thin one.
    const liquid = componentCatalog.tank.parts.filter((p): p is Extract<GeometryPart, { shape: 'cylinder' }> => p.role === 'liquid' && p.shape === 'cylinder' && p.radius > 0.5);
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

  it('declares the bindable tank and valve properties with their quantities', () => {
    expect(componentCatalog.tank.bindable).toEqual({ level: 'percent', temperature: 'temperature' });
    expect(componentCatalog.valve.bindable).toEqual({ open: 'boolean' });
    expect(componentCatalog.pipe.bindable).toBeUndefined();
  });
});
