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
  | { shape: 'bend'; role: PartRole; center: Vector3Tuple; bendRadius: number; tubeRadius: number; startAngle: number }
  /** Frustum along an axis: `radiusStart` at the −axis end, `radiusEnd` at the +axis end. */
  | { shape: 'cone'; role: PartRole; center: Vector3Tuple; axis: Axis; radiusStart: number; radiusEnd: number; length: number };

export interface Bounds {
  min: Vector3Tuple;
  max: Vector3Tuple;
}

/** A numeric property that changes a component's shape, e.g. pipe length. */
export interface NumberParameterSpec {
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

/** A property chosen from a fixed list, e.g. pipe size. */
export interface ChoiceParameterSpec {
  label: string;
  choices: readonly string[];
  default: string;
}

export type ParameterSpec = NumberParameterSpec | ChoiceParameterSpec;

export const isChoiceParameter = (spec: ParameterSpec): spec is ChoiceParameterSpec => 'choices' in spec;

export interface IndustrialComponentDefinition extends ComponentDefinition {
  /** Axis-aligned local bounds of all parts in the default (open) state. */
  bounds: Bounds;
  parts: GeometryPart[];
  /** Shape parameters stored in `properties`; ports, bounds and parts follow them via `definitionFor`. */
  parameters?: Readonly<Record<string, ParameterSpec>>;
}
