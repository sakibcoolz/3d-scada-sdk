import { seatOnConnection } from './joints.js';
import type { ComponentInstance, ComponentKind, ConnectionPort, ScadaScene, SceneConnection } from './scene.js';
import { findTouchingPorts } from './touching.js';
import { portToWorld } from './transforms.js';

type Endpoint = SceneConnection['from'];
type Resolver = (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;

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


/** Whether two ports sit together face to face (1 mm, 1°), as `findTouchingPorts` decides. */
function meets(scene: ScadaScene, a: Endpoint, b: Endpoint, resolve: Resolver): boolean {
  const at = (e: Endpoint) => {
    const c = scene.components.find((x) => x.id === e.instanceId);
    const p = c && resolve(c.type, c.properties)?.find((q) => q.id === e.portId);
    return c && p ? portToWorld(c, p) : undefined;
  };
  const [p, q] = [at(a), at(b)];
  if (!p || !q) return false;
  const distance = Math.hypot(...p.position.map((n, i) => n - q.position[i]));
  const facing = -p.direction.reduce((s, n, i) => s + n * q.direction[i], 0);
  return distance <= 0.001 && facing >= Math.cos(Math.PI / 180);
}

/**
 * Brings a scene written with older component dimensions up to date: every pair of ports that met
 * under the old dimensions (connected or merely touching) is made to meet again, walking each
 * line outwards from its first part so downstream parts follow. Deliberate gaps are left alone,
 * connections are not changed, and a scene already in current dimensions is returned as is.
 */
export function upgradeDimensions(scene: ScadaScene, options: UpgradeOptions): UpgradeResult {
  const legacy = { resolvePorts: options.resolveLegacyPorts };
  const edges: { a: Endpoint; b: Endpoint; connectionId?: string }[] = [
    ...scene.connections.filter((c) => meets(scene, c.from, c.to, options.resolveLegacyPorts)).map((c) => ({ a: c.from, b: c.to, connectionId: c.id })),
    ...findTouchingPorts(scene, legacy).matches.map((m) => ({ a: m.from, b: m.to })),
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
