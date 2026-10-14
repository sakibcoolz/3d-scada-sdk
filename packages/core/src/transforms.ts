import { rotateVector } from './quaternion';
import type { ComponentInstance, ConnectionPort, Vector3Tuple } from './scene';

/** A port expressed in scene (world) coordinates: metres, right-handed, Y up. */
export interface WorldPort {
  id: string;
  position: Vector3Tuple;
  /** Outward unit normal. */
  direction: Vector3Tuple;
}

/** Position and rotation are required; scale defaults to [1, 1, 1]. */
export type ComponentTransform = Pick<ComponentInstance, 'position' | 'rotation'> & Partial<Pick<ComponentInstance, 'scale'>>;

function normalize(vector: Vector3Tuple, portId: string): Vector3Tuple {
  const length = Math.hypot(...vector);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new Error(`Port "${portId}" has a zero-length or non-finite direction.`);
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * Converts a component-local port into world space: scale, then rotate about the component
 * origin, then translate. Directions are normals, so they use the inverse scale before rotating.
 */
export function portToWorld(component: ComponentTransform, port: ConnectionPort): WorldPort {
  const [sx, sy, sz] = component.scale ?? [1, 1, 1];
  const rotated = rotateVector([port.position[0] * sx, port.position[1] * sy, port.position[2] * sz], component.rotation);
  const direction = normalize(port.direction, port.id);
  return {
    id: port.id,
    position: [
      rotated[0] + component.position[0],
      rotated[1] + component.position[1],
      rotated[2] + component.position[2],
    ],
    direction: rotateVector(normalize([direction[0] / sx, direction[1] / sy, direction[2] / sz], port.id), component.rotation),
  };
}
