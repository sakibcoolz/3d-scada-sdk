import { Matrix4, Vector3 } from 'three';
import { portToWorld, type PipeRoute, type ScadaScene, type SceneConnection, type Vector3Tuple } from '@sakibcoolz/core';
import { builtInRegistry, hasFlangedEnds, jointStyle, sizeOfPort, type PipeSize, type ComponentRegistry } from '@sakibcoolz/components';

/**
 * Where to draw joint hardware (ADR-0015): a bolted flange pair, a single flange on a free
 * flanged port, or a butt-weld bead. `matrix` maps the joint frame (+X along the port, joint plane
 * at x = 0) into the world.
 */
export interface JointPlacement {
  style: 'pair' | 'single' | 'weld';
  size: PipeSize;
  matrix: number[];
}

const frame = (at: Vector3Tuple, direction: Vector3Tuple): number[] => {
  const x = new Vector3(...direction).normalize();
  const up = Math.abs(x.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const z = new Vector3().crossVectors(x, up).normalize();
  const y = new Vector3().crossVectors(z, x);
  return new Matrix4().makeBasis(x, y, z).setPosition(...at).elements.slice();
};

type Endpoint = SceneConnection['from'];

/** Joint hardware for every connection (direct or routed) and every free flanged port. */
export function jointPlacements(scene: ScadaScene, routes: readonly PipeRoute[], registry: ComponentRegistry = builtInRegistry): JointPlacement[] {
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  const portOf = (e: Endpoint) => {
    const c = byId.get(e.instanceId);
    const port = c && registry.resolvers.resolvePorts(c.type, c.properties)?.find((p) => p.id === e.portId);
    return c && port ? { component: c, port, world: portToWorld(c, port) } : undefined;
  };
  const sized = (p: { port: Parameters<typeof sizeOfPort>[0] }): PipeSize => sizeOfPort(p.port) ?? 'DN150';
  const routeById = new Map(routes.map((r) => [r.connectionId, r]));
  const out: JointPlacement[] = [];
  const style = (a: string, b: string): JointPlacement['style'] => (jointStyle(a as never, b as never) === 'flanged' ? 'pair' : 'weld');
  for (const c of scene.connections) {
    const route = routeById.get(c.id);
    const [a, b] = [portOf(c.from), portOf(c.to)];
    if (!route || route.status !== 'ok' || !a || !b) continue;
    if (route.kind === 'direct') {
      out.push({ style: style(a.component.type, b.component.type), size: sized(a), matrix: frame(a.world.position, a.world.direction) });
      continue;
    }
    // A routed run is a pipe: a joint where it leaves each part, and welds either side of each bend.
    out.push({ style: style(a.component.type, 'pipe'), size: sized(a), matrix: frame(a.world.position, a.world.direction) });
    out.push({ style: style(b.component.type, 'pipe'), size: sized(b), matrix: frame(b.world.position, b.world.direction) });
    const pts = route.points;
    for (let i = 1; i < pts.length - 1; i++) {
      const radius = route.bends[i - 1].radius;
      const incoming = new Vector3(...pts[i]).sub(new Vector3(...pts[i - 1])).normalize();
      const outgoing = new Vector3(...pts[i + 1]).sub(new Vector3(...pts[i])).normalize();
      const corner = new Vector3(...pts[i]);
      const before = corner.clone().addScaledVector(incoming, -radius);
      const after = corner.clone().addScaledVector(outgoing, radius);
      out.push({ style: 'weld', size: sized(a), matrix: frame([before.x, before.y, before.z], [incoming.x, incoming.y, incoming.z]) });
      out.push({ style: 'weld', size: sized(a), matrix: frame([after.x, after.y, after.z], [outgoing.x, outgoing.y, outgoing.z]) });
    }
  }
  const used = new Set(scene.connections.flatMap((c) => [c.from, c.to]).map((e) => `${e.instanceId}\u0000${e.portId}`));
  for (const c of scene.components) {
    if (!hasFlangedEnds(c.type)) continue;
    for (const port of registry.resolvers.resolvePorts(c.type, c.properties) ?? []) {
      if (port.kind !== 'fluid' || used.has(`${c.id}\u0000${port.id}`)) continue;
      const world = portToWorld(c, port);
      out.push({ style: 'single', size: sizeOfPort(port) ?? 'DN150', matrix: frame(world.position, world.direction) });
    }
  }
  return out;
}
