import { rotateVector } from './quaternion';
import type { ComponentInstance, ComponentKind, ScadaScene, SceneConnection, Vector3Like, Vector3Tuple } from './scene';
import { quaternionToTuple } from './vectors';

/** A snapshot of copied components and the connections between them. */
export interface ComponentClipboard {
  components: ComponentInstance[];
  connections: SceneConnection[];
}

const cloneComponent = (c: ComponentInstance): ComponentInstance => ({
  ...c,
  position: { ...c.position },
  rotation: { ...c.rotation },
  scale: { ...c.scale },
  properties: { ...c.properties },
});

/**
 * Copies components `ids` (in scene order) with the connections whose both ends are copied. A
 * parent link is kept only if the parent is copied too. Tag bindings are not copied: a copy must
 * not show another part's live value. The result does not share objects with the scene.
 */
export function copyComponents(scene: ScadaScene, ids: readonly string[]): ComponentClipboard {
  const set = new Set(ids);
  const components = scene.components
    .filter((c) => set.has(c.id))
    .map((c) => {
      const copy = cloneComponent(c);
      if (copy.parentId !== undefined && !set.has(copy.parentId)) delete copy.parentId;
      return copy;
    });
  const connections = scene.connections
    .filter((c) => set.has(c.from.instanceId) && set.has(c.to.instanceId))
    .map((c) => ({ id: c.id, from: { ...c.from }, to: { ...c.to } }));
  return { components, connections };
}

/** World X extent of the copied parts' boxes, used to paste beside the original without overlap. */
export function clipboardWidth(
  clipboard: ComponentClipboard,
  options: { resolveBounds: (type: ComponentKind, properties?: ComponentInstance['properties']) => { min: Vector3Tuple; max: Vector3Tuple } | undefined },
): number {
  let min = Infinity;
  let max = -Infinity;
  for (const c of clipboard.components) {
    const b = options.resolveBounds(c.type, c.properties);
    if (!b) {
      min = Math.min(min, c.position.x);
      max = Math.max(max, c.position.x);
      continue;
    }
    const q = quaternionToTuple(c.rotation);
    for (const x of [b.min[0], b.max[0]])
      for (const y of [b.min[1], b.max[1]])
        for (const z of [b.min[2], b.max[2]]) {
          const corner = rotateVector([x * c.scale.x, y * c.scale.y, z * c.scale.z], q);
          min = Math.min(min, c.position.x + corner[0]);
          max = Math.max(max, c.position.x + corner[0]);
        }
  }
  return Number.isFinite(min) ? max - min : 0;
}

/**
 * Adds the clipboard's components to the scene with new ids, shifted by `offset`, with their
 * internal connections and parent links remapped to the new ids. Returns the new component ids.
 */
export function pasteComponents(
  scene: ScadaScene,
  clipboard: ComponentClipboard,
  options: { createId: () => string; offset: Vector3Like },
): { scene: ScadaScene; pastedIds: string[] } {
  const ids = new Map(clipboard.components.map((c) => [c.id, options.createId()]));
  const components = clipboard.components.map((c) => {
    const copy = cloneComponent(c);
    copy.id = ids.get(c.id)!;
    if (c.parentId !== undefined) copy.parentId = ids.get(c.parentId);
    copy.position = { x: c.position.x + options.offset.x, y: c.position.y + options.offset.y, z: c.position.z + options.offset.z };
    return copy;
  });
  const connections = clipboard.connections.map((c) => ({
    id: options.createId(),
    from: { instanceId: ids.get(c.from.instanceId)!, portId: c.from.portId },
    to: { instanceId: ids.get(c.to.instanceId)!, portId: c.to.portId },
  }));
  return {
    scene: { ...scene, components: [...scene.components, ...components], connections: [...scene.connections, ...connections] },
    pastedIds: components.map((c) => c.id),
  };
}
