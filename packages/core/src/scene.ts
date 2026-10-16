/** Tuple form, used by catalog geometry and derived (never saved) data such as ports and routes. */
export type Vector3Tuple = [number, number, number];
/** Unit quaternion [x, y, z, w] in tuple form, for derived data. */
export type QuaternionTuple = [number, number, number, number];
/** Named 3D vector used by the scene model and files (ADR-0007). A THREE.Vector3 satisfies it. */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}
/** Named unit quaternion used by the scene model and files (ADR-0007). A THREE.Quaternion satisfies it. */
export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}
export type PortKind = 'fluid' | 'electrical' | 'signal' | 'mechanical';
export interface ConnectionPort {
  id: string;
  kind: PortKind;
  position: Vector3Tuple; // local to component, metres
  direction: Vector3Tuple; // outward unit normal
  nominalSize?: number; // metres
}
export const componentKinds = ['tank', 'conicalTank', 'horizontalTank', 'sphericalTank', 'pool', 'pipe', 'elbow', 'tee', 'valve', 'reducer', 'coupler', 'pump', 'sensor', 'motor'] as const;
export type ComponentKind = (typeof componentKinds)[number];
export interface ComponentDefinition {
  type: ComponentKind;
  label: string;
  ports: ConnectionPort[];
  defaultSize: Vector3Tuple;
  /** Properties a host tag may drive, with the physical quantity of each. */
  bindable?: Readonly<Record<string, Quantity>>;
}
export interface ComponentInstance {
  id: string;
  type: ComponentKind;
  /**
   * Optional assembly parent (ADR-0008). Positions stay in world space; the link only makes
   * editing rigid: moving any member of an assembly moves all of it.
   */
  parentId?: string;
  /** Metres, world space. */
  position: Vector3Like;
  /** Unit quaternion. */
  rotation: QuaternionLike;
  /** Positive per-axis scale. Components with ports must keep { x: 1, y: 1, z: 1 } (see ADR-0004). */
  scale: Vector3Like;
  properties: Record<string, number | boolean | string>;
}
export interface SceneConnection {
  id: string;
  from: { instanceId: string; portId: string };
  to: { instanceId: string; portId: string };
}
/** Physical quantity of a bindable value; fixes its canonical unit (see `canonicalUnits`). */
export type Quantity = 'percent' | 'temperature' | 'boolean' | 'flow';

/**
 * Authored link from a host tag to what it drives (ADR-0006). `unit` is the unit the tag's values
 * arrive in when an observation does not say; values are converted to the canonical unit.
 */
export type TagBinding =
  | { id: string; tagId: string; kind: 'property'; instanceId: string; property: string; unit?: string }
  | { id: string; tagId: string; kind: 'flow'; connectionId: string; unit?: string };

export const SCENE_SCHEMA_VERSION = 3;
/**
 * A drawing shown flat on the ground as a tracing reference (ADR-0012). Display only: it never
 * takes part in snapping, connections, collisions or simulation.
 */
export interface SceneUnderlay {
  /** Sanitized SVG markup (written by the SDK's sanitizer), at most `maxUnderlayBytes`. */
  svg: string;
  /** Centre of the drawing on the ground plane, metres. */
  position: { x: number; z: number };
  /** Width of the drawing in metres; its height follows the viewBox aspect. */
  width: number;
  /** Degrees about +Y. */
  rotation: number;
  /** 0–1. */
  opacity: number;
}

export interface ScadaScene {
  schemaVersion: 3;
  units: 'm';
  components: ComponentInstance[];
  connections: SceneConnection[];
  /** Optional; absent when the scene has no bindings. */
  tagBindings?: TagBinding[];
  /** Optional reference drawing (ADR-0012); absent when there is none. */
  underlay?: SceneUnderlay;
}
export function createEmptyScene(): ScadaScene {
  return { schemaVersion: 3, units: 'm', components: [], connections: [] };
}
export function portsCompatible(a: ConnectionPort, b: ConnectionPort): boolean {
  return a.kind === b.kind && (a.nominalSize === undefined || b.nominalSize === undefined || Math.abs(a.nominalSize - b.nominalSize) < 0.0001);
}
