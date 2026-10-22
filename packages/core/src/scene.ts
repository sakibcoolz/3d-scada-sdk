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
/**
 * A component's type (ADR-0022): a built-in kind, or a namespaced type such as `com.acme.press-200`
 * that a host registers. Bare names (no dot) are reserved for the built-ins.
 */
export type ComponentType = ComponentKind | (string & {});
/** True for one of the SDK's built-in kinds. */
export function isBuiltInKind(type: unknown): type is ComponentKind {
  return (componentKinds as readonly unknown[]).includes(type);
}
/** True for a namespaced type id: at least two dot-separated segments of letters, digits and inner hyphens. */
export function isNamespacedType(type: unknown): type is string {
  return typeof type === 'string' && type.length <= 128 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(type);
}
export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  ports: ConnectionPort[];
  defaultSize: Vector3Tuple;
  /** Properties a host tag may drive, with the physical quantity of each. */
  bindable?: Readonly<Record<string, Quantity>>;
}
export interface ComponentInstance {
  id: string;
  type: ComponentType;
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
  /** Display name; `id` stays the stable key (ADR-0021). */
  name?: string;
  /** Version of the component definition this instance was authored against. */
  typeVersion?: string;
  manufacturer?: string;
  model?: string;
  /** Identification and metadata tags, such as an asset number or area. Never runtime values. */
  labels?: Record<string, string>;
  /** Host or library data, keyed by reverse-DNS namespace; preserved, never interpreted by core. */
  extensions?: SceneExtensions;
}
/** Plain JSON value kept in `extensions`. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** Custom data keyed by reverse-DNS namespace (`com.example.app`), preserved on round trip (ADR-0021). */
export type SceneExtensions = Record<string, JsonValue>;
/** Project identity of a scene document (ADR-0021). */
export interface SceneProject {
  id?: string;
  name?: string;
  revision?: string;
  description?: string;
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

export const SCENE_SCHEMA_VERSION = 4;
/** Identifies a scene file as an industrial scene document (ADR-0021). */
export const SCENE_DOCUMENT_TYPE = 'industrial.scene';
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
  schemaVersion: 4;
  documentType: typeof SCENE_DOCUMENT_TYPE;
  units: 'm';
  /** Optional project identity (ADR-0021). */
  project?: SceneProject;
  components: ComponentInstance[];
  connections: SceneConnection[];
  /** Optional; absent when the scene has no bindings. */
  tagBindings?: TagBinding[];
  /** Optional reference drawing (ADR-0012); absent when there is none. */
  underlay?: SceneUnderlay;
  /** Host or library data, keyed by reverse-DNS namespace (ADR-0021). */
  extensions?: SceneExtensions;
}
export function createEmptyScene(): ScadaScene {
  return { schemaVersion: 4, documentType: SCENE_DOCUMENT_TYPE, units: 'm', components: [], connections: [] };
}
export function portsCompatible(a: ConnectionPort, b: ConnectionPort): boolean {
  return a.kind === b.kind && (a.nominalSize === undefined || b.nominalSize === undefined || Math.abs(a.nominalSize - b.nominalSize) < 0.0001);
}
