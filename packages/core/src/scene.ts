export type Vector3Tuple = [number, number, number];
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
  kind: ComponentKind;
  label: string;
  ports: ConnectionPort[];
  defaultSize: Vector3Tuple;
}
export interface ComponentInstance {
  id: string;
  kind: ComponentKind;
  position: Vector3Tuple;
  rotation: Vector3Tuple; // Euler XYZ order, radians
  properties: Record<string, number | boolean | string>;
}
export interface SceneConnection {
  id: string;
  from: { instanceId: string; portId: string };
  to: { instanceId: string; portId: string };
}
export interface ScadaScene {
  version: 1;
  components: ComponentInstance[];
  connections: SceneConnection[];
}
export function createEmptyScene(): ScadaScene {
  return { version: 1, components: [], connections: [] };
}
export function portsCompatible(a: ConnectionPort, b: ConnectionPort): boolean {
  return a.kind === b.kind && (a.nominalSize === undefined || b.nominalSize === undefined || Math.abs(a.nominalSize - b.nominalSize) < 0.0001);
}
