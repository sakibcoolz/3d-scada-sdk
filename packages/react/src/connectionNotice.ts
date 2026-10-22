import { assemblyOf, type ComponentType, type OpenJoint, type ScadaScene, type SceneConnection } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';

/** Display names in scene order: "Ball Valve 1", "Ball Valve 2", … */
export function componentNames(scene: ScadaScene, registry: ComponentRegistry = builtInRegistry): Map<string, string> {
  const seen = new Map<ComponentType, number>();
  return new Map(scene.components.map((c) => {
    const n = (seen.get(c.type) ?? 0) + 1;
    seen.set(c.type, n);
    return [c.id, `${registry.definitionFor(c.type).label} ${n}`];
  }));
}

/** The root of the assembly holding `id`, or undefined when `id` stands alone. */
function assemblyRoot(scene: ScadaScene, id: string): string | undefined {
  const members = assemblyOf(scene, id);
  if (members.length < 2) return undefined;
  return members.find((m) => scene.components.find((c) => c.id === m)?.parentId === undefined);
}

const MAX_LINES = 5;

/**
 * One line per connection in `after` that was not in `before`: which ports met and, when an
 * assembly is involved, whether the parts now move together. At most five lines, then a count.
 */
export function describeNewConnections(before: ScadaScene, after: ScadaScene, registry: ComponentRegistry = builtInRegistry): string[] {
  const existing = new Set(before.connections.map((c) => c.id));
  const added = after.connections.filter((c) => !existing.has(c.id));
  const names = componentNames(after, registry);
  const lines = added.map((c) => {
    const from = c.from.instanceId, to = c.to.instanceId;
    const line = `${names.get(from)} "${c.from.portId}" connected to ${names.get(to)} "${c.to.portId}".`;
    const [rootA, rootB] = [assemblyRoot(after, from), assemblyRoot(after, to)];
    if (rootA === rootB) return line;
    if (rootA && rootB) return `${line} This joins the ${names.get(rootA)} and ${names.get(rootB)} assemblies; they still move separately until locked into one.`;
    const [root, loose] = rootA ? [rootA, to] : [rootB!, from];
    return `${line} ${names.get(loose)} is not locked to the ${names.get(root)} assembly yet; use "Lock connected as children" on ${names.get(root)} to move them together.`;
  });
  if (lines.length <= MAX_LINES) return lines;
  const rest = lines.length - MAX_LINES;
  return [...lines.slice(0, MAX_LINES), `…and ${rest} more connection${rest === 1 ? '' : 's'}.`];
}

/** What "Lock connected as children" did to `parentId`. */
export function describeLock(after: ScadaScene, parentId: string, registry: ComponentRegistry = builtInRegistry): string {
  const names = componentNames(after, registry);
  const children = after.components.filter((c) => c.parentId === parentId).length;
  return `${names.get(parentId)} is now the parent of ${children} component${children === 1 ? '' : 's'}; moving any of them moves the whole assembly.`;
}

/** "15 mm" below a metre, "2.00 m" from there on. */
export function formatDistance(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 1000)} mm` : `${metres.toFixed(2)} m`;
}

/** One line for a connection whose ports do not meet (see `findOpenJoints`). */
export function describeOpenJoint(open: OpenJoint, names: Map<string, string>): string {
  const ends = `${names.get(open.from.instanceId)} "${open.from.portId}" → ${names.get(open.to.instanceId)} "${open.to.portId}"`;
  const apart = formatDistance(open.distance);
  if (open.angle > (3 * Math.PI) / 4) return `${ends}: ports face the wrong way (${apart} apart)`;
  if (open.angle > Math.PI / 180) return `${ends}: ports do not face each other (${apart} apart)`;
  return open.problem === 'too-short' ? `${ends}: ${apart} apart, too short for a pipe` : `${ends}: ${apart} apart, no pipe can be drawn`;
}

/** At most five open-joint lines, then a count of the rest. */
export function describeOpenJoints(open: readonly OpenJoint[], names: Map<string, string>): string[] {
  const lines = open.map((o) => describeOpenJoint(o, names));
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `…and ${lines.length - MAX_LINES} more`] : lines;
}

/** What "Seat on …" did. */
export function describeSeat(scene: ScadaScene, connectionId: string, instanceId: string, moved: number, registry: ComponentRegistry = builtInRegistry): string {
  const names = componentNames(scene, registry);
  const c = scene.connections.find((x) => x.id === connectionId)!;
  const [own, partner] = c.from.instanceId === instanceId ? [c.from, c.to] : [c.to, c.from];
  return `Seated ${names.get(own.instanceId)} "${own.portId}" on ${names.get(partner.instanceId)} "${partner.portId}" (moved ${formatDistance(moved)}).`;
}

/** What Shift+click attach did: the moved part's port, the fixed part's port, and how far it moved. */
export function describeAttach(scene: ScadaScene, connection: SceneConnection, moved: number, registry: ComponentRegistry = builtInRegistry): string {
  const names = componentNames(scene, registry);
  const { from, to } = connection;
  return `Attached ${names.get(from.instanceId)} "${from.portId}" to ${names.get(to.instanceId)} "${to.portId}" (moved ${formatDistance(moved)}).`;
}
