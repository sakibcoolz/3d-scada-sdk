import { describe, expect, it } from 'vitest';
import {
  quaternionFromEuler,
  routeConnection,
  routeScene,
  sampleRouteCenterline,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type PipeRoute,
  type RoutingOptions,
  type ScadaScene,
  type Vector3Tuple,
} from './index';

const { PI } = Math;
const R = 0.3;

// A "nozzle" fixture: one fluid port at the component origin facing local +X.
const nozzlePort: ConnectionPort = { id: 'p', kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 };
const teePorts: ConnectionPort[] = [
  { id: 'left', kind: 'fluid', position: [-1, 0, 0], direction: [-1, 0, 0], nominalSize: 0.15 },
  { id: 'right', kind: 'fluid', position: [1, 0, 0], direction: [1, 0, 0], nominalSize: 0.15 },
  { id: 'branch', kind: 'fluid', position: [0, 1, 0], direction: [0, 1, 0], nominalSize: 0.15 },
];
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = { sensor: [nozzlePort], tee: teePorts };
const options: RoutingOptions = { resolvePorts: (type) => ports[type], bendRadius: R };

/** Rotations that turn local +X into each world axis. */
const facing = {
  '+x': [0, 0, 0],
  '-x': [0, PI, 0],
  '+y': [0, 0, PI / 2],
  '-y': [0, 0, -PI / 2],
  '+z': [0, -PI / 2, 0],
  '-z': [0, PI / 2, 0],
} satisfies Record<string, Vector3Tuple>;

const nozzle = (id: string, position: Vector3Tuple, face: keyof typeof facing | Vector3Tuple): ComponentInstance => ({
  id,
  type: 'sensor',
  position,
  rotation: quaternionFromEuler(typeof face === 'string' ? facing[face] : face),
  scale: [1, 1, 1],
  properties: {},
});

function pair(a: ComponentInstance, b: ComponentInstance): ScadaScene {
  return {
    schemaVersion: 2,
    units: 'm',
    components: [a, b],
    connections: [{ id: 'e1', from: { instanceId: a.id, portId: 'p' }, to: { instanceId: b.id, portId: 'p' } }],
  };
}

const route = (scene: ScadaScene) => routeConnection(scene, scene.connections[0], options);

function expectPoints(actual: Vector3Tuple[], expected: Vector3Tuple[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => p.forEach((n, j) => expect(n).toBeCloseTo(expected[i][j], 9)));
}

const sub = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Vector3Tuple): Vector3Tuple => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Shape rules every routed polyline must satisfy. */
function expectWellFormed(result: PipeRoute, start: Vector3Tuple, leave: Vector3Tuple, end: Vector3Tuple, arrive: Vector3Tuple): void {
  if (result.status !== 'ok') throw new Error(`expected ok route, got ${result.reason}`);
  const { points } = result;
  expectPoints([points[0], points[points.length - 1]], [start, end]);
  if (points.length < 2) return;
  const segments = points.slice(1).map((p, i) => sub(p, points[i]));
  const lengths = segments.map((s) => Math.hypot(...s));
  const dirs = segments.map(unit);
  dirs[0].forEach((n, i) => expect(n).toBeCloseTo(leave[i], 9));
  dirs[dirs.length - 1].forEach((n, i) => expect(n).toBeCloseTo(arrive[i], 9));
  for (let i = 1; i < dirs.length; i++) expect(dot(dirs[i - 1], dirs[i])).toBeCloseTo(0, 9);
  lengths.forEach((l, i) => {
    const bendsAtEnds = (i > 0 ? 1 : 0) + (i < lengths.length - 1 ? 1 : 0);
    expect(l).toBeGreaterThanOrEqual(bendsAtEnds * R - 1e-9);
  });
  expect(result.bends).toHaveLength(points.length - 2);
  expect(result.length).toBeCloseTo(
    lengths.reduce((a, b) => a + b, 0),
    9,
  );
}

describe('routeConnection', () => {
  it('returns a zero-length direct route for coincident ports', () => {
    const result = route(pair(nozzle('a', [1, 2, 3], '+x'), nozzle('b', [1, 2, 3], '-x')));
    expect(result).toEqual(expect.objectContaining({ status: 'ok', kind: 'direct', length: 0, bends: [] }));
  });

  it('runs straight between ports that face each other in line', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [1.8, 0, 0], '-x')));
    expect(result).toEqual(expect.objectContaining({ status: 'ok', kind: 'straight', bends: [] }));
    if (result.status !== 'ok') return;
    expectPoints(result.points, [[0, 0, 0], [1.8, 0, 0]]);
    expect(result.length).toBeCloseTo(1.8, 12);
  });

  it('runs straight at any angle when the ports are collinear and opposed', () => {
    const angle = 0.4;
    const b: Vector3Tuple = [2 * Math.cos(angle), 0, -2 * Math.sin(angle)];
    const result = route(pair(nozzle('a', [0, 0, 0], [0, angle, 0]), nozzle('b', b, [0, angle + PI, 0])));
    expect(result).toEqual(expect.objectContaining({ status: 'ok', kind: 'straight' }));
  });

  it('makes one bend for an L-shaped run', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [2, 2, 0], '-y')));
    expect(result).toEqual(expect.objectContaining({ status: 'ok', kind: 'orthogonal' }));
    if (result.status !== 'ok') return;
    expectPoints(result.points, [[0, 0, 0], [2, 0, 0], [2, 2, 0]]);
    expect(result.bends).toEqual([{ corner: [2, 0, 0], radius: R }]);
    expect(result.length).toBeCloseTo(4, 12);
  });

  it('makes two bends for an offset parallel run, preferring the first axis order on ties', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [3, 1, 0], '-x')));
    if (result.status !== 'ok') throw new Error('expected ok');
    expectPoints(result.points, [[0, 0, 0], [2.7, 0, 0], [2.7, 1, 0], [3, 1, 0]]);
    expectWellFormed(result, [0, 0, 0], [1, 0, 0], [3, 1, 0], [1, 0, 0]);
  });

  it('turns back with a U for ports facing the same way', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [0, 1, 0], '+x')));
    if (result.status !== 'ok') throw new Error('expected ok');
    expectPoints(result.points, [[0, 0, 0], [0.3, 0, 0], [0.3, 1, 0], [0, 1, 0]]);
  });

  it('routes through three dimensions with the fewest bends', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [2, 1, 3], '-z')));
    expectWellFormed(result, [0, 0, 0], [1, 0, 0], [2, 1, 3], [0, 0, 1]);
    if (result.status === 'ok') expect(result.bends).toHaveLength(2);
  });

  it.each([
    ['+x', [2, 2, 0], '-y'],
    ['+y', [1, -2, 1], '+x'],
    ['-z', [-1, 1, -3], '+z'],
    ['+x', [1.5, 2, -2], '-x'],
    ['-y', [2, -1, 2], '-y'],
  ] as const)('produces a well-formed route from %s to %o facing %s', (faceA, position, faceB) => {
    const directions: Record<string, Vector3Tuple> = {
      '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1],
    };
    const result = route(pair(nozzle('a', [0, 0, 0], faceA), nozzle('b', [...position], faceB)));
    const arrive = directions[faceB].map((n) => -n) as Vector3Tuple;
    expectWellFormed(result, [0, 0, 0], directions[faceA], [...position], arrive);
  });

  it('marks a target directly behind the source as unroutable', () => {
    expect(route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [-2, 0, 0], '+x')))).toEqual(
      expect.objectContaining({ status: 'invalid', reason: 'UNROUTABLE' }),
    );
  });

  it('marks an offset too small for two bends as too tight', () => {
    expect(route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [1, 0.2, 0], '-x')))).toEqual(
      expect.objectContaining({ status: 'invalid', reason: 'BEND_TOO_TIGHT' }),
    );
  });

  it('marks ports off the world axes that are not collinear as unsupported', () => {
    expect(route(pair(nozzle('a', [0, 0, 0], [0, 0.3, 0]), nozzle('b', [2, 2, 0], '-y')))).toEqual(
      expect.objectContaining({ status: 'invalid', reason: 'UNSUPPORTED_ORIENTATION' }),
    );
  });

  it('marks an edge with a missing component or port as unresolved', () => {
    const scene = pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [2, 0, 0], '-x'));
    expect(routeConnection(scene, { ...scene.connections[0], to: { instanceId: 'ghost', portId: 'p' } }, options)).toEqual(
      expect.objectContaining({ status: 'invalid', reason: 'UNRESOLVED' }),
    );
  });

  it('always carries the connection id and the world port anchors', () => {
    const result = route(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [-2, 0, 0], '+x')));
    expect(result.connectionId).toBe('e1');
    if (!('from' in result)) throw new Error('expected resolved anchors');
    expectPoints([result.from, result.to], [[0, 0, 0], [-2, 0, 0]]);
  });
});

describe('routeScene', () => {
  const network = (): ScadaScene => ({
    schemaVersion: 2,
    units: 'm',
    components: [
      nozzle('src', [-3, 0, 0], '+x'),
      { id: 'tee', type: 'tee', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], properties: {} },
      nozzle('a', [3, 0, 0], '-x'),
      nozzle('b', [2, 3, 0], '-x'),
    ],
    connections: [
      { id: 'in', from: { instanceId: 'src', portId: 'p' }, to: { instanceId: 'tee', portId: 'left' } },
      { id: 'run', from: { instanceId: 'tee', portId: 'right' }, to: { instanceId: 'a', portId: 'p' } },
      { id: 'branch', from: { instanceId: 'tee', portId: 'branch' }, to: { instanceId: 'b', portId: 'p' } },
    ],
  });

  it('routes every connection of a tee network in connection order', () => {
    const routes = routeScene(network(), options);
    expect(routes.map((r) => [r.connectionId, r.status, r.status === 'ok' ? r.kind : r.reason])).toEqual([
      ['in', 'ok', 'straight'],
      ['run', 'ok', 'straight'],
      ['branch', 'ok', 'orthogonal'],
    ]);
  });

  it('is deterministic and re-routes when a component moves', () => {
    const scene = network();
    expect(routeScene(scene, options)).toEqual(routeScene(structuredClone(scene), options));
    const moved = { ...scene, components: scene.components.map((c) => (c.id === 'b' ? { ...c, position: [2, 4, 1] as Vector3Tuple } : c)) };
    const [before, after] = [routeScene(scene, options)[2], routeScene(moved, options)[2]];
    expect(after).not.toEqual(before);
    expectWellFormed(after, [0, 1, 0], [0, 1, 0], [2, 4, 1], [1, 0, 0]);
  });

  it('does not mutate the scene', () => {
    const scene = network();
    const snapshot = structuredClone(scene);
    routeScene(scene, options);
    expect(scene).toEqual(snapshot);
  });
});

describe('sampleRouteCenterline', () => {
  const okRoute = (scene: ScadaScene) => {
    const result = route(scene);
    if (result.status !== 'ok') throw new Error('expected ok route');
    return result;
  };

  it('is the single anchor for a direct route and the two ends for a straight one', () => {
    expect(sampleRouteCenterline(okRoute(pair(nozzle('a', [1, 2, 3], '+x'), nozzle('b', [1, 2, 3], '-x'))))).toEqual([[1, 2, 3]]);
    expectPoints(sampleRouteCenterline(okRoute(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [1.8, 0, 0], '-x')))), [
      [0, 0, 0],
      [1.8, 0, 0],
    ]);
  });

  it('follows each bend on its arc instead of cutting through the corner', () => {
    const l = okRoute(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [2, 2, 0], '-y')));
    const points = sampleRouteCenterline(l, 4);
    expect(points).toHaveLength(2 + 5);
    expectPoints([points[0], points[points.length - 1]], [[0, 0, 0], [2, 2, 0]]);
    // Arc from (2 - R, 0, 0) to (2, R, 0) around centre (2 - R, R, 0).
    const arc = points.slice(1, -1);
    expectPoints([arc[0], arc[arc.length - 1]], [[2 - R, 0, 0], [2, R, 0]]);
    for (const p of arc) expect(Math.hypot(p[0] - (2 - R), p[1] - R, p[2])).toBeCloseTo(R, 12);
    // Never reaches the sharp corner itself.
    for (const p of points) expect(Math.hypot(p[0] - 2, p[1], p[2])).toBeGreaterThan(0.05);
  });

  it('keeps every sample on the route for a three-dimensional route', () => {
    const r = okRoute(pair(nozzle('a', [0, 0, 0], '+x'), nozzle('b', [2, 1, 3], '-z')));
    const points = sampleRouteCenterline(r, 6);
    expect(points).toHaveLength(2 + 2 * 7);
    for (let i = 1; i < points.length; i++) {
      expect(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2])).toBeGreaterThan(0);
    }
  });
});
