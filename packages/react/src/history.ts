import type { ScadaScene } from '@sakibcoolz/core';

/**
 * Immutable editor history of whole scenes. Scenes are immutable values that share unchanged
 * parts, so a snapshot per step is cheap and undo restores exactly the earlier object.
 */
export interface History {
  readonly past: readonly ScadaScene[];
  readonly present: ScadaScene;
  readonly future: readonly ScadaScene[];
  /** Key of the last commit; a following commit with the same key replaces it instead of adding a step. */
  readonly mergeKey?: string;
  readonly limit: number;
}

export function createHistory(initial: ScadaScene, limit = 100): History {
  return { past: [], present: initial, future: [], limit };
}

/**
 * Records `next` as the new present. Pass the same `mergeKey` for every update of one gesture
 * (a gizmo drag, a slider move) so the gesture undoes as one step. Any commit clears redo.
 */
export function commit(history: History, next: ScadaScene, mergeKey?: string): History {
  if (next === history.present) return history;
  if (mergeKey !== undefined && mergeKey === history.mergeKey) {
    return { ...history, present: next, future: [] };
  }
  const past = [...history.past, history.present].slice(-history.limit);
  return { past, present: next, future: [], mergeKey, limit: history.limit };
}

export function undo(history: History): History {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redo(history: History): History {
  if (history.future.length === 0) return history;
  const [next, ...rest] = history.future;
  return { past: [...history.past, history.present], present: next, future: rest, limit: history.limit };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;
