import { describe, expect, it } from 'vitest';
import {
  connect,
  connectedGroups,
  connectionsOf,
  disconnect,
  reachableComponents,
  removeComponent,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type ComponentType,
  type ConnectionPort,
  type GraphOptions,
  type ScadaScene,
  type SceneConnection,
} from './index.js';

const fluid = (id: string, nominalSize = 0.15): ConnectionPort => ({
  id,
  kind: 'fluid',
  position: [0, 0, 0],
  direction: [1, 0, 0],
  nominalSize,
});

const ports: Partial<Record<ComponentType, ConnectionPort[]>> = {
  tank: [fluid('inlet'), fluid('outlet')],
  valve: [fluid('in'), fluid('out')],
  pipe: [fluid('in', 0.2), fluid('out', 0.2)],
  tee: [fluid('left'), fluid('right'), fluid('branch')],
};

const options: GraphOptions = { resolvePorts: (type) => ports[type] };

const component = (id: string, type: ComponentKind): ComponentInstance => ({
  id,
  type,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
});

const edge = (id: string, from: [string, string], to: [string, string]): SceneConnection => ({
  id,
  from: { instanceId: from[0], portId: from[1] },
  to: { instanceId: to[0], portId: to[1] },
});

/** tank -> valve -> tee, tee branches to valve-a and valve-b; valve-x stands alone. */
function teeNetwork(): ScadaScene {
  return {
    schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
    components: [
      component('tank', 'tank'),
      component('valve', 'valve'),
      component('tee', 'tee'),
      component('valve-a', 'valve'),
      component('valve-b', 'valve'),
      component('valve-x', 'valve'),
    ],
    connections: [
      edge('e1', ['tank', 'outlet'], ['valve', 'in']),
      edge('e2', ['valve', 'out'], ['tee', 'left']),
      edge('e3', ['tee', 'right'], ['valve-a', 'in']),
      edge('e4', ['tee', 'branch'], ['valve-b', 'in']),
    ],
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('connect', () => {
  it('adds one edge and returns a new scene', () => {
    const scene = deepFreeze(teeNetwork());
    const result = connect(scene, edge('e5', ['valve-a', 'out'], ['valve-x', 'in']), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene).not.toBe(scene);
    expect(result.scene.connections).toHaveLength(5);
    expect(result.scene.connections[4]).toEqual(edge('e5', ['valve-a', 'out'], ['valve-x', 'in']));
    expect(scene.connections).toHaveLength(4);
    expect(validateScene(result.scene, options).ok).toBe(true);
  });

  it.each([
    ['UNKNOWN_INSTANCE', edge('e5', ['valve-a', 'out'], ['ghost', 'in'])],
    ['UNKNOWN_PORT', edge('e5', ['valve-a', 'drain'], ['valve-x', 'in'])],
    ['SELF_CONNECTION', edge('e5', ['valve-x', 'out'], ['valve-x', 'in'])],
    ['PORT_OCCUPIED', edge('e5', ['valve-x', 'in'], ['tank', 'outlet'])],
    ['DUPLICATE_EDGE', edge('e5', ['valve', 'in'], ['tank', 'outlet'])],
    ['DUPLICATE_CONNECTION_ID', edge('e1', ['valve-a', 'out'], ['valve-x', 'in'])],
    ['INVALID_FIELD', edge('', ['valve-a', 'out'], ['valve-x', 'in'])],
  ] as const)('rejects %s and leaves the scene unchanged', (code, connection) => {
    const scene = deepFreeze(teeNetwork());
    const result = connect(scene, connection, options);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code }) });
  });

  it('rejects a bore mismatch', () => {
    const scene = { ...teeNetwork(), components: [...teeNetwork().components, component('pipe', 'pipe')] };
    expect(connect(scene, edge('e5', ['valve-x', 'out'], ['pipe', 'in']), options)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INCOMPATIBLE_PORTS' }),
    });
  });

  it('allows closing a loop', () => {
    const scene: ScadaScene = {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
      components: [component('a', 'valve'), component('b', 'valve')],
      connections: [edge('e1', ['a', 'out'], ['b', 'in'])],
    };
    expect(connect(scene, edge('e2', ['b', 'out'], ['a', 'in']), options).ok).toBe(true);
  });
});

describe('disconnect', () => {
  it('removes the edge and frees both ports for reconnection', () => {
    const scene = deepFreeze(teeNetwork());
    const result = disconnect(scene, 'e3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connections.map((c) => c.id)).toEqual(['e1', 'e2', 'e4']);
    expect(connect(result.scene, edge('e6', ['tee', 'right'], ['valve-x', 'in']), options).ok).toBe(true);
  });

  it('rejects an unknown connection id', () => {
    expect(disconnect(teeNetwork(), 'nope')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNKNOWN_CONNECTION' }),
    });
  });
});

describe('removeComponent', () => {
  it('removes the component and every edge touching it, from either side', () => {
    const scene = deepFreeze(teeNetwork());
    const result = removeComponent(scene, 'tee');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.components.map((c) => c.id)).toEqual(['tank', 'valve', 'valve-a', 'valve-b', 'valve-x']);
    expect(result.scene.connections.map((c) => c.id)).toEqual(['e1']);
    expect(validateScene(result.scene, options).ok).toBe(true);
  });

  it('rejects an unknown component id', () => {
    expect(removeComponent(teeNetwork(), 'ghost')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNKNOWN_INSTANCE' }),
    });
  });
});

describe('connectionsOf', () => {
  it('lists the edges touching a component in scene order', () => {
    expect(connectionsOf(teeNetwork(), 'tee').map((c) => c.id)).toEqual(['e2', 'e3', 'e4']);
    expect(connectionsOf(teeNetwork(), 'valve-x')).toEqual([]);
  });
});

describe('reachableComponents', () => {
  it('walks through the tee to both branches', () => {
    expect(reachableComponents(teeNetwork(), 'tank')).toEqual(['tank', 'valve', 'tee', 'valve-a', 'valve-b']);
  });

  it('ignores edge direction', () => {
    expect(new Set(reachableComponents(teeNetwork(), 'valve-b'))).toEqual(
      new Set(['tank', 'valve', 'tee', 'valve-a', 'valve-b']),
    );
  });

  it('terminates on a cycle', () => {
    const loop: ScadaScene = {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
      components: [component('a', 'valve'), component('b', 'valve'), component('t', 'tee')],
      connections: [
        edge('e1', ['a', 'out'], ['t', 'left']),
        edge('e2', ['t', 'right'], ['b', 'in']),
        edge('e3', ['b', 'out'], ['a', 'in']),
      ],
    };
    expect(reachableComponents(loop, 'a')).toEqual(['a', 't', 'b']);
  });

  it('returns only the start for an isolated component and nothing for an unknown id', () => {
    expect(reachableComponents(teeNetwork(), 'valve-x')).toEqual(['valve-x']);
    expect(reachableComponents(teeNetwork(), 'ghost')).toEqual([]);
  });

  it('handles a long chain without recursion', () => {
    const count = 5000;
    const components = Array.from({ length: count }, (_, i) => component(`v${i}`, 'valve'));
    const connections = Array.from({ length: count - 1 }, (_, i) => edge(`e${i}`, [`v${i}`, 'out'], [`v${i + 1}`, 'in']));
    expect(reachableComponents({ schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm', components, connections }, 'v0')).toHaveLength(count);
  });
});

describe('connectedGroups', () => {
  it('splits the scene into disconnected networks in scene order', () => {
    expect(connectedGroups(teeNetwork())).toEqual([['tank', 'valve', 'tee', 'valve-a', 'valve-b'], ['valve-x']]);
  });

  it('returns no groups for an empty scene', () => {
    expect(connectedGroups({ schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm', components: [], connections: [] })).toEqual([]);
  });
});
