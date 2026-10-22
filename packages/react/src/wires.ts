import { matesPhysically, portToWorld, type PortKind, type ScadaScene, type Vector3Tuple } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';

/** Line colour per wired domain (ADR-0023): power orange, signal blue, network green. */
export const wireColors: Readonly<Record<PortKind, string>> = {
  power: '#e8892c',
  signal: '#3d8bfd',
  network: '#2fb36d',
  fluid: '#8a8f98',
  mechanical: '#8a8f98',
  electrical: '#e8892c',
};

export interface WireSegment {
  connectionId: string;
  domain: PortKind;
  from: Vector3Tuple;
  to: Vector3Tuple;
}

/**
 * Straight lines for connections between power, signal or network ports, which are wired rather
 * than piped (ADR-0023): from terminal to terminal in world space. Display only; cable routing in
 * 3D is a later phase. Connections whose ports do not resolve are left out.
 */
export function wireSegments(scene: ScadaScene, registry: ComponentRegistry = builtInRegistry): WireSegment[] {
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  const segments: WireSegment[] = [];
  for (const c of scene.connections) {
    const a = byId.get(c.from.instanceId), b = byId.get(c.to.instanceId);
    const pa = a && registry.resolvers.resolvePorts(a.type, a.properties)?.find((p) => p.id === c.from.portId);
    const pb = b && registry.resolvers.resolvePorts(b.type, b.properties)?.find((p) => p.id === c.to.portId);
    if (!a || !b || !pa || !pb || matesPhysically(pa)) continue;
    segments.push({ connectionId: c.id, domain: pa.kind, from: portToWorld(a, pa).position, to: portToWorld(b, pb).position });
  }
  return segments;
}
