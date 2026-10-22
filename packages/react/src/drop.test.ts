import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { validateScene, type ComponentKind, type ScadaScene, type Vector3Like, type Vector3Tuple } from '@sakibcoolz/core';
import { asme, catalogResolvers, componentCatalog } from '@sakibcoolz/components';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane } from './drop.js';

const resolvePorts = catalogResolvers.resolvePorts;
/** Half the DN150 valve's B16.10 face-to-face, and its height above the ground when it rests there. */
const VALVE_HALF = asme.DN150.valveFaceToFace / 2;
const VALVE_Y = -componentCatalog.valve.bounds.min[1];

function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function expectClose(actual: Vector3Tuple, expected: Vector3Tuple): void {
  actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 9));
}

function expectVectorClose(actual: Vector3Like, expected: Vector3Like): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

const tankOnGround = (): ScadaScene => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [{ id: 'tank', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
  connections: [],
});

describe('screenToPlane', () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 };

  function camera(position: Vector3Tuple, target: Vector3Tuple): PerspectiveCamera {
    const c = new PerspectiveCamera(50, rect.width / rect.height, 0.1, 1000);
    c.position.set(...position);
    c.lookAt(...target);
    c.updateMatrixWorld();
    c.updateProjectionMatrix();
    return c;
  }

  it('hits the point the camera looks at from the screen centre', () => {
    const hit = screenToPlane({ x: 500, y: 250 }, rect, camera([7, 6, 9], [2, 0, -1]));
    expect(hit).not.toBeNull();
    expectClose(hit!, [2, 0, -1]);
  });

  it('hits further right on the plane when the pointer moves right', () => {
    const c = camera([0, 10, 10], [0, 0, 0]);
    const centre = screenToPlane({ x: 500, y: 250 }, rect, c)!;
    const right = screenToPlane({ x: 700, y: 250 }, rect, c)!;
    expect(right[0]).toBeGreaterThan(centre[0]);
    expect(right[1]).toBeCloseTo(0, 9);
  });

  it('intersects a raised plane', () => {
    const hit = screenToPlane({ x: 500, y: 250 }, rect, camera([0, 10, 10], [0, 2, 0]), 2);
    expectClose(hit!, [0, 2, 0]);
  });

  it('returns null when the ray points away from the plane', () => {
    expect(screenToPlane({ x: 500, y: 250 }, rect, camera([0, 5, 0], [0, 10, -1]))).toBeNull();
  });
});

describe('dropPosition', () => {
  it('rests the component bounds on the plane at the hit point', () => {
    expectVectorClose(dropPosition(componentCatalog.tank, [3, 0, -2]), { x: 3, y: 1.535, z: -2 });
    expectVectorClose(dropPosition(componentCatalog.valve, [1, 0, 0]), { x: 1, y: VALVE_Y, z: 0 });
    expectVectorClose(dropPosition(componentCatalog.tank, [0, 2, 0]), { x: 0, y: 3.535, z: 0 });
  });
});

describe('planDrop', () => {
  it('places a new component on the plane when nothing is in reach', () => {
    const plan = planDrop({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components: [], connections: [] }, 'tank', [0, 0, 0], { createId: counter('c') });
    expect(plan.component).toEqual({ id: 'c1', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
    expect(plan.snap).toEqual({ ok: false, reason: 'NO_CANDIDATE' });
  });

  it('snaps a valve dropped beside the tank outlet onto it', () => {
    // Valve inlet lands at (1.2, VALVE_Y, 0); the tank outlet is at (1.2, 0.635, 0).
    const plan = planDrop(tankOnGround(), 'valve', [1.2 + VALVE_HALF, 0, 0], { createId: counter('c') });
    expect(plan.snap.ok).toBe(true);
    expectVectorClose(plan.component.position, { x: 1.2 + VALVE_HALF, y: 0.635, z: 0 });
    if (plan.snap.ok) {
      expect(plan.snap.connection).toEqual({ from: { instanceId: 'c1', portId: 'in' }, to: { instanceId: 'tank', portId: 'outlet' } });
    }
  });

  it('keeps the plane position when the nearest port cannot connect', () => {
    const scene: ScadaScene = {
      ...tankOnGround(),
      components: [...tankOnGround().components, { id: 'v0', type: 'valve', position: { x: 9, y: 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
      connections: [{ id: 'e0', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'v0', portId: 'in' } }],
    };
    // Dropped on a plane 8 cm up, so the valve centre is 0.2 m up, within reach of the outlet.
    const plan = planDrop(scene, 'valve', [1.2 + VALVE_HALF, 0.08, 0], { createId: counter('c') });
    expect(plan.snap).toEqual(expect.objectContaining({ ok: false, nearest: expect.objectContaining({ status: 'occupied' }) }));
    expectVectorClose(plan.component.position, { x: 1.2 + VALVE_HALF, y: 0.08 + VALVE_Y, z: 0 });
  });

  it('starts properties from the editor defaults for the kind', () => {
    const plan = planDrop(tankOnGround(), 'valve', [20, 0, 0], { createId: counter('c'), properties: { open: true } });
    expect(plan.component.properties).toEqual({ open: true });
  });
});

describe('applyDrop', () => {
  it('adds an unsnapped component without touching connections or the input', () => {
    const scene = tankOnGround();
    const snapshot = structuredClone(scene);
    const plan = planDrop(scene, 'pipe', [20, 0, 0], { createId: counter('c') });
    const result = applyDrop(scene, plan, counter('e'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.components.map((c) => c.id)).toEqual(['tank', 'c1']);
    expect(result.scene.connections).toEqual([]);
    expect(scene).toEqual(snapshot);
  });

  it('adds the snapped component and its connection as one valid change', () => {
    const plan = planDrop(tankOnGround(), 'valve', [1.2 + VALVE_HALF, 0, 0], { createId: counter('c') });
    const result = applyDrop(tankOnGround(), plan, counter('e'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connections).toEqual([
      { id: 'e1', from: { instanceId: 'c1', portId: 'in' }, to: { instanceId: 'tank', portId: 'outlet' } },
    ]);
    expect(validateScene(result.scene, { resolvePorts }).ok).toBe(true);
  });

  it('rejects a component id that already exists', () => {
    const plan = planDrop(tankOnGround(), 'valve', [20, 0, 0], { createId: () => 'tank' });
    expect(applyDrop(tankOnGround(), plan, counter('e'))).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'DUPLICATE_COMPONENT_ID' }),
    });
  });
});

describe('describeDrop', () => {
  it('names the ports a snap will connect', () => {
    const plan = planDrop(tankOnGround(), 'valve', [1.2 + VALVE_HALF, 0, 0], { createId: counter('c') });
    expect(describeDrop(plan, tankOnGround())).toBe('Connects Ball Valve "in" to Vertical Tank "outlet"');
  });

  it('explains why the nearest port cannot connect', () => {
    const scene: ScadaScene = {
      ...tankOnGround(),
      components: [...tankOnGround().components, { id: 'v0', type: 'valve', position: { x: 9, y: 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
      connections: [{ id: 'e0', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'v0', portId: 'in' } }],
    };
    expect(describeDrop(planDrop(scene, 'valve', [1.2 + VALVE_HALF, 0.08, 0], { createId: counter('c') }), scene)).toBe(
      'Cannot connect "in" to Vertical Tank "outlet": port already connected',
    );
  });

  it('says where a free placement lands', () => {
    expect(describeDrop(planDrop(tankOnGround(), 'pipe', [20, 0, -3.25], { createId: counter('c') }), tankOnGround())).toBe(
      'Place Straight Pipe at (20.00, -3.25)',
    );
  });
});

describe('planDrop with pipe sizes', () => {
  const reducerScene = (): ScadaScene => ({
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: 'r', type: 'reducer', position: { x: 0, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} }],
    connections: [],
  });

  it('gives a dropped pipe the size of the port it snaps to', () => {
    const plan = planDrop(reducerScene(), 'pipe', [1.2, 0, 0], { createId: () => 'p', properties: { length: 2 } });
    expect(plan.snap.ok).toBe(true);
    expect(plan.component.properties).toEqual({ length: 2, size: 'DN100' });
    if (plan.snap.ok) expect(plan.snap.connection.to).toEqual({ instanceId: 'r', portId: 'out' });
    const applied = applyDrop(reducerScene(), plan, () => 'c');
    expect(applied.ok).toBe(true);
  });

  it('sizes only the nozzle that snaps: a pump dropped on the DN100 outlet gets a DN100 suction', () => {
    const outletX = 0.07; // reducer "out", DN150 → DN100 (B16.9 H = 140 mm)
    const plan = planDrop(reducerScene(), 'pump', [outletX + 0.6, 0, 0], { createId: () => 'u' });
    expect(plan.snap.ok).toBe(true);
    expect(plan.component.properties).toEqual({ suctionSize: 'DN100' });
    if (plan.snap.ok) expect(plan.snap.connection).toEqual({ from: { instanceId: 'u', portId: 'suction' }, to: { instanceId: 'r', portId: 'out' } });
    expect(applyDrop(reducerScene(), plan, () => 'c').ok).toBe(true);
  });
});

describe('planDrop next to a raised port (snap in plan view)', () => {
  // A tank on a 0.8 m stand: its outlet is 1.435 m up, far above a part dropped on the ground.
  const raised = (): ScadaScene => ({
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    components: [{ id: 't', type: 'tank', position: { x: 0, y: 2.335, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { standHeight: 0.8 } }],
    connections: [],
  });

  it('lifts a part dropped on the ground below the outlet and snaps it on', () => {
    const plan = planDrop(raised(), 'valve', [1.25 + VALVE_HALF, 0, 0.1], { createId: () => 'v' });
    expect(plan.snap.ok).toBe(true);
    if (plan.snap.ok) expect(plan.snap.connection.to).toEqual({ instanceId: 't', portId: 'outlet' });
    expect(plan.component.position.y).toBeCloseTo(1.435, 9);
    expect(applyDrop(raised(), plan, () => 'c').ok).toBe(true);
  });

  it('does not reach a port that is far away in plan', () => {
    const plan = planDrop(raised(), 'valve', [4, 0, 0], { createId: () => 'v' });
    expect(plan.snap.ok).toBe(false);
    expect(plan.component.position.y).toBeCloseTo(VALVE_Y, 9);
  });
});
