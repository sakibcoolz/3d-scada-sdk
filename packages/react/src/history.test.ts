import { describe, expect, it } from 'vitest';
import { createEmptyScene, type ScadaScene } from '@scada3d/core';
import { canRedo, canUndo, commit, createHistory, redo, undo } from './history.js';

/** Distinct scenes, told apart by how many components they have. */
function scene(n: number): ScadaScene {
  return {
    ...createEmptyScene(),
    components: Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      type: 'valve',
      position: { x: i, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
    })),
  };
}
const size = (s: ScadaScene) => s.components.length;

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory(scene(0));
    expect(size(h.present)).toBe(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('undoes and redoes commits in order', () => {
    let h = createHistory(scene(0));
    h = commit(h, scene(1));
    h = commit(h, scene(2));
    h = undo(h);
    expect(size(h.present)).toBe(1);
    h = undo(h);
    expect(size(h.present)).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect(size(h.present)).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  it('returns exactly the earlier scene objects', () => {
    const first = scene(1);
    let h = commit(createHistory(scene(0)), first);
    h = commit(h, scene(2));
    expect(undo(h).present).toBe(first);
  });

  it('ignores undo and redo at the ends', () => {
    const h = createHistory(scene(0));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('ignores a commit that does not change the scene', () => {
    const h = createHistory(scene(0));
    expect(commit(h, h.present)).toBe(h);
  });

  it('drops the redo branch on a new edit after undo', () => {
    let h = commit(createHistory(scene(0)), scene(1));
    h = commit(h, scene(2));
    h = undo(h);
    h = commit(h, scene(5));
    expect(canRedo(h)).toBe(false);
    expect(size(undo(h).present)).toBe(1);
  });

  it('merges consecutive commits with the same key into one step', () => {
    let h = createHistory(scene(0));
    h = commit(h, scene(1), 'drag:c0:1');
    h = commit(h, scene(2), 'drag:c0:1');
    h = commit(h, scene(3), 'drag:c0:1');
    expect(size(h.present)).toBe(3);
    h = undo(h);
    expect(size(h.present)).toBe(0);
    expect(canUndo(h)).toBe(false);
  });

  it('starts a new step when the key changes or is absent', () => {
    let h = createHistory(scene(0));
    h = commit(h, scene(1), 'drag:c0:1');
    h = commit(h, scene(2), 'drag:c0:2');
    h = commit(h, scene(3));
    h = commit(h, scene(4));
    expect([undo(h), undo(undo(h)), undo(undo(undo(h)))].map((x) => size(x.present))).toEqual([3, 2, 1]);
  });

  it('does not merge into a state reached by undo', () => {
    let h = createHistory(scene(0));
    h = commit(h, scene(1), 'level:c0');
    h = commit(h, scene(2), 'other');
    h = undo(h);
    h = commit(h, scene(7), 'level:c0');
    expect(size(undo(h).present)).toBe(1);
  });

  it('keeps at most the configured number of undo steps', () => {
    let h = createHistory(scene(0), 3);
    for (let i = 1; i <= 6; i++) h = commit(h, scene(i));
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(3);
    expect(size(h.present)).toBe(3);
  });

  it('never mutates a previous history value', () => {
    const h0 = createHistory(scene(0));
    const h1 = commit(h0, scene(1));
    const snapshot = { past: [...h1.past], present: h1.present, future: [...h1.future] };
    undo(h1);
    commit(h1, scene(4));
    expect({ past: h1.past, present: h1.present, future: h1.future }).toEqual(snapshot);
    expect(h0.past).toEqual([]);
  });
});
