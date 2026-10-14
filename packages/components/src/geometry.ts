import type { ComponentDefinition, Vector3Tuple } from '@scada3d/core';

export type Axis = 'x' | 'y' | 'z';

/** How the renderer treats a part: shells follow normal/glass mode, the others carry live state. */
export type PartRole = 'shell' | 'liquid' | 'valve-ball' | 'valve-handle';

/**
 * Framework-neutral geometry in component-local metres. Renderers turn these into meshes;
 * ports and bounds are declared from the same dimensions so they stay aligned.
 */
export type GeometryPart =
  | { shape: 'cylinder'; role: PartRole; center: Vector3Tuple; axis: Axis; radius: number; length: number; openEnded?: boolean }
  | { shape: 'sphere'; role: PartRole; center: Vector3Tuple; radius: number }
  | { shape: 'box'; role: PartRole; center: Vector3Tuple; size: Vector3Tuple }
  /** Quarter torus in the XY plane, sweeping from startAngle to startAngle + π/2 about center. */
  | { shape: 'bend'; role: PartRole; center: Vector3Tuple; bendRadius: number; tubeRadius: number; startAngle: number };

export interface Bounds {
  min: Vector3Tuple;
  max: Vector3Tuple;
}

export interface IndustrialComponentDefinition extends ComponentDefinition {
  /** Axis-aligned local bounds of all parts in the default (open) state. */
  bounds: Bounds;
  parts: GeometryPart[];
}
