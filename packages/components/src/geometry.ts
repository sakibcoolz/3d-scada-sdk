import type { ComponentDefinition, Vector3Tuple } from '@scada3d/core';

export type Axis = 'x' | 'y' | 'z';

/** How the renderer treats a part: shells follow normal/glass mode, the others carry live state. */
export type PartRole = 'shell' | 'liquid' | 'valve-ball' | 'valve-handle' | 'gauge' | 'scale' | 'plate' | 'flange' | 'bolt' | 'weld';

/**
 * Framework-neutral geometry in component-local metres. Renderers turn these into meshes;
 * ports and bounds are declared from the same dimensions so they stay aligned.
 */
export type GeometryPart =
  | { shape: 'cylinder'; role: PartRole; center: Vector3Tuple; axis: Axis; radius: number; length: number; openEnded?: boolean }
  | { shape: 'sphere'; role: PartRole; center: Vector3Tuple; radius: number }
  /** `text` (a name plate's capacity) is drawn on the box's faces. */
  | { shape: 'box'; role: PartRole; center: Vector3Tuple; size: Vector3Tuple; text?: string }
  /** Quarter torus in the XY plane, sweeping from startAngle to startAngle + π/2 about center. */
  | { shape: 'bend'; role: PartRole; center: Vector3Tuple; bendRadius: number; tubeRadius: number; startAngle: number }
  /** Frustum along an axis: `radiusStart` at the −axis end, `radiusEnd` at the +axis end. */
  | { shape: 'cone'; role: PartRole; center: Vector3Tuple; axis: Axis; radiusStart: number; radiusEnd: number; length: number; openEnded?: boolean }
  /** Solid of revolution about local +Y: profile points [radius, y] with y increasing. */
  | { shape: 'lathe'; role: PartRole; center: Vector3Tuple; points: [number, number][] }
  /** Full torus around an axis: a weld bead of tube radius `tube` at `radius` from the axis. */
  | { shape: 'ring'; role: PartRole; center: Vector3Tuple; axis: Axis; radius: number; tube: number };

export interface Bounds {
  min: Vector3Tuple;
  max: Vector3Tuple;
}

/** A numeric property that changes a component's shape, e.g. pipe length. */
export interface NumberParameterSpec {
  label: string;
  unit: string;
  /** What an absent property means (files written before the parameter existed). */
  default: number;
  min: number;
  max: number;
  step: number;
  /** Value given to newly added components when it differs from `default`. */
  initial?: number;
  /** Changing it keeps the component's lowest point where it is (e.g. a stand lifts the tank). */
  keepsBottom?: boolean;
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

/**
 * The liquid's profile for a level `fraction` (0–1) of a lathe-shaped vessel: the inner wall
 * `points` cut at that height, closed on the axis at the bottom and the top. Empty at 0.
 */
export function liquidProfile(points: readonly [number, number][], fraction: number): [number, number][] {
  const f = Math.min(1, Math.max(0, fraction));
  if (!(f > 0) || points.length < 2) return [];
  const y0 = points[0][1], y1 = points[points.length - 1][1];
  const top = f >= 1 ? y1 : y0 + f * (y1 - y0);
  const walls = points.filter(([, y]) => y < top);
  const i = Math.max(0, points.findIndex(([, y]) => y >= top) - 1);
  const [a, b] = [points[i], points[Math.min(points.length - 1, i + 1)]];
  const t = b[1] > a[1] ? (top - a[1]) / (b[1] - a[1]) : 0;
  const radius = f >= 1 ? points[points.length - 1][0] : a[0] + (b[0] - a[0]) * t;
  return [[0, y0], ...walls.map(([r, y]) => [r, y] as [number, number]), [radius, top], [0, top]];
}
