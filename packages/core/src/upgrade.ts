import { seatOnConnection } from './joints.js';
import type { ComponentInstance, ComponentType, ConnectionPort, ScadaScene, SceneConnection } from './scene.js';
import { findTouchingPorts } from './touching.js';
import { portToWorld } from './transforms.js';

type Endpoint = SceneConnection['from'];
type Resolver = (type: ComponentType, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;

export interface UpgradeOptions {
  /** Ports with the current dimensions. */
  resolvePorts: Resolver;
  /** Ports with the dimensions the file was written with (e.g. before ASME fittings, ADR-0014). */
  resolveLegacyPorts: Resolver;
}

export interface UpgradeResult {
  scene: ScadaScene;
  /** Parts moved so that joints which met under the old dimensions meet again. */
  reseated: number;
}


/** Each port of a kind under the old dimensions, plus its current place where that differs. */
function eitherGeneration(options: UpgradeOptions): Resolver {
  return (type, properties) => {
    const old = options.resolveLegacyPorts(type, properties) ?? [];
    const now = options.resolvePorts(type, properties) ?? [];
    const same = (a: ConnectionPort, b: ConnectionPort) => a.id === b.id && a.position.every((n, i) => n === b.position[i]) && a.direction.every((n, i) => n === b.direction[i]);
    return [...old, ...now.filter((p) => !old.some((o) => same(o, p)))];
  };
}

/** Whether two ports sit together face to face (1 mm, 1°), as `findTouchingPorts` decides, in any of the places `resolve` gives each. */
function meets(scene: ScadaScene, a: Endpoint, b: Endpoint, resolve: Resolver): boolean {
  const at = (e: Endpoint) => {
    const c = scene.components.find((x) => x.id === e.instanceId);
    return c ? (resolve(c.type, c.properties) ?? []).filter((q) => q.id === e.portId).map((q) => portToWorld(c, q)) : [];
  };
  return at(a).some((p) => at(b).some((q) => {
    const distance = Math.hypot(...p.position.map((n, i) => n - q.position[i]));
    const facing = -p.direction.reduce((s, n, i) => s + n * q.direction[i], 0);
    return distance <= 0.001 && facing >= Math.cos(Math.PI / 180);
  }));
}

/**
 * Brings a scene written with older component dimensions up to date: every pair of ports that met
 * under the old dimensions (connected or merely touching) is made to meet again, walking each
 * line outwards from its first part so downstream parts follow. A file may mix generations (e.g.
 * current fittings with older valves): each side of a joint may be in either, and joints that
 * already meet carry the parts after them along. Deliberate gaps are left alone,
 * connections are not changed, and a scene already in current dimensions is returned as is.
 */
export function upgradeDimensions(scene: ScadaScene, options: UpgradeOptions): UpgradeResult {
  const either = eitherGeneration(options);
  const edges: { a: Endpoint; b: Endpoint; connectionId?: string }[] = [
    ...scene.connections.filter((c) => meets(scene, c.from, c.to, either)).map((c) => ({ a: c.from, b: c.to, connectionId: c.id })),
    ...findTouchingPorts(scene, { resolvePorts: either }).matches.map((m) => ({ a: m.from, b: m.to })),
  ];
  if (edges.length === 0) return { scene, reseated: 0 };

  // Work on a flat copy (no assembly links) so seating moves one part at a time; unconnected
  // touching pairs get temporary connections for the seat and are dropped afterwards.
  const temp: SceneConnection[] = edges.filter((e) => !e.connectionId).map((e, i) => ({ id: `\u0000upgrade${i}`, from: e.a, to: e.b }));
  let n = 0;
  for (const e of edges) if (!e.connectionId) e.connectionId = temp[n++].id;
  let work: ScadaScene = {
    ...scene,
    components: scene.components.map(({ parentId: _, ...c }) => c),
    connections: [...scene.connections, ...temp],
  };

  const order = new Map(scene.components.map((c, i) => [c.id, i]));
  const touched = [...new Set(edges.flatMap((e) => [e.a.instanceId, e.b.instanceId]))].sort((x, y) => order.get(x)! - order.get(y)!);
  const placed = new Set<string>();
  let reseated = 0;
  for (const root of touched) {
    if (placed.has(root)) continue;
    placed.add(root);
    const queue = [root];
    while (queue.length) {
      const u = queue.shift()!;
      for (const e of edges) {
        const [mine, other] = e.a.instanceId === u ? [e.a, e.b] : e.b.instanceId === u ? [e.b, e.a] : [];
        if (!mine || !other || placed.has(other.instanceId)) continue;
        placed.add(other.instanceId);
        queue.push(other.instanceId);
        if (meets(work, mine, other, options.resolvePorts)) continue;
        const seated = seatOnConnection(work, e.connectionId!, other.instanceId, options);
        if (seated.ok) {
          work = seated.scene;
          reseated++;
        }
      }
    }
  }
  if (reseated === 0) return { scene, reseated: 0 };
  const pose = new Map(work.components.map((c) => [c.id, c]));
  return {
    scene: { ...scene, components: scene.components.map((c) => ({ ...c, position: pose.get(c.id)!.position, rotation: pose.get(c.id)!.rotation })) },
    reseated,
  };
}
