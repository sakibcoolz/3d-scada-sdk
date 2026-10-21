import { Quaternion, Vector3 } from 'three';
import type { ComponentInstance, Vector3Tuple } from '@sakibcoolz/core';

const UP = new Vector3(0, 1, 0);
const FINE = 0.1;
const COARSE = 1;

/** Rounds away float noise such as 0.30000000000000004 (micrometre resolution). */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Keyboard alternative to the gizmos for the selected component: arrows move in X/Z (Shift for
 * 1 m), PageUp/PageDown move in Y, R/Shift+R turn ±90° about world Y. Returns undefined for other keys.
 * "Up" moves away from the default camera (−Z).
 */
export function nudge(
  component: Pick<ComponentInstance, 'position' | 'rotation'>,
  event: { key: string; shiftKey: boolean },
): Pick<ComponentInstance, 'position' | 'rotation'> | undefined {
  const step = event.shiftKey ? COARSE : FINE;
  const moves: Record<string, Vector3Tuple> = {
    ArrowRight: [step, 0, 0],
    ArrowLeft: [-step, 0, 0],
    ArrowUp: [0, 0, -step],
    ArrowDown: [0, 0, step],
    PageUp: [0, step, 0],
    PageDown: [0, -step, 0],
  };
  const move = moves[event.key];
  if (move) {
    const { x, y, z } = component.position;
    return { position: { x: clean(x + move[0]), y: clean(y + move[1]), z: clean(z + move[2]) }, rotation: component.rotation };
  }
  if (event.key.toLowerCase() === 'r') {
    const turn = new Quaternion().setFromAxisAngle(UP, event.shiftKey ? -Math.PI / 2 : Math.PI / 2);
    const { x, y, z, w } = component.rotation;
    const turned = new Quaternion(x, y, z, w).premultiply(turn).normalize();
    return { position: component.position, rotation: { x: turned.x, y: turned.y, z: turned.z, w: turned.w } };
  }
  return undefined;
}
