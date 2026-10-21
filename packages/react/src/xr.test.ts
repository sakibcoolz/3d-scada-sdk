import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { referenceOffset, sceneToTracked, snapTurn, SNAP_TURN, startPose, teleportHead, teleportTarget, trackedToScene, turnAboutHead } from './xr.js';

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe('startPose', () => {
  it('stands under the camera, facing the orbit target', () => {
    const pose = startPose({ x: 7, y: 6, z: 9 }, { x: 0, y: 0, z: 0 });
    expect([pose.x, pose.z]).toEqual([7, 9]);
    // Facing (−sin yaw, −cos yaw) points from the camera to the target in plan.
    const f = [-Math.sin(pose.yaw), -Math.cos(pose.yaw)];
    expect(f[0] * 9 - f[1] * 7).toBeCloseTo(0, 9);
    expect(f[0] * -7 + f[1] * -9).toBeGreaterThan(0);
  });

  it('keeps facing −Z when the camera looks straight down', () => {
    expect(startPose({ x: 1, y: 10, z: 2 }, { x: 1, y: 0, z: 2 }).yaw).toBe(0);
  });
});

describe('teleportTarget', () => {
  const slab = { centre: { x: 0, z: 0 }, width: 20, depth: 20 };
  it('lands a downward ray on the floor', () => {
    close(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -1, z: -1 }, slab)!, { x: 0, z: -1.5 });
  });
  it('refuses rays that point up or level, run past the range, or leave the slab', () => {
    expect(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0.2, z: -1 }, slab)).toBeUndefined();
    expect(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, slab)).toBeUndefined();
    expect(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -0.01, z: -1 })).toBeUndefined();
    expect(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -0.1, z: -1 }, slab)).toBeUndefined();
    expect(teleportTarget({ x: 0, y: 1.5, z: 0 }, { x: 0, y: -0.1, z: -1 })).toBeDefined();
  });
});

describe('reference offset', () => {
  it('is the inverse of the pose, so the tracking origin lands on the pose', () => {
    const pose = { x: 4, z: -3, yaw: 0.7 };
    const { position, orientation } = referenceOffset(pose);
    const q = new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
    expect(q.length()).toBeCloseTo(1, 12);
    // Offset maps scene → tracking: a tracked point p sits in the scene at M·p, and offset·(M·p) = p.
    const tracked = new Vector3(0.3, 1.6, -0.5);
    const inScene = trackedToScene(pose, tracked);
    const back = new Vector3(inScene.x, inScene.y, inScene.z).applyQuaternion(q).add(new Vector3(position.x, position.y, position.z));
    expect(back.distanceTo(tracked)).toBeLessThan(1e-9);
  });
  it('sceneToTracked undoes trackedToScene', () => {
    const pose = { x: -2, z: 5, yaw: -2.3 };
    const p = { x: 1.25, y: 1.6, z: -0.75 };
    const back = sceneToTracked(pose, trackedToScene(pose, p));
    close(back, p);
    expect(back.y).toBe(p.y);
  });
  it('turns the way three.js turns about +Y', () => {
    const pose = { x: 0, z: 0, yaw: 1.1 };
    const viaThree = new Vector3(1, 0, 2).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.1));
    const ours = trackedToScene(pose, { x: 1, y: 0, z: 2 });
    close(ours, viaThree);
  });
});

describe('moving the walker', () => {
  const head = { x: 0.8, y: 1.7, z: -0.4 };
  it('a teleport puts the head over the target and keeps the heading', () => {
    const pose = teleportHead({ x: 2, z: 3, yaw: 0.4 }, head, { x: -5, z: 6 });
    expect(pose.yaw).toBe(0.4);
    close(trackedToScene(pose, head), { x: -5, z: 6 });
  });
  it('a snap turn turns about the head, not the tracking origin', () => {
    const before = { x: 2, z: 3, yaw: 0.4 };
    const after = turnAboutHead(before, head, before.yaw - SNAP_TURN);
    close(trackedToScene(after, head), trackedToScene(before, head));
    expect(after.yaw).toBeCloseTo(0.4 - SNAP_TURN, 12);
  });
});

describe('snapTurn', () => {
  it('turns once per flick, right is clockwise, and re-arms near centre', () => {
    let s = snapTurn(0, 0.9, true);
    expect(s).toEqual({ yaw: -SNAP_TURN, armed: false });
    s = snapTurn(s.yaw, 0.95, s.armed);
    expect(s.yaw).toBe(-SNAP_TURN);
    s = snapTurn(s.yaw, 0.5, s.armed);
    expect(s.armed).toBe(false);
    s = snapTurn(s.yaw, 0.1, s.armed);
    expect(s.armed).toBe(true);
    expect(snapTurn(0, -0.9, true).yaw).toBe(SNAP_TURN);
  });
});
