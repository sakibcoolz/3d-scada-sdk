import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ScadaScene } from '@sakibcoolz/core';
import { blocksAt, BODY_RADIUS, climb, EYE_HEIGHT, look, MAX_EYE, MAX_PITCH, MIN_EYE, moveKeyOf, moveWalker, RUN_SPEED, walkObstacles, walkStep, WALK_SPEED, type MoveKeys } from './walk.js';

const I = { x: 0, y: 0, z: 0, w: 1 };
const part = (id: string, type: ComponentInstance['type'], x: number, y: number, z: number, properties = {}): ComponentInstance =>
  ({ id, type, position: { x, y, z }, rotation: I, scale: { x: 1, y: 1, z: 1 }, properties });
const scene = (components: ComponentInstance[]): ScadaScene => ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components, connections: [] });
const keys = (k: Partial<MoveKeys>): MoveKeys => ({ forward: false, back: false, left: false, right: false, run: false, up: false, down: false, ...k });

describe('walkObstacles', () => {
  it('blocks a tank standing on the floor but not a pipe rack overhead or a part lying on the floor', () => {
    const ids = walkObstacles(scene([
      part('tank', 'tank', 0, 1.535, 0),
      part('rack', 'pipe', 5, 2.1336, 0, { length: 4 }),
      part('low', 'pipe', 10, 0.05, 0, { length: 4, size: 'DN25' }),
    ])).filter((o) => blocksAt(o, EYE_HEIGHT)).map((o) => o.id);
    expect(ids).toEqual(['tank']);
  });

  it('a pipe at waist height blocks', () => {
    const [pipe] = walkObstacles(scene([part('p', 'pipe', 0, 1, 0, { length: 4 })]));
    expect(blocksAt(pipe, EYE_HEIGHT)).toBe(true);
    // Risen well above it, the same pipe is underfoot.
    expect(blocksAt(pipe, 4)).toBe(false);
  });
});

describe('walkStep', () => {
  it('walks forward along −Z at yaw 0 and right along +X', () => {
    const f = walkStep(0, keys({ forward: true }), 1);
    expect(f.x).toBeCloseTo(0, 12);
    expect(f.z).toBeCloseTo(-WALK_SPEED, 12);
    const r = walkStep(0, keys({ right: true }), 1);
    expect(r.x).toBeCloseTo(WALK_SPEED, 12);
    expect(r.z).toBeCloseTo(0, 12);
  });

  it('runs faster, goes no faster on the diagonal, and stands still with no keys', () => {
    expect(Math.hypot(...Object.values(walkStep(0.3, keys({ forward: true, run: true }), 1)))).toBeCloseTo(RUN_SPEED, 12);
    expect(Math.hypot(...Object.values(walkStep(0.3, keys({ forward: true, left: true }), 1)))).toBeCloseTo(WALK_SPEED, 12);
    expect(walkStep(1, keys({}), 1)).toEqual({ x: 0, z: 0 });
    expect(walkStep(1, keys({ forward: true, back: true }), 1)).toEqual({ x: 0, z: 0 });
  });

  it('a quarter turn left faces −X', () => {
    const f = walkStep(Math.PI / 2, keys({ forward: true }), 1);
    expect(f.x).toBeCloseTo(-WALK_SPEED, 12);
  });
});

describe('moveWalker', () => {
  const wall = { id: 'w', minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -3, maxZ: -2 };
  it('stops at equipment, keeping the body radius', () => {
    const at = moveWalker({ x: 0, z: 0 }, { x: 0, z: -1.8 }, [wall]);
    expect(at).toEqual({ x: 0, z: 0 });
    const near = moveWalker({ x: 0, z: 0 }, { x: 0, z: -1.6 }, [wall]);
    expect(near.z).toBeCloseTo(-1.6, 12);
    expect(near.z).toBeGreaterThanOrEqual(wall.maxZ + BODY_RADIUS);
  });

  it('slides along equipment when walking into it at an angle', () => {
    const at = moveWalker({ x: 0, z: -1.6 }, { x: 0.5, z: -0.5 }, [wall]);
    expect(at).toEqual({ x: 0.5, z: -1.6 });
  });

  it('stays on the floor slab, and a walker inside equipment can walk out', () => {
    const slab = { centre: { x: 0, z: 0 }, width: 10, depth: 10 };
    expect(moveWalker({ x: 4.5, z: 0 }, { x: 1, z: 0 }, [], slab).x).toBe(4.5);
    expect(moveWalker({ x: 0, z: -2.5 }, { x: 0, z: 1 }, [wall]).z).toBe(-1.5);
  });
});

describe('moveWalker above the floor', () => {
  it('walks over equipment once risen above it', () => {
    const wall = { id: 'w', minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -3, maxZ: -2 };
    expect(moveWalker({ x: 0, z: 0 }, { x: 0, z: -4 }, [wall], undefined, 4).z).toBe(-4);
  });
});

describe('climb', () => {
  const at = { x: 0, z: 0 };
  it('Space rises and Alt sinks at walking speed, faster with Shift', () => {
    expect(climb(at, EYE_HEIGHT, keys({ up: true }), 1, [])).toBeCloseTo(EYE_HEIGHT + WALK_SPEED, 12);
    expect(climb(at, 5, keys({ down: true }), 1, [])).toBeCloseTo(5 - WALK_SPEED, 12);
    expect(climb(at, 5, keys({ up: true, run: true }), 1, [])).toBeCloseTo(5 + RUN_SPEED, 12);
    expect(climb(at, 5, keys({ up: true, down: true }), 1, [])).toBe(5);
  });
  it('stays between a crouch and the top limit', () => {
    expect(climb(at, MIN_EYE + 0.1, keys({ down: true }), 1, [])).toBe(MIN_EYE);
    expect(climb(at, MAX_EYE - 0.1, keys({ up: true }), 1, [])).toBe(MAX_EYE);
  });
  it('stops under equipment overhead and on top of equipment underfoot', () => {
    const rack = { id: 'rack', minX: -1, maxX: 1, minY: 2.05, maxY: 2.2, minZ: -1, maxZ: 1 };
    expect(climb(at, EYE_HEIGHT, keys({ up: true, run: true }), 1, [rack])).toBe(2.05);
    const tank = { id: 'tank', minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -1, maxZ: 1 };
    const standingOnTop = 3 + EYE_HEIGHT - 0.25;
    expect(climb(at, standingOnTop + 0.5, keys({ down: true, run: true }), 1, [tank])).toBeCloseTo(standingOnTop, 12);
    // Off to the side, nothing holds the walker.
    expect(climb({ x: 5, z: 0 }, EYE_HEIGHT, keys({ up: true }), 1, [rack])).toBeCloseTo(EYE_HEIGHT + WALK_SPEED, 12);
  });
});

describe('look and keys', () => {
  it('turns right for a mouse move right and clamps the pitch', () => {
    expect(look(0, 0, 100, 0).yaw).toBeLessThan(0);
    expect(look(0, 0, 0, -1e6).pitch).toBe(MAX_PITCH);
    expect(look(0, 0, 0, 1e6).pitch).toBe(-MAX_PITCH);
  });
  it('maps WASD, the arrows, Shift, Space and Alt', () => {
    expect(['KeyW', 'ArrowUp', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space', 'AltLeft', 'AltRight', 'KeyR'].map(moveKeyOf))
      .toEqual(['forward', 'forward', 'back', 'left', 'right', 'run', 'up', 'down', 'down', undefined]);
  });
});
