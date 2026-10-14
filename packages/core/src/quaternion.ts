import type { QuaternionTuple, Vector3Tuple } from './scene';

// Quaternions are [x, y, z, w]. Conventions match Three.js so values round-trip with the renderer.

export const identityQuaternion: QuaternionTuple = [0, 0, 0, 1];

const dot = (a: Vector3Tuple, b: Vector3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function multiplyQuaternions(a: QuaternionTuple, b: QuaternionTuple): QuaternionTuple {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function normalizeQuaternion(q: QuaternionTuple): QuaternionTuple {
  const length = Math.hypot(...q);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/** Euler angles in radians, intrinsic XYZ order (Three.js `Euler(x, y, z, 'XYZ')`), as a quaternion. */
export function quaternionFromEuler([x, y, z]: Vector3Tuple): QuaternionTuple {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/** Intrinsic XYZ Euler angles for display. Uses atan2, which stays accurate near ±90° about Y. */
export function quaternionToEuler([x, y, z, w]: QuaternionTuple): Vector3Tuple {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const cosY = Math.hypot(m11, m12);
  const ey = Math.atan2(m13, cosY);
  if (cosY > 1e-7) return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ey, 0];
}

/** Shortest rotation taking unit vector `a` onto unit vector `b`. A half turn prefers the world Y axis. */
export function quaternionFromUnitVectors(a: Vector3Tuple, b: Vector3Tuple): QuaternionTuple {
  const r = dot(a, b) + 1;
  if (r < 1e-9) {
    // Opposite vectors: turn half way round an axis perpendicular to `a`, upright when possible.
    const axis: Vector3Tuple =
      Math.abs(a[1]) < 0.999 ? [-a[1] * a[0], 1 - a[1] * a[1], -a[1] * a[2]] : [1 - a[0] * a[0], -a[0] * a[1], -a[0] * a[2]];
    const length = Math.hypot(...axis);
    return [axis[0] / length, axis[1] / length, axis[2] / length, 0];
  }
  return normalizeQuaternion([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], r]);
}

/** Rotates a vector by a unit quaternion. */
export function rotateVector(v: Vector3Tuple, [qx, qy, qz, qw]: QuaternionTuple): Vector3Tuple {
  // t = 2 · (q.xyz × v); v' = v + w·t + q.xyz × t
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}
