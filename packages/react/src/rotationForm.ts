import { Quaternion, Vector3 } from 'three';
import { quaternionFromEuler, quaternionToEuler, type QuaternionLike, type Vector3Like } from '@sakibcoolz/core';

const DEG = Math.PI / 180;

/** Two decimals, and never −0, so the fields show clean numbers. */
const tidy = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

/** The component's rotation as Euler XYZ degrees for the properties form. */
export function degreesFromRotation(rotation: QuaternionLike): Vector3Like {
  const e = quaternionToEuler(rotation);
  return { x: tidy(e.x / DEG), y: tidy(e.y / DEG), z: tidy(e.z / DEG) };
}

/** Euler XYZ degrees (Three.js order) as a unit quaternion. */
export function rotationFromDegrees(degrees: Vector3Like): QuaternionLike {
  return quaternionFromEuler({ x: degrees.x * DEG, y: degrees.y * DEG, z: degrees.z * DEG });
}

const axes = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/** Turns the current rotation about a world axis (quick-turn buttons). */
export function turnAboutWorldAxis(rotation: QuaternionLike, axis: 'x' | 'y' | 'z', degrees: number): QuaternionLike {
  const turn = new Quaternion().setFromAxisAngle(axes[axis], degrees * DEG);
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).premultiply(turn).normalize();
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}
