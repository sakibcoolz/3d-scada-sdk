import type { ScadaScene, SceneConnection } from './scene';
import { validateScene, type SceneValidationErrorCode, type SceneValidationOptions } from './validation';

export type GraphErrorCode = SceneValidationErrorCode | 'UNKNOWN_CONNECTION';

export interface GraphError {
  code: GraphErrorCode;
  message: string;
}

export type GraphResult = { ok: true; scene: ScadaScene } | { ok: false; error: GraphError };

export type GraphOptions = Pick<SceneValidationOptions, 'resolvePorts' | 'resolveBindable' | 'limits'>;

/**
 * Adds one edge. The candidate scene goes through `validateScene`, so the same rules apply as on
 * load (known ports, compatibility, occupancy, no duplicates). The input scene must already be valid.
 */
export function connect(scene: ScadaScene, connection: SceneConnection, options: GraphOptions): GraphResult {
  const index = scene.connections.length;
  const result = validateScene({ ...scene, connections: [...scene.connections, connection] }, options);
  if (result.ok) return result;
  // Prefer an error about the new edge; anything else means the input scene was already invalid.
  const error = result.errors.find((e) => e.path.startsWith(`connections[${index}]`)) ?? result.errors[0];
  return { ok: false, error: { code: error.code, message: error.message } };
}

export function disconnect(scene: ScadaScene, connectionId: string): GraphResult {
  if (!scene.connections.some((c) => c.id === connectionId)) {
    return { ok: false, error: { code: 'UNKNOWN_CONNECTION', message: `No connection "${connectionId}".` } };
  }
  const next = { ...scene, connections: scene.connections.filter((c) => c.id !== connectionId) };
  return { ok: true, scene: withoutDanglingBindings(next) };
}

/** Removes a component together with every edge that touches it, so no edge is left dangling. */
export function removeComponent(scene: ScadaScene, instanceId: string): GraphResult {
  if (!scene.components.some((c) => c.id === instanceId)) {
    return { ok: false, error: { code: 'UNKNOWN_INSTANCE', message: `No component "${instanceId}".` } };
  }
  const next = {
    ...scene,
    components: scene.components.filter((c) => c.id !== instanceId),
    connections: scene.connections.filter((c) => c.from.instanceId !== instanceId && c.to.instanceId !== instanceId),
  };
  return { ok: true, scene: withoutDanglingBindings(next) };
}

/** Drops tag bindings whose component or connection no longer exists. Absent bindings stay absent. */
function withoutDanglingBindings(scene: ScadaScene): ScadaScene {
  if (!scene.tagBindings) return scene;
  const components = new Set(scene.components.map((c) => c.id));
  const connections = new Set(scene.connections.map((c) => c.id));
  const tagBindings = scene.tagBindings.filter((b) => (b.kind === 'property' ? components.has(b.instanceId) : connections.has(b.connectionId)));
  return { ...scene, tagBindings };
}

export function connectionsOf(scene: ScadaScene, instanceId: string): SceneConnection[] {
  return scene.connections.filter((c) => c.from.instanceId === instanceId || c.to.instanceId === instanceId);
}

function adjacency(scene: ScadaScene): Map<string, string[]> {
  const neighbours = new Map<string, string[]>(scene.components.map((c) => [c.id, []]));
  for (const c of scene.connections) {
    neighbours.get(c.from.instanceId)?.push(c.to.instanceId);
    neighbours.get(c.to.instanceId)?.push(c.from.instanceId);
  }
  return neighbours;
}

function walk(neighbours: Map<string, string[]>, start: string, visited: Set<string>): string[] {
  // Iterative breadth-first search: cycles stop at visited nodes and long chains cannot overflow the stack.
  const order = [start];
  visited.add(start);
  for (let i = 0; i < order.length; i++) {
    for (const next of neighbours.get(order[i]) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        order.push(next);
      }
    }
  }
  return order;
}

/**
 * Component ids connected to `instanceId` through any path, ignoring edge direction, in
 * breadth-first order following scene connection order. Empty for an unknown id.
 */
export function reachableComponents(scene: ScadaScene, instanceId: string): string[] {
  const neighbours = adjacency(scene);
  return neighbours.has(instanceId) ? walk(neighbours, instanceId, new Set()) : [];
}

/** Disconnected networks, each in breadth-first order, ordered by their first component in the scene. */
export function connectedGroups(scene: ScadaScene): string[][] {
  const neighbours = adjacency(scene);
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const c of scene.components) {
    if (!visited.has(c.id)) groups.push(walk(neighbours, c.id, visited));
  }
  return groups;
}
