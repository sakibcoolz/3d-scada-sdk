import type { ComponentInstance, ConnectionPort, Vector3Tuple } from './scene';

/** A port expressed in scene (world) coordinates: metres, right-handed, Y up. */
export interface WorldPort {
  id: string;
  position: Vector3Tuple;
  /** Outward unit normal. */
  direction: Vector3Tuple;
}

export type ComponentTransform = Pick<ComponentInstance, 'position' | 'rotation'>;

/**
 * Rotates a vector by Euler angles in radians using intrinsic XYZ order, the same convention as
 * Three.js `Euler(x, y, z, 'XYZ')`: the matrix is Rx · Ry · Rz, so Z is applied first.
 */
export function rotateVector(vector: Vector3Tuple, rotation: Vector3Tuple): Vector3Tuple {
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation;

  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];

  return [x, y, z];
}

function normalize(vector: Vector3Tuple, portId: string): Vector3Tuple {
  const length = Math.hypot(...vector);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new Error(`Port "${portId}" has a zero-length or non-finite direction.`);
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * Converts a component-local port into world space. Scene v1 has no scale, so the local
 * position is rotated about the component origin and then translated; the direction is only rotated.
 */
export function portToWorld(component: ComponentTransform, port: ConnectionPort): WorldPort {
  const rotated = rotateVector(port.position, component.rotation);
  return {
    id: port.id,
    position: [
      rotated[0] + component.position[0],
      rotated[1] + component.position[1],
      rotated[2] + component.position[2],
    ],
    direction: rotateVector(normalize(port.direction, port.id), component.rotation),
  };
}
