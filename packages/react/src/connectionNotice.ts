import { assemblyOf, type ComponentKind, type ScadaScene } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

/** Display names in scene order: "Ball Valve 1", "Ball Valve 2", … */
export function componentNames(scene: ScadaScene): Map<string, string> {
  const seen = new Map<ComponentKind, number>();
  return new Map(scene.components.map((c) => {
    const n = (seen.get(c.type) ?? 0) + 1;
    seen.set(c.type, n);
    return [c.id, `${componentCatalog[c.type].label} ${n}`];
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
export function describeNewConnections(before: ScadaScene, after: ScadaScene): string[] {
  const existing = new Set(before.connections.map((c) => c.id));
  const added = after.connections.filter((c) => !existing.has(c.id));
  const names = componentNames(after);
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
export function describeLock(after: ScadaScene, parentId: string): string {
  const names = componentNames(after);
  const children = after.components.filter((c) => c.parentId === parentId).length;
  return `${names.get(parentId)} is now the parent of ${children} component${children === 1 ? '' : 's'}; moving any of them moves the whole assembly.`;
}
