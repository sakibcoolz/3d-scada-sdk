import { connect } from './graph.js';
import { seatOnConnection } from './joints.js';
import { portsCompatible, type ComponentInstance, type ComponentKind, type ConnectionPort, type ScadaScene, type SceneConnection } from './scene.js';
import { portToWorld } from './transforms.js';

export interface AttachOptions {
  resolvePorts: (type: ComponentKind, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
  createId: () => string;
}

export type AttachResult =
  | { ok: true; scene: ScadaScene; connection: SceneConnection; /** How far the attached port travelled, metres. */ moved: number }
  | { ok: false; error: { code: 'UNKNOWN_INSTANCE' | 'SAME_COMPONENT' | 'NO_MATCHING_PORTS' | 'INVALID'; message: string } };

/**
 * Attaches `movingId` to `fixedId`: picks the closest pair of free, compatible ports (moving part's
 * port to the fixed part's port), connects them and seats the moving part (with its assembly,
 * unless both share one) so the ports meet exactly and face each other. The input is not changed.
 */
export function attachComponents(scene: ScadaScene, fixedId: string, movingId: string, options: AttachOptions): AttachResult {
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  const fixed = byId.get(fixedId), moving = byId.get(movingId);
  if (!fixed || !moving) return { ok: false, error: { code: 'UNKNOWN_INSTANCE', message: `No component "${!fixed ? fixedId : movingId}".` } };
  if (fixedId === movingId) return { ok: false, error: { code: 'SAME_COMPONENT', message: 'A part cannot be attached to itself.' } };
  const used = new Set(scene.connections.flatMap((c) => [c.from, c.to]).map((e) => `${e.instanceId}\u0000${e.portId}`));
  const free = (c: ComponentInstance) => (options.resolvePorts(c.type, c.properties) ?? []).filter((p) => !used.has(`${c.id}\u0000${p.id}`)).map((p) => ({ port: p, at: portToWorld(c, p).position }));
  const pairs = free(moving).flatMap((m) => free(fixed).filter((f) => portsCompatible(m.port, f.port)).map((f) => ({ m, f, distance: Math.hypot(...m.at.map((n, i) => n - f.at[i])) })));
  if (pairs.length === 0) return { ok: false, error: { code: 'NO_MATCHING_PORTS', message: 'These parts have no free ports of the same type and size.' } };
  pairs.sort((a, b) => a.distance - b.distance || a.m.port.id.localeCompare(b.m.port.id) || a.f.port.id.localeCompare(b.f.port.id));
  const best = pairs[0];
  const connection: SceneConnection = { id: options.createId(), from: { instanceId: movingId, portId: best.m.port.id }, to: { instanceId: fixedId, portId: best.f.port.id } };
  const joined = connect(scene, connection, options);
  if (!joined.ok) return { ok: false, error: { code: 'INVALID', message: joined.error.message } };
  const seated = seatOnConnection(joined.scene, connection.id, movingId, options);
  if (!seated.ok) return { ok: false, error: { code: 'INVALID', message: seated.error.message } };
  return { ok: true, scene: seated.scene, connection, moved: seated.moved };
}
