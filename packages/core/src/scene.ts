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
/**
 * A port's domain (ADR-0023). `electrical` is deprecated: it keeps its old behaviour (compatible
 * only with `electrical`); use `power` or `signal` instead.
 */
export type PortKind = 'fluid' | 'mechanical' | 'power' | 'signal' | 'network' | 'electrical';
export const portKinds = ['fluid', 'mechanical', 'power', 'signal', 'network', 'electrical'] as const satisfies readonly PortKind[];
export type SignalType = 'DI' | 'DO' | 'AI' | 'AO';
export const signalTypes = ['DI', 'DO', 'AI', 'AO'] as const satisfies readonly SignalType[];
export type PowerKind = 'AC' | 'DC' | 'PE';
export const powerKinds = ['AC', 'DC', 'PE'] as const satisfies readonly PowerKind[];
/** Signal or energy direction; not the 3D normal (`direction`). */
export type PortFlow = 'in' | 'out' | 'bidirectional';
export interface ConnectionPort {
  id: string;
  /** The port's domain (ADR-0023). */
  kind: PortKind;
  position: Vector3Tuple; // local to component, metres; for power/signal/network, the terminal
  direction: Vector3Tuple; // outward unit normal
  nominalSize?: number; // metres
  /** Display name, e.g. "Run command". */
  name?: string;
  /** Terminal or channel label, e.g. "X1:3", "DI0.3". */
  terminal?: string;
  /** Signal or energy direction; for signal ports it follows from `signal.type` when absent. */
  flow?: PortFlow;
  signal?: { type: SignalType; range?: [number, number]; unit?: string };
  power?: { kind: PowerKind; voltage?: number; phases?: 1 | 3 };
  /** `medium` such as 'ethernet' or 'rs485'; `protocols` such as 'modbus-tcp'. */
  network?: { medium: string; protocols?: string[] };
  /** How many connections the port takes; default 1. Fluid ports always take 1. */
  maxConnections?: number;
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
  /** Variables an instance usually exposes, for `suggestVariables` (ADR-0024). */
  variables?: readonly VariableTemplate[];
  /** The 2D views it appears in (ADR-0026). When absent, its ports decide. */
  views?: readonly ViewKind[];
}
/**
 * A variable a component type usually exposes (ADR-0024), e.g. a drive's `ACTUAL_SPEED`. Instances
 * get the suggested tag id `<componentId>.<name>`; `property` names a bindable property it drives.
 */
export interface VariableTemplate {
  name: string;
  dataType: DataType;
  unit?: string;
  property?: string;
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
/** Built-in relationship kinds (ADR-0023); hosts add namespaced ones such as `com.example.supervises`. */
export const relationshipKinds = ['controls', 'drives', 'measures', 'feeds', 'communicates', 'wired', 'associated'] as const;
export type Relationship = (typeof relationshipKinds)[number] | (string & {});
/** True for a built-in relationship or a namespaced host relationship. */
export function isRelationship(value: unknown): value is Relationship {
  return (relationshipKinds as readonly unknown[]).includes(value) || isNamespacedType(value);
}
export interface SceneConnection {
  id: string;
  /** The ports' domain (ADR-0023); when present it must match them. Derived from the ports when absent. */
  domain?: PortKind;
  relationship?: Relationship;
  from: { instanceId: string; portId: string };
  to: { instanceId: string; portId: string };
  /** Edge data such as cable type, cross-section or length; same value rules as component properties. */
  properties?: Record<string, number | boolean | string>;
}
/**
 * A logical fact between two components, such as "PLC-01 controls VFD-101" (ADR-0023): directed,
 * with no ports and no geometry. Never drawn as wiring, never routed or simulated.
 */
export interface SceneAssociation {
  id: string;
  relationship: Relationship;
  /** Component ids. */
  from: string;
  to: string;
  properties?: Record<string, number | boolean | string>;
}
/** Data types of runtime variables (ADR-0024). */
export const dataTypes = ['bool', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'string'] as const;
export type DataType = (typeof dataTypes)[number];
/** Built-in acquisition protocols; hosts add namespaced ones such as `com.vendor.bus` (ADR-0024). */
export const protocols = ['opcua', 'modbus-tcp', 'modbus-rtu', 'host'] as const;
export type Protocol = (typeof protocols)[number] | (string & {});
/**
 * Where values come from (ADR-0024): a PLC, drive or gateway the host reaches. Never holds
 * credentials or opens a connection; `endpointRef` is an opaque reference the host resolves.
 */
export interface SceneDataSource {
  id: string;
  name?: string;
  protocol: Protocol;
  /** The component that is this source, e.g. the PLC. */
  deviceId?: string;
  endpointRef?: string;
  properties?: Record<string, number | boolean | string>;
}
export const modbusAreas = ['coil', 'discrete', 'input', 'holding'] as const;
export interface ModbusAddress {
  area: (typeof modbusAreas)[number];
  /** Zero-based register or coil number, 0–65535. */
  address: number;
  unitId: number;
  byteOrder?: 'big' | 'little';
  wordOrder?: 'high-first' | 'low-first';
  /** Bit 0–15 of a holding or input register, for a `bool`. */
  bit?: number;
}
export interface OpcUaAddress {
  nodeId: string;
  namespaceUri?: string;
}
/** Typed by the data source's protocol; a custom protocol's address is plain JSON checked by the host. */
export type VariableAddress = ModbusAddress | OpcUaAddress | { [key: string]: JsonValue };
/**
 * A runtime variable (ADR-0024): what a tag is and where it comes from. `id` is the tag id that
 * observations and bindings carry. A `readWrite` variable may be the subject of a command *request*
 * to the host (ADR-0029); the SDK itself never writes.
 */
export interface RuntimeVariable {
  id: string;
  name?: string;
  componentId?: string;
  dataType: DataType;
  unit?: string;
  access: 'read' | 'readWrite';
  source?: { dataSourceId: string; variable?: string; address?: VariableAddress };
  /** How the host converts raw values; descriptive only, the SDK does not apply it. */
  scaling?: { kind: 'linear'; rawMin: number; rawMax: number; min: number; max: number };
  /** Required on, and only on, a `readWrite` variable (ADR-0029). */
  command?: CommandLimits;
}

/**
 * What a command request may ask for (ADR-0029). Numeric types need `min` and `max`; `bool` takes
 * neither. The host's gateway must enforce these itself: the SDK's check is a convenience.
 */
export interface CommandLimits {
  min?: number;
  max?: number;
  /** Granularity of requested values, counted from `min`. */
  step?: number;
  /** Extra plain text shown in the confirmation. */
  confirm?: string;
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
  /** Optional port-less logical links (ADR-0023); absent when there are none. */
  associations?: SceneAssociation[];
  /** Optional acquisition sources (ADR-0024). */
  dataSources?: SceneDataSource[];
  /** Optional typed tags (ADR-0024). */
  runtimeVariables?: RuntimeVariable[];
  /** Optional; absent when the scene has no bindings. */
  tagBindings?: TagBinding[];
  /** Optional reference drawing (ADR-0012); absent when there is none. */
  underlay?: SceneUnderlay;
  /** Optional 2D layouts per view (ADR-0026); absent when nothing has been placed. */
  views?: SceneViews;
  /** Host or library data, keyed by reverse-DNS namespace (ADR-0021). */
  extensions?: SceneExtensions;
}
/** The 2D views a scene can lay out (ADR-0026). Host views go in `extensions`. */
export const viewKinds = ['process', 'electrical'] as const;
export type ViewKind = (typeof viewKinds)[number];
/** Where a component's symbol sits in one view, in drawing units (1 mm), x right and y down. */
export interface SymbolPlacement {
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
  /** Hidden in this view only. */
  hidden?: true;
}
/** A connection's or association's drawn line in one view: at least two points. */
export interface ViewRoute {
  points: [number, number][];
}
/** Layout only: equipment, ports and wiring stay in the model (ADR-0026). */
export interface ViewLayout {
  /** By component id. */
  symbols?: Record<string, SymbolPlacement>;
  /** By connection or association id. */
  routes?: Record<string, ViewRoute>;
}
export type SceneViews = Partial<Record<ViewKind, ViewLayout>>;

export function createEmptyScene(): ScadaScene {
  return { schemaVersion: 4, documentType: SCENE_DOCUMENT_TYPE, units: 'm', components: [], connections: [] };
}
export type PortCheck = { ok: true } | { ok: false; reason: string };

const signalFlow = (p: ConnectionPort): PortFlow | undefined => p.flow ?? (p.signal ? (p.signal.type === 'DO' || p.signal.type === 'AO' ? 'out' : 'in') : undefined);
const isAnalog = (t: SignalType) => t === 'AI' || t === 'AO';
const describeRange = (s: NonNullable<ConnectionPort['signal']>) => `${s.range ? `${s.range[0]}–${s.range[1]}` : 'a signal'}${s.unit ? ` ${s.unit}` : ''}`;

/**
 * Whether two ports may be connected, per domain (ADR-0023), and why not. Metadata missing on
 * either side never fails a check. These are engineering-aid checks on the described model: they
 * never verify physical wiring, protective earth or functional safety.
 */
export function checkPorts(a: ConnectionPort, b: ConnectionPort): PortCheck {
  const no = (reason: string): PortCheck => ({ ok: false, reason });
  if (a.kind !== b.kind) return no(`a ${a.kind} port cannot connect to a ${b.kind} port`);
  if (a.nominalSize !== undefined && b.nominalSize !== undefined && Math.abs(a.nominalSize - b.nominalSize) >= 0.0001) return no('the nominal sizes differ');
  if (a.kind === 'signal') {
    if (a.signal && b.signal && isAnalog(a.signal.type) !== isAnalog(b.signal.type)) return no('a digital signal cannot connect to an analog one');
    const fa = signalFlow(a), fb = signalFlow(b);
    if (fa === 'out' && fb === 'out') return no('an output cannot connect to an output');
    if (fa === 'in' && fb === 'in') return no('an input cannot connect to an input');
    if (a.signal && b.signal) {
      const sameRange = !a.signal.range || !b.signal.range || a.signal.range.every((v, i) => v === b.signal!.range![i]);
      const sameUnit = !a.signal.unit || !b.signal.unit || a.signal.unit === b.signal.unit;
      if (!sameRange || !sameUnit) return no(`${describeRange(a.signal)} cannot connect to ${describeRange(b.signal)}`);
    }
  } else if (a.kind === 'power') {
    if (a.power && b.power) {
      if (a.power.kind !== b.power.kind) return no(a.power.kind === 'PE' || b.power.kind === 'PE' ? 'protective earth connects only to protective earth' : `${a.power.kind} cannot connect to ${b.power.kind}`);
      if (a.power.voltage !== undefined && b.power.voltage !== undefined && a.power.voltage !== b.power.voltage) return no(`${a.power.voltage} V cannot connect to ${b.power.voltage} V`);
      if (a.power.phases !== undefined && b.power.phases !== undefined && a.power.phases !== b.power.phases) return no(`${a.power.phases}-phase cannot connect to ${b.power.phases}-phase`);
    }
    if (a.flow === 'out' && b.flow === 'out') return no('two power sources cannot connect to each other');
  } else if (a.kind === 'network' && a.network && b.network) {
    if (a.network.medium !== b.network.medium) return no(`${a.network.medium} cannot connect to ${b.network.medium}`);
    const pa = a.network.protocols, pb = b.network.protocols;
    if (pa?.length && pb?.length && !pa.some((p) => pb.includes(p))) return no('the ports share no protocol');
  }
  return { ok: true };
}

export function portsCompatible(a: ConnectionPort, b: ConnectionPort): boolean {
  return checkPorts(a, b).ok;
}

/** Ports joined by placing parts against each other (snapping, touching, attach). Power, signal and network ports are wired instead. */
export function matesPhysically(port: ConnectionPort): boolean {
  return port.kind === 'fluid' || port.kind === 'mechanical' || port.kind === 'electrical';
}

/** How many connections a port takes (ADR-0023): `maxConnections`, default 1. */
export function portCapacity(port: ConnectionPort): number {
  return port.maxConnections ?? 1;
}

/**
 * `record[key]` for an own key only. Keys from documents and hosts are untrusted: a plain lookup of
 * "constructor", "toString" or "__proto__" finds inherited values (T-096). Internal; not exported by the package.
 */
export function ownValue<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record !== undefined && record !== null && typeof key === 'string' && Object.hasOwn(record, key) ? record[key] : undefined;
}
