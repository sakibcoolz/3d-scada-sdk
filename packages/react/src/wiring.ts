import { checkPorts, matesPhysically, portCapacity, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { describeRating } from './ports.js';

// The wiring picker's model (ADR-0027, T-088): every port another component offers in the same domain,
// with whether it can be wired to this one and, if not, why. Core's `connect` still decides; this only
// explains the choices in advance. Pipes and shafts mate physically and are not wired here.

export interface WiringCandidate {
  componentId: string;
  /** Name, else id. Display text only. */
  componentLabel: string;
  portId: string;
  terminal?: string;
  rating: string;
  ok: boolean;
  /** Why it cannot be chosen, as a sentence fragment, e.g. "400 V cannot connect to 230 V". */
  reason?: string;
}

const plural = (n: number) => (n === 1 ? '1 connection' : `${n} connections`);

/** Whether a port is wired (power, signal, network) rather than mated (fluid, mechanical, legacy electrical). */
export function isWiredPort(port: { kind: string }): boolean {
  return !matesPhysically(port as never);
}

/**
 * The ports another component could be wired to from `componentId`/`portId`: same kind, other
 * components only, in scene and port order with the choosable ones first. Undefined when the port does
 * not exist or is not wired.
 */
export function wiringCandidates(scene: ScadaScene, componentId: string, portId: string, registry: ComponentRegistry = builtInRegistry): WiringCandidate[] | undefined {
  const component = scene.components.find((c) => c.id === componentId);
  const port = component && registry.definitionFor(component.type, component.properties).ports.find((p) => p.id === portId);
  if (!component || !port || !isWiredPort(port)) return undefined;
  const used = new Map<string, number>();
  const pairs = new Set<string>();
  const key = (instanceId: string, id: string) => JSON.stringify([instanceId, id]);
  for (const c of scene.connections) {
    for (const end of [c.from, c.to]) used.set(key(end.instanceId, end.portId), (used.get(key(end.instanceId, end.portId)) ?? 0) + 1);
    pairs.add(JSON.stringify([key(c.from.instanceId, c.from.portId), key(c.to.instanceId, c.to.portId)].sort()));
  }
  const self = key(componentId, portId);
  const candidates: WiringCandidate[] = [];
  for (const other of scene.components) {
    if (other.id === componentId) continue;
    for (const p of registry.definitionFor(other.type, other.properties).ports) {
      if (p.kind !== port.kind) continue;
      const here = key(other.id, p.id);
      const check = checkPorts(port, p);
      const full = (used.get(here) ?? 0) >= portCapacity(p);
      const reason = pairs.has(JSON.stringify([self, here].sort()))
        ? 'already wired to this port'
        : !check.ok ? check.reason
        : full ? `already has ${plural(portCapacity(p))}, its maximum`
        : undefined;
      candidates.push({
        componentId: other.id,
        componentLabel: other.name ?? other.id,
        portId: p.id,
        ...(p.terminal ? { terminal: p.terminal } : {}),
        rating: describeRating(p),
        ok: reason === undefined,
        ...(reason ? { reason } : {}),
      });
    }
  }
  return [...candidates.filter((c) => c.ok), ...candidates.filter((c) => !c.ok)];
}

/**
 * Parses a connection property value typed in the editor: a finite number, `true`/`false`, else the
 * text itself. The document's own rules (length, credential-like keys) are checked on commit.
 */
export function parsePropertyValue(text: string): number | boolean | string {
  const trimmed = text.trim();
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return text;
}
