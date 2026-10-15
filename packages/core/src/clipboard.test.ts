import { describe, expect, it } from 'vitest';
import {
  clipboardWidth,
  copyComponents,
  createEmptyScene,
  pasteComponents,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type ConnectionPort,
  type ScadaScene,
  type Vector3Tuple,
} from './index.js';

const fluid = (id: string, x: number, dir: 1 | -1): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = { pipe: [fluid('in', -1, -1), fluid('out', 1, 1)], valve: [fluid('in', -0.6, -1), fluid('out', 0.6, 1)] };
const bounds: Partial<Record<ComponentKind, { min: Vector3Tuple; max: Vector3Tuple }>> = {
  pipe: { min: [-1, -0.084, -0.084], max: [1, 0.084, 0.084] },
  valve: { min: [-0.6, -0.2, -0.2], max: [0.6, 0.495, 0.2] },
};
const options = { resolvePorts: (t: ComponentKind) => ports[t], resolveBounds: (t: ComponentKind) => bounds[t] };

const at = (id: string, type: ComponentKind, x: number, extra: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id,
  type,
  position: { x, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: { open: true },
  ...extra,
});
const edge = (id: string, a: [string, string], b: [string, string]) => ({ id, from: { instanceId: a[0], portId: a[1] }, to: { instanceId: b[0], portId: b[1] } });

/** Assembly a (parent) → b → c, joined; d is outside and joined to c; a tag binding on b. */
const plant = (): ScadaScene => ({
  ...createEmptyScene(),
  components: [at('a', 'pipe', 0), at('b', 'valve', 1.6, { parentId: 'a' }), at('c', 'pipe', 3.2, { parentId: 'a' }), at('d', 'valve', 4.8)],
  connections: [edge('e1', ['a', 'out'], ['b', 'in']), edge('e2', ['b', 'out'], ['c', 'in']), edge('e3', ['c', 'out'], ['d', 'in'])],
  tagBindings: [{ id: 't1', tagId: 'XV-1', kind: 'property', instanceId: 'b', property: 'open' }],
});

let n = 0;
const createId = () => `new${++n}`;

describe('copyComponents', () => {
  it('copies the parts with only the connections between them, keeping internal parent links', () => {
    const clip = copyComponents(plant(), ['a', 'b', 'c']);
    expect(clip.components.map((c) => [c.id, c.parentId])).toEqual([
      ['a', undefined],
      ['b', 'a'],
      ['c', 'a'],
    ]);
    expect(clip.connections.map((c) => c.id)).toEqual(['e1', 'e2']);
  });

  it('drops the parent link of a child copied without its parent', () => {
    expect(copyComponents(plant(), ['b']).components[0].parentId).toBeUndefined();
  });

  it('is a snapshot: later edits to the scene do not change it', () => {
    const scene = plant();
    const clip = copyComponents(scene, ['b']);
    scene.components[1].position.x = 99;
    expect(clip.components[0].position.x).toBe(1.6);
  });
});

describe('clipboardWidth', () => {
  it('is the world X extent of the copied parts', () => {
    expect(clipboardWidth(copyComponents(plant(), ['a', 'b', 'c']), options)).toBeCloseTo(5.2, 9); // x from -1 to 4.2
    expect(clipboardWidth(copyComponents(plant(), ['b']), options)).toBeCloseTo(1.2, 9);
  });
});

describe('pasteComponents', () => {
  it('adds copies with new ids, shifted, with internal connections and parent links remapped', () => {
    n = 0;
    const clip = copyComponents(plant(), ['a', 'b', 'c']);
    const result = pasteComponents(plant(), clip, { createId, offset: { x: 4.7, y: 0, z: 0 } });
    const pasted = result.scene.components.slice(4);
    expect(result.pastedIds).toEqual(['new1', 'new2', 'new3']);
    expect(pasted.map((c) => [c.id, c.type, c.parentId, c.position.x])).toEqual([
      ['new1', 'pipe', undefined, 4.7],
      ['new2', 'valve', 'new1', 6.300000000000001],
      ['new3', 'pipe', 'new1', 7.9],
    ]);
    expect(result.scene.connections.slice(3)).toEqual([
      edge('new4', ['new1', 'out'], ['new2', 'in']),
      edge('new5', ['new2', 'out'], ['new3', 'in']),
    ]);
  });

  it("does not copy tag bindings, so a copy never shows another part's live value", () => {
    const result = pasteComponents(plant(), copyComponents(plant(), ['b']), { createId, offset: { x: 0, y: 0, z: 3 } });
    expect(result.scene.tagBindings).toEqual(plant().tagBindings);
  });

  it('keeps properties and rotation, and leaves the original scene untouched', () => {
    const scene = plant();
    const before = structuredClone(scene);
    const result = pasteComponents(scene, copyComponents(scene, ['b']), { createId, offset: { x: 0, y: 0, z: 3 } });
    const copy = result.scene.components.at(-1)!;
    expect(copy.properties).toEqual({ open: true });
    expect(copy.position).toEqual({ x: 1.6, y: 0.5, z: 3 });
    expect(scene).toEqual(before);
  });

  it('produces a valid scene, and pasting twice gives distinct ids', () => {
    const clip = copyComponents(plant(), ['a', 'b', 'c']);
    const once = pasteComponents(plant(), clip, { createId, offset: { x: 5, y: 0, z: 0 } });
    const twice = pasteComponents(once.scene, clip, { createId, offset: { x: 10, y: 0, z: 0 } });
    expect(validateScene(twice.scene, options).ok).toBe(true);
    expect(new Set(twice.scene.components.map((c) => c.id)).size).toBe(10);
  });
});
