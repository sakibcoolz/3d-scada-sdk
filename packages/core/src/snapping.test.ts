import { describe, expect, it } from 'vitest';
import {
  findSnapCandidates,
  portToWorld,
  snapComponent,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type SnapOptions,
  type Vector3Tuple,
} from './index';

const { PI } = Math;

const fluid = (id: string, position: Vector3Tuple, direction: Vector3Tuple, nominalSize = 0.15): ConnectionPort => ({
  id,
  kind: 'fluid',
  position,
  direction,
  nominalSize,
});

const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = {
  tank: [fluid('inlet', [-1.2, 0.8, 0], [-1, 0, 0]), fluid('outlet', [1.2, -0.9, 0], [1, 0, 0])],
  pipe: [fluid('in', [-1, 0, 0], [-1, 0, 0]), fluid('out', [1, 0, 0], [1, 0, 0])],
  valve: [fluid('in', [-0.6, 0, 0], [-1, 0, 0], 0.2), fluid('out', [0.6, 0, 0], [1, 0, 0], 0.2)],
  sensor: [{ id: 'signal', kind: 'signal', position: [-0.15, 0, 0], direction: [-1, 0, 0] }],
};

const options: SnapOptions = { resolvePorts: (kind) => ports[kind] };

const instance = (id: string, kind: ComponentKind, position: Vector3Tuple, rotation: Vector3Tuple = [0, 0, 0]): ComponentInstance => ({
  id,
  kind,
  position,
  rotation,
  properties: {},
});

const tank = instance('tank-1', 'tank', [0, 0, 0]);
// Tank outlet is at world (1.2, -0.9, 0) facing +X.
const sceneWith = (...components: ComponentInstance[]): ScadaScene => ({ version: 1, components, connections: [] });

function expectClose(actual: Vector3Tuple, expected: Vector3Tuple, digits = 9): void {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], digits));
}

describe('findSnapCandidates', () => {
  it('finds the nearby compatible port facing the target', () => {
    const pipe = instance('pipe-1', 'pipe', [2.4, -0.8, 0.1]);
    const candidates = findSnapCandidates(sceneWith(tank), pipe, options);
    expect(candidates[0]).toEqual(
      expect.objectContaining({ status: 'ok', movingPortId: 'in', target: { instanceId: 'tank-1', portId: 'outlet' } }),
    );
    expect(candidates[0].distance).toBeCloseTo(Math.hypot(0.2, 0.1, 0.1), 12);
  });

  it('marks a port facing the same way as the target as misaligned', () => {
    // Pipe "out" (+X) sits on the tank outlet (+X): close enough, wrong direction.
    const pipe = instance('pipe-1', 'pipe', [0.2, -0.9, 0]);
    const candidates = findSnapCandidates(sceneWith(tank), pipe, options);
    expect(candidates).toContainEqual(expect.objectContaining({ movingPortId: 'out', status: 'misaligned' }));
  });

  it('accepts a moderately tilted port within the angle tolerance', () => {
    const pipe = instance('pipe-1', 'pipe', [2.2, -0.9, 0], [0, 0.5, 0]);
    expect(snapComponent(sceneWith(tank), pipe, options).ok).toBe(true);
    expect(snapComponent(sceneWith(tank), pipe, { ...options, maxAngle: 0.4 }).ok).toBe(false);
  });

  it('marks a port with a different bore as incompatible', () => {
    const valve = instance('valve-1', 'valve', [1.8, -0.9, 0]);
    expect(findSnapCandidates(sceneWith(tank), valve, options)).toContainEqual(
      expect.objectContaining({ movingPortId: 'in', status: 'incompatible' }),
    );
  });

  it('marks a port of another domain as incompatible', () => {
    const sensor = instance('sensor-1', 'sensor', [1.35, -0.9, 0]);
    expect(findSnapCandidates(sceneWith(tank), sensor, options)).toEqual([
      expect.objectContaining({ movingPortId: 'signal', status: 'incompatible' }),
    ]);
  });

  it('marks an occupied target port as occupied', () => {
    const scene: ScadaScene = {
      ...sceneWith(tank, instance('pipe-0', 'pipe', [10, 0, 0])),
      connections: [{ id: 'e1', from: { instanceId: 'tank-1', portId: 'outlet' }, to: { instanceId: 'pipe-0', portId: 'in' } }],
    };
    const pipe = instance('pipe-1', 'pipe', [2.3, -0.9, 0]);
    expect(findSnapCandidates(scene, pipe, options)).toContainEqual(
      expect.objectContaining({ movingPortId: 'in', status: 'occupied' }),
    );
    expect(snapComponent(scene, pipe, options)).toEqual(expect.objectContaining({ ok: false, reason: 'NO_CANDIDATE' }));
  });

  it('marks an already connected moving port as occupied', () => {
    const pipe = instance('pipe-1', 'pipe', [2.3, -0.9, 0]);
    const scene: ScadaScene = {
      ...sceneWith(tank, pipe, instance('pipe-0', 'pipe', [10, 0, 0])),
      connections: [{ id: 'e1', from: { instanceId: 'pipe-1', portId: 'in' }, to: { instanceId: 'pipe-0', portId: 'out' } }],
    };
    expect(findSnapCandidates(scene, pipe, options)).toContainEqual(
      expect.objectContaining({ movingPortId: 'in', status: 'occupied' }),
    );
  });

  it('ignores ports beyond the snap distance', () => {
    const pipe = instance('pipe-1', 'pipe', [3, -0.9, 0]);
    expect(findSnapCandidates(sceneWith(tank), pipe, options)).toEqual([]);
    expect(findSnapCandidates(sceneWith(tank), pipe, { ...options, maxDistance: 1 })).toHaveLength(1);
  });

  it('never matches the moving component against its own ports', () => {
    const pipe = instance('pipe-1', 'pipe', [0, 0, 0]);
    // Same id as a scene component: the scene copy is the one being dragged.
    const scene = sceneWith(instance('pipe-1', 'pipe', [0, 0, 0]));
    expect(findSnapCandidates(scene, pipe, { ...options, maxDistance: 5 })).toEqual([]);
  });

  it('orders equally distant candidates deterministically', () => {
    // Two tanks whose outlets are both 0.2 m from the pipe inlet.
    const a = instance('tank-b', 'tank', [0, 0, 0.2]);
    const b = instance('tank-a', 'tank', [0, 0, -0.2]);
    const pipe = instance('pipe-1', 'pipe', [2.2, -0.9, 0]);
    const forward = findSnapCandidates(sceneWith(a, b), pipe, options);
    const reverse = findSnapCandidates(sceneWith(b, a), pipe, options);
    expect(forward.map((c) => c.target.instanceId)).toEqual(['tank-a', 'tank-b']);
    expect(reverse).toEqual(forward);
  });

  it('ignores components whose kind has no ports', () => {
    const pipe = instance('pipe-1', 'pipe', [2.3, -0.9, 0]);
    expect(findSnapCandidates(sceneWith(instance('m', 'motor', [1.3, -0.9, 0])), pipe, options)).toEqual([]);
  });
});

describe('snapComponent', () => {
  it('moves the component so the ports coincide and face each other', () => {
    const pipe = instance('pipe-1', 'pipe', [2.4, -0.8, 0.1], [0, 0.2, 0.1]);
    const result = snapComponent(sceneWith(tank), pipe, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapped = { ...pipe, position: result.position, rotation: result.rotation };
    const moving = portToWorld(snapped, ports.pipe![0]);
    const target = portToWorld(tank, ports.tank![1]);
    expectClose(moving.position, target.position);
    expectClose(moving.direction, [-target.direction[0], -target.direction[1], -target.direction[2]]);
    expect(result.connection).toEqual({
      from: { instanceId: 'pipe-1', portId: 'in' },
      to: { instanceId: 'tank-1', portId: 'outlet' },
    });
  });

  it('turns the component to meet a rotated target', () => {
    // Tank turned +90° about Y: outlet now at (0, -0.9, -1.2) facing -Z.
    const turned = instance('tank-1', 'tank', [0, 0, 0], [0, PI / 2, 0]);
    const pipe = instance('pipe-1', 'pipe', [0, -0.9, -2.3], [0, PI / 2 - 0.3, 0]);
    const result = snapComponent(sceneWith(turned), pipe, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const moving = portToWorld({ position: result.position, rotation: result.rotation }, ports.pipe![0]);
    expectClose(moving.position, [0, -0.9, -1.2]);
    expectClose(moving.direction, [0, 0, 1]);
  });

  it('keeps an already aligned component exactly where the ports meet', () => {
    const pipe = instance('pipe-1', 'pipe', [2.2, -0.9, 0]);
    const result = snapComponent(sceneWith(tank), pipe, options);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expectClose(result.position, [2.2, -0.9, 0]);
    expectClose(result.rotation, [0, 0, 0]);
  });

  it('produces a connection that the scene validator accepts', () => {
    const pipe = instance('pipe-1', 'pipe', [2.4, -0.8, 0.1]);
    const result = snapComponent(sceneWith(tank), pipe, options);
    if (!result.ok) throw new Error('expected a snap');
    const scene = {
      version: 1,
      components: [tank, { ...pipe, position: result.position, rotation: result.rotation }],
      connections: [{ id: 'e1', ...result.connection }],
    };
    expect(validateScene(scene, options)).toEqual(expect.objectContaining({ ok: true }));
  });

  it('reports the nearest rejected candidate when nothing can snap', () => {
    const valve = instance('valve-1', 'valve', [1.8, -0.9, 0]);
    const result = snapComponent(sceneWith(tank), valve, options);
    expect(result).toEqual({
      ok: false,
      reason: 'NO_CANDIDATE',
      nearest: expect.objectContaining({ status: 'incompatible', movingPortId: 'in' }),
    });
  });

  it('reports no nearest candidate when nothing is in range', () => {
    expect(snapComponent(sceneWith(tank), instance('pipe-1', 'pipe', [20, 0, 0]), options)).toEqual({
      ok: false,
      reason: 'NO_CANDIDATE',
    });
  });

  it('does not mutate the scene or the moving component', () => {
    const pipe = instance('pipe-1', 'pipe', [2.4, -0.8, 0.1], [0, 0.2, 0]);
    const scene = sceneWith(tank);
    const before = structuredClone({ pipe, scene });
    snapComponent(scene, pipe, options);
    expect({ pipe, scene }).toEqual(before);
  });

  it('aligns exactly from any starting orientation, including gimbal lock and half turns', () => {
    const turned = instance('tank-1', 'tank', [0.5, 0.2, -0.3], [0.3, -0.8, 0.2]);
    const target = portToWorld(turned, ports.tank![1]);
    const angles = [-PI, -PI / 2, -1, -0.3, 0, 0.4, PI / 2, 2.5];
    for (const x of angles) {
      for (const y of angles) {
        for (const z of angles) {
          const pipe = instance('pipe-1', 'pipe', [target.position[0] + 0.1, target.position[1], target.position[2]], [x, y, z]);
          const result = snapComponent(sceneWith(turned), pipe, { ...options, maxDistance: 10, maxAngle: PI });
          if (!result.ok) throw new Error('expected a snap');
          const port = ports.pipe!.find((p) => p.id === result.candidate.movingPortId)!;
          const moving = portToWorld({ position: result.position, rotation: result.rotation }, port);
          expectClose(moving.position, target.position);
          expectClose(moving.direction, [-target.direction[0], -target.direction[1], -target.direction[2]]);
        }
      }
    }
  });

  it('turns a port facing the same way as a vertical target half way round', () => {
    const riser: Partial<Record<ComponentKind, ConnectionPort[]>> = {
      tee: [fluid('branch', [0, 1, 0], [0, 1, 0])],
      pipe: [fluid('in', [0, -1, 0], [0, 1, 0])],
    };
    const tee = instance('tee-1', 'tee', [0, 0, 0]);
    const pipe = instance('pipe-1', 'pipe', [0, 2.1, 0]);
    const result = snapComponent(sceneWith(tee), pipe, { resolvePorts: (k) => riser[k], maxAngle: PI });
    if (!result.ok) throw new Error('expected a snap');
    const moving = portToWorld({ position: result.position, rotation: result.rotation }, riser.pipe![0]);
    expectClose(moving.position, [0, 1, 0]);
    expectClose(moving.direction, [0, -1, 0]);
  });
});
