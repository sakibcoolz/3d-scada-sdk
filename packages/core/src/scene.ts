export type Vector3Tuple = [number, number, number];
/** Unit quaternion [x, y, z, w]. */
export type QuaternionTuple = [number, number, number, number];
export type PortKind = 'fluid' | 'electrical' | 'signal' | 'mechanical';
export interface ConnectionPort {
  id: string;
  kind: PortKind;
  position: Vector3Tuple; // local to component, metres
  direction: Vector3Tuple; // outward unit normal
  nominalSize?: number; // metres
}
export const componentKinds = ['tank', 'pipe', 'elbow', 'tee', 'valve', 'pump', 'sensor', 'motor'] as const;
export type ComponentKind = (typeof componentKinds)[number];
export interface ComponentDefinition {
  type: ComponentKind;
  label: string;
  ports: ConnectionPort[];
  defaultSize: Vector3Tuple;
}
export interface ComponentInstance {
  id: string;
  type: ComponentKind;
  /** Metres, world space. */
  position: Vector3Tuple;
  /** Unit quaternion. */
  rotation: QuaternionTuple;
  /** Positive per-axis scale. Components with ports must keep [1, 1, 1] (see ADR-0004). */
  scale: Vector3Tuple;
  properties: Record<string, number | boolean | string>;
}
export interface SceneConnection {
  id: string;
  from: { instanceId: string; portId: string };
  to: { instanceId: string; portId: string };
}
export const SCENE_SCHEMA_VERSION = 2;
export interface ScadaScene {
  schemaVersion: 2;
  units: 'm';
  components: ComponentInstance[];
  connections: SceneConnection[];
}
export function createEmptyScene(): ScadaScene {
  return { schemaVersion: 2, units: 'm', components: [], connections: [] };
}
export function portsCompatible(a: ConnectionPort, b: ConnectionPort): boolean {
  return a.kind === b.kind && (a.nominalSize === undefined || b.nominalSize === undefined || Math.abs(a.nominalSize - b.nominalSize) < 0.0001);
}
