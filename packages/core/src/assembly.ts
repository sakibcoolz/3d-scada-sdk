import { reachableComponents } from './graph.js';
import { multiplyQuaternions, normalizeQuaternion, rotateVector } from './quaternion.js';
import type { ComponentInstance, QuaternionLike, ScadaScene, Vector3Like } from './scene.js';
import { quaternionToTuple, tupleToQuaternion } from './vectors.js';

// Assemblies (ADR-0008): children carry `parentId`; a root and all its descendants move rigidly.

function rootOf(scene: ScadaScene, id: string): string {
  const parents = new Map(scene.components.map((c) => [c.id, c.parentId]));
  let root = id;
  for (let steps = 0; parents.get(root) !== undefined && steps <= scene.components.length; steps++) root = parents.get(root)!;
  return root;
}

/** Ids of the whole assembly containing `id` (its root and every descendant), in scene order. */
export function assemblyOf(scene: ScadaScene, id: string): string[] {
  const root = rootOf(scene, id);
  const members = new Set([root]);
  // Parents can appear after their children in the list, so repeat until nothing is added.
  for (let added = true; added; ) {
    added = false;
    for (const c of scene.components) {
      if (c.parentId !== undefined && members.has(c.parentId) && !members.has(c.id)) {
        members.add(c.id);
        added = true;
      }
    }
  }
  return scene.components.filter((c) => members.has(c.id)).map((c) => c.id);
}

/**
 * Gives member `id` a new pose and applies the same rigid motion to the rest of its assembly:
 * every member keeps its offset and relative rotation, so joined ports stay joined. A component
 * outside any assembly simply moves on its own.
 */
export function moveAssembly(scene: ScadaScene, id: string, position: Vector3Like, rotation: QuaternionLike): ScadaScene {
  const moving = scene.components.find((c) => c.id === id);
  if (!moving) return scene;
  const members = new Set(assemblyOf(scene, id));
  const [x, y, z, w] = quaternionToTuple(moving.rotation);
  const delta = normalizeQuaternion(multiplyQuaternions(quaternionToTuple(rotation), [-x, -y, -z, w]));
  const place = (c: ComponentInstance): ComponentInstance => {
    if (c.id === id) return { ...c, position, rotation };
    const offset = rotateVector([c.position.x - moving.position.x, c.position.y - moving.position.y, c.position.z - moving.position.z], delta);
    return {
      ...c,
      position: { x: position.x + offset[0], y: position.y + offset[1], z: position.z + offset[2] },
      rotation: tupleToQuaternion(normalizeQuaternion(multiplyQuaternions(delta, quaternionToTuple(c.rotation)))),
    };
  };
  return { ...scene, components: scene.components.map((c) => (members.has(c.id) ? place(c) : c)) };
}

export type AssemblyResult = { ok: true; scene: ScadaScene } | { ok: false; error: { code: 'UNKNOWN_INSTANCE' | 'NOTHING_CONNECTED'; message: string } };

/**
 * Makes `id` an assembly root and locks every component connected to it (through any path of
 * connections) as its child. Earlier locks among those components are replaced.
 */
export function lockConnectedAsChildren(scene: ScadaScene, id: string): AssemblyResult {
  if (!scene.components.some((c) => c.id === id)) return { ok: false, error: { code: 'UNKNOWN_INSTANCE', message: `No component "${id}".` } };
  const connected = new Set(reachableComponents(scene, id).filter((other) => other !== id));
  if (connected.size === 0) return { ok: false, error: { code: 'NOTHING_CONNECTED', message: 'Nothing is connected to this component.' } };
  const components = scene.components.map((c) => {
    if (c.id === id) {
      const { parentId: _, ...root } = c;
      return root;
    }
    return connected.has(c.id) ? { ...c, parentId: id } : c;
  });
  return { ok: true, scene: { ...scene, components } };
}

/** Frees `id` from its parent, and frees `id`'s own children, so neither moves with the other any more. */
export function unlockFromParent(scene: ScadaScene, id: string): ScadaScene {
  return {
    ...scene,
    components: scene.components.map((c) => {
      if (c.id !== id && c.parentId !== id) return c;
      const { parentId: _, ...free } = c;
      return free;
    }),
  };
}
