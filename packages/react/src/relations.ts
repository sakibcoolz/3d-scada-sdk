import { relationshipKinds, type Relationship, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { portFlow } from './ports.js';

// The relationship explorer's model (ADR-0027, T-087): a component's neighbours grouped by how they
// relate, and its upstream control chain. Explicit connections and associations only, never names.

export interface RelatedComponent {
  id: string;
  /** Name, else id. Display text only. */
  label: string;
}

export interface RelationGroup {
  /** Stable key, e.g. `power-from`, `association:controls:in`. */
  key: string;
  label: string;
  components: RelatedComponent[];
}

export interface Relations {
  groups: RelationGroup[];
  /** What acts on this component, nearest first (see `describeRelations`). */
  chain: RelatedComponent[];
}

/** Passive wording for associations seen from their target. */
const passive: Record<(typeof relationshipKinds)[number], string> = {
  controls: 'Controlled by',
  drives: 'Driven by',
  measures: 'Measured by',
  feeds: 'Fed by',
  communicates: 'Communicates with',
  wired: 'Wired to',
  associated: 'Associated with',
};
const active = (r: Relationship) => `${r.charAt(0).toUpperCase()}${r.slice(1)}`;
const reverse = (r: Relationship) => (r in passive ? passive[r as keyof typeof passive] : `${r} (from)`);

/** Edges that act on a component in the control chain: who drives or controls it, who supplies it, who signals it. */
const UPSTREAM: readonly Relationship[] = ['drives', 'controls'];

/**
 * A component's neighbours, grouped:
 * - pipes and shafts (`Piped or coupled to`);
 * - power by port direction (`Supplied from`, `Supplies`, `Earthed with`, `Power`);
 * - signals by port direction (`Receives signal from`, `Sends signal to`, `Signal` when bidirectional);
 * - network (`Network`);
 * - each association relationship both ways (`Controls` / `Controlled by`, …).
 *
 * The chain walks upstream, breadth first: who drives or controls it, who supplies its power inputs and
 * who sends to its signal inputs, then the same for each of those. Empty groups are left out.
 */
export function describeRelations(scene: ScadaScene, componentId: string, registry: ComponentRegistry = builtInRegistry): Relations {
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  if (!byId.has(componentId)) return { groups: [], chain: [] };
  const label = (id: string): RelatedComponent => ({ id, label: byId.get(id)?.name ?? id });
  const portOf = (instanceId: string, portId: string) => {
    const c = byId.get(instanceId);
    return c && registry.definitionFor(c.type, c.properties).ports.find((p) => p.id === portId);
  };

  /** Neighbours of `id`: group key and label, and whether the neighbour acts on `id` (for the chain). */
  const around = (id: string) => {
    const found: { key: string; label: string; other: string; upstream: boolean }[] = [];
    for (const c of scene.connections) {
      for (const [self, other] of [[c.from, c.to], [c.to, c.from]] as const) {
        if (self.instanceId !== id) continue;
        const port = portOf(id, self.portId);
        if (!port) continue;
        const flow = portFlow(port);
        if (port.kind === 'fluid' || port.kind === 'mechanical') found.push({ key: 'physical', label: 'Piped or coupled to', other: other.instanceId, upstream: false });
        else if (port.kind === 'power' || port.kind === 'electrical') {
          if (port.power?.kind === 'PE') found.push({ key: 'earth', label: 'Earthed with', other: other.instanceId, upstream: false });
          else if (flow === 'in') found.push({ key: 'power-from', label: 'Supplied from', other: other.instanceId, upstream: true });
          else if (flow === 'out') found.push({ key: 'power-to', label: 'Supplies', other: other.instanceId, upstream: false });
          else found.push({ key: 'power', label: 'Power', other: other.instanceId, upstream: false });
        } else if (port.kind === 'signal') {
          if (flow === 'in') found.push({ key: 'signal-from', label: 'Receives signal from', other: other.instanceId, upstream: true });
          else if (flow === 'out') found.push({ key: 'signal-to', label: 'Sends signal to', other: other.instanceId, upstream: false });
          else found.push({ key: 'signal', label: 'Signal', other: other.instanceId, upstream: false });
        } else found.push({ key: 'network', label: 'Network', other: other.instanceId, upstream: false });
      }
    }
    for (const a of scene.associations ?? []) {
      if (a.from === id) found.push({ key: `association:${a.relationship}:out`, label: active(a.relationship), other: a.to, upstream: false });
      if (a.to === id) found.push({ key: `association:${a.relationship}:in`, label: reverse(a.relationship), other: a.from, upstream: UPSTREAM.includes(a.relationship) });
    }
    return found;
  };

  const groups: RelationGroup[] = [];
  for (const f of around(componentId)) {
    let group = groups.find((g) => g.key === f.key);
    if (!group) groups.push((group = { key: f.key, label: f.label, components: [] }));
    if (!group.components.some((c) => c.id === f.other)) group.components.push(label(f.other));
  }

  const seen = new Set([componentId]);
  const chain: RelatedComponent[] = [];
  for (let queue = [componentId]; queue.length > 0; ) {
    const next: string[] = [];
    for (const id of queue) {
      for (const f of around(id)) {
        if (!f.upstream || seen.has(f.other)) continue;
        seen.add(f.other);
        chain.push(label(f.other));
        next.push(f.other);
      }
    }
    queue = next;
  }
  return { groups, chain };
}
