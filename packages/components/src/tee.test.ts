import { describe, expect, it } from 'vitest';
import {
  connect,
  findTouchingPorts,
  portToWorld,
  quaternionFromEuler,
  rotateVector,
  routeScene,
  snapComponent,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
} from '@sakibcoolz/core';
import { catalogResolvers, componentCatalog, definitionFor, pipeOuterRadius } from './index.js';

// Cross-check of the T-junction against every fluid port in the catalog: same size at every
// node, and every component can be seated on every tee port and connected there.

const tee = componentCatalog.tee;
const instance = (id: string, type: ComponentKind, extra: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id,
  type,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: type === 'pipe' ? { length: 2 } : {},
  ...extra,
});

/** Shell parts that end exactly at a port, with their radius. */
function radiiAtPort(type: ComponentKind, port: ConnectionPort): number[] {
  const axis = port.direction.findIndex((n) => n !== 0);
  return definitionFor(type, type === 'pipe' ? { length: 2 } : {}).parts.flatMap((part) => {
    if (part.role !== 'shell') return [];
    const ends: number[][] =
      part.shape === 'cylinder' && 'xyz'.indexOf(part.axis) === axis
        ? [-1, 1].map((s) => part.center.map((n, i) => (i === axis ? n + (s * part.length) / 2 : n)))
        : part.shape === 'bend'
          ? [part.startAngle, part.startAngle + Math.PI / 2].map((a) => [part.center[0] + part.bendRadius * Math.cos(a), part.center[1] + part.bendRadius * Math.sin(a), part.center[2]])
          : [];
    const radius = part.shape === 'bend' ? part.tubeRadius : part.shape === 'cylinder' ? part.radius : NaN;
    return ends.filter((e) => e.every((n, i) => Math.abs(n - port.position[i]) < 1e-9)).map(() => radius);
  });
}

const quarter = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const rotations = quarter.flatMap((x) => quarter.flatMap((y) => quarter.map((z) => quaternionFromEuler({ x, y, z }))));

/** Pose that puts `port` of `type` exactly on the tee port, facing it. */
function seat(type: ComponentKind, port: ConnectionPort, target: { position: number[]; direction: number[] }): ComponentInstance {
  const rotation = rotations.find((q) => {
    const d = rotateVector({ x: port.direction[0], y: port.direction[1], z: port.direction[2] }, q);
    return Math.abs(d.x + target.direction[0]) + Math.abs(d.y + target.direction[1]) + Math.abs(d.z + target.direction[2]) < 1e-9;
  })!;
  const offset = rotateVector({ x: port.position[0], y: port.position[1], z: port.position[2] }, rotation);
  return instance('other', type, {
    rotation,
    position: { x: target.position[0] - offset.x, y: target.position[1] - offset.y, z: target.position[2] - offset.z },
  });
}

const teeAtOrigin = instance('tee', 'tee');
const cases = tee.ports.flatMap((teePort) =>
  (Object.keys(componentCatalog) as ComponentKind[]).flatMap((type) =>
    componentCatalog[type].ports.filter((p) => p.kind === 'fluid' && p.nominalSize === teePort.nominalSize).map((port) => [`tee "${teePort.id}" ↔ ${type} "${port.id}"`, teePort, type, port] as const),
  ),
);

describe('T-junction cross-check', () => {
  it('has three nodes of the same size: DN150 ports drawn at the pipe outer radius', () => {
    for (const port of tee.ports) {
      expect(port.kind).toBe('fluid');
      expect(port.nominalSize).toBe(0.15);
      expect(radiiAtPort('tee', port)).toEqual([pipeOuterRadius]);
    }
  });

  it('covers every same-size fluid port of every component on each of its three nodes', () => {
    const fluidPorts = Object.values(componentCatalog).flatMap((d) => d.ports.filter((p) => p.kind === 'fluid' && p.nominalSize === tee.ports[0].nominalSize));
    expect(cases).toHaveLength(3 * fluidPorts.length);
  });

  it('refuses a port of another size, e.g. the default reducer outlet (DN100)', () => {
    const out = componentCatalog.reducer.ports.find((p) => p.id === 'out')!;
    const other = seat('reducer', out, portToWorld(teeAtOrigin, tee.ports[0]));
    const placed: ScadaScene = { schemaVersion: 3, units: 'm', components: [teeAtOrigin, other], connections: [] };
    expect(findTouchingPorts(placed, catalogResolvers).rejected).toEqual([expect.objectContaining({ reason: 'incompatible' })]);
    expect(connect(placed, { id: 'j', from: { instanceId: 'tee', portId: 'left' }, to: { instanceId: 'other', portId: 'out' } }, catalogResolvers).ok).toBe(false);
  });

  it.each(cases)('%s: same size, seats flush and connects', (_, teePort, type, port) => {
    // Same size on both sides of the joint.
    expect(port.nominalSize).toBe(teePort.nominalSize);
    expect(radiiAtPort(type, port)).toEqual([pipeOuterRadius]);

    const other = seat(type, port, portToWorld(teeAtOrigin, teePort));
    const placed: ScadaScene = { schemaVersion: 3, units: 'm', components: [teeAtOrigin, other], connections: [] };

    // The ports meet: same point, opposite directions.
    const a = portToWorld(teeAtOrigin, teePort), b = portToWorld(other, port);
    for (let i = 0; i < 3; i++) {
      expect(b.position[i]).toBeCloseTo(a.position[i], 9);
      expect(b.direction[i]).toBeCloseTo(-a.direction[i], 9);
    }

    // Found as an exact touching pair and accepted as a connection.
    const touching = findTouchingPorts(placed, catalogResolvers);
    expect(touching.matches.map((m) => [m.from, m.to].map((e) => `${e.instanceId}.${e.portId}`).sort())).toContainEqual([`other.${port.id}`, `tee.${teePort.id}`]);
    const joined = connect(placed, { id: 'j', from: { instanceId: 'tee', portId: teePort.id }, to: { instanceId: 'other', portId: port.id } }, catalogResolvers);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    // Drawn as a direct joint, with no extra routed pipe.
    const [route] = routeScene(joined.scene, catalogResolvers);
    expect(route.status).toBe('ok');
    if (route.status === 'ok') expect(route.kind).toBe('direct');

    // Dropping the part close by snaps it onto the same tee node.
    const nudged = { ...other, id: 'drop', position: { x: other.position.x + 0.05, y: other.position.y + 0.03, z: other.position.z } };
    const snap = snapComponent({ ...placed, components: [teeAtOrigin] }, nudged, catalogResolvers);
    expect(snap.ok).toBe(true);
    if (snap.ok) expect(snap.connection.to).toEqual({ instanceId: 'tee', portId: teePort.id });
  });
});
