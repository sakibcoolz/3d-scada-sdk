import type { ComponentInstance, ComponentType, ConnectionPort, PortKind, Relationship, ScadaScene, SceneAssociation, SceneConnection } from './scene.js';
import { validateScene, type SceneValidationErrorCode, type SceneValidationOptions } from './validation.js';

export type GraphErrorCode = SceneValidationErrorCode | 'UNKNOWN_CONNECTION' | 'UNKNOWN_ASSOCIATION';

export interface GraphError {
  code: GraphErrorCode;
  message: string;
}

export type GraphResult = { ok: true; scene: ScadaScene } | { ok: false; error: GraphError };

export type GraphOptions = Pick<SceneValidationOptions, 'resolvePorts' | 'resolveType' | 'resolveBindable' | 'validateProperties' | 'limits'>;

/**
 * Adds one edge. The candidate scene goes through `validateScene`, so the same rules apply as on
 * load (known ports, compatibility, occupancy, no duplicates). The input scene must already be valid.
 */
export function connect(scene: ScadaScene, connection: SceneConnection, options: GraphOptions): GraphResult {
  const index = scene.connections.length;
  const result = validateScene({ ...scene, connections: [...scene.connections, connection] }, options);
  if (result.ok) return result;
  // Prefer an error about the new edge; anything else means the input scene was already invalid.
  const error = result.errors.find((e) => e.path.startsWith(`connections[${index}]`)) ?? result.errors[0];
  return { ok: false, error: { code: error.code, message: error.message } };
}

export function disconnect(scene: ScadaScene, connectionId: string): GraphResult {
  if (!scene.connections.some((c) => c.id === connectionId)) {
    return { ok: false, error: { code: 'UNKNOWN_CONNECTION', message: `No connection "${connectionId}".` } };
  }
  const next = { ...scene, connections: scene.connections.filter((c) => c.id !== connectionId) };
  return { ok: true, scene: withoutDanglingBindings(next) };
}

/**
 * Adds one association (ADR-0023), such as "PLC-01 controls VFD-101". Validated like `connect`:
 * both components exist and differ, the id is unused, and the same fact is not recorded twice.
 */
export function addAssociation(scene: ScadaScene, association: SceneAssociation, options: GraphOptions): GraphResult {
  const existing = scene.associations ?? [];
  const index = existing.length;
  const result = validateScene({ ...scene, associations: [...existing, association] }, options);
  if (result.ok) return result;
  const error = result.errors.find((e) => e.path.startsWith(`associations[${index}]`)) ?? result.errors[0];
  return { ok: false, error: { code: error.code, message: error.message } };
}

/** Removes one association. The list is dropped when it becomes empty, so the file is unchanged by an add and remove. */
export function removeAssociation(scene: ScadaScene, associationId: string): GraphResult {
  if (!scene.associations?.some((a) => a.id === associationId)) {
    return { ok: false, error: { code: 'UNKNOWN_ASSOCIATION', message: `No association "${associationId}".` } };
  }
  return { ok: true, scene: withAssociations(scene, scene.associations.filter((a) => a.id !== associationId)) };
}

/** The scene with `associations`, leaving the field out when the list is empty. */
function withAssociations(scene: ScadaScene, associations: SceneAssociation[]): ScadaScene {
  const { associations: _, ...rest } = scene;
  return associations.length > 0 ? { ...rest, associations } : rest;
}

/**
 * Removes a component with every connection and association that touches it, so no edge is left
 * dangling; its children are freed, and data sources and variables keep their description but lose the link.
 */
export function removeComponent(scene: ScadaScene, instanceId: string): GraphResult {
  if (!scene.components.some((c) => c.id === instanceId)) {
    return { ok: false, error: { code: 'UNKNOWN_INSTANCE', message: `No component "${instanceId}".` } };
  }
  const next = {
    ...scene,
    components: scene.components
      .filter((c) => c.id !== instanceId)
      .map((c) => {
        if (c.parentId !== instanceId) return c;
        const { parentId: _, ...free } = c;
        return free;
      }),
    connections: scene.connections.filter((c) => c.from.instanceId !== instanceId && c.to.instanceId !== instanceId),
  };
  const kept = scene.associations ? withAssociations(next, scene.associations.filter((a) => a.from !== instanceId && a.to !== instanceId)) : next;
  return { ok: true, scene: withoutDanglingBindings(unlinkAcquisition(kept, instanceId)) };
}

/**
 * Clears a removed component's links from data sources (`deviceId`) and runtime variables
 * (`componentId`), keeping the acquisition description itself (ADR-0024).
 */
function unlinkAcquisition(scene: ScadaScene, instanceId: string): ScadaScene {
  const dataSources = scene.dataSources?.map((s) => {
    if (s.deviceId !== instanceId) return s;
    const { deviceId: _, ...rest } = s;
    return rest;
  });
  const runtimeVariables = scene.runtimeVariables?.map((v) => {
    if (v.componentId !== instanceId) return v;
    const { componentId: _, ...rest } = v;
    return rest;
  });
  return { ...scene, ...(dataSources ? { dataSources } : {}), ...(runtimeVariables ? { runtimeVariables } : {}) };
}

/** Drops tag bindings whose component or connection no longer exists. Absent bindings stay absent. */
function withoutDanglingBindings(scene: ScadaScene): ScadaScene {
  if (!scene.tagBindings) return scene;
  const components = new Set(scene.components.map((c) => c.id));
  const connections = new Set(scene.connections.map((c) => c.id));
  const tagBindings = scene.tagBindings.filter((b) => (b.kind === 'property' ? components.has(b.instanceId) : connections.has(b.connectionId)));
  return { ...scene, tagBindings };
}

/**
 * Which edges a graph query follows (ADR-0023). Everything is optional; an empty filter follows
 * every connection and association in both directions.
 */
export interface GraphFilter {
  /** Connection domains to follow. A connection's domain is its `domain` field, else its from-port's kind via `resolvePorts`. Associations have no domain and are skipped when this is set. */
  domains?: readonly PortKind[];
  /** Relationships to follow; edges without a relationship are skipped when this is set. */
  relationships?: readonly Relationship[];
  /** Follow connections. Default true. */
  connections?: boolean;
  /** Follow associations. Default true for `neighbours`, `relatedComponents` and `pathBetween`. */
  associations?: boolean;
  /** `out` follows edges from→to, `in` to→from, `both` (default) either way. */
  direction?: 'out' | 'in' | 'both';
  /** Resolves a connection's domain when it has no `domain` field. */
  resolvePorts?: (type: ComponentType, properties?: ComponentInstance['properties']) => readonly ConnectionPort[] | undefined;
}

/** One edge walked by a query, from one component to the next. */
export interface GraphStep {
  edge: 'connection' | 'association';
  /** The connection or association id. */
  id: string;
  /** Component walked from and to. */
  from: string;
  to: string;
  /** True when walked in the edge's own from→to direction. */
  forward: boolean;
  domain?: PortKind;
  relationship?: Relationship;
}

/** A connection's domain: authored, else the from-port's kind; undefined when it cannot be resolved. */
function domainOf(c: SceneConnection, resolvePorts: GraphFilter['resolvePorts'], byId: Map<string, ComponentInstance>): PortKind | undefined {
  if (c.domain !== undefined) return c.domain;
  const owner = byId.get(c.from.instanceId);
  return owner && resolvePorts?.(owner.type, owner.properties)?.find((p) => p.id === c.from.portId)?.kind;
}

/** Steps leaving each component under `filter`, in scene order: connections first, then associations. */
function steps(scene: ScadaScene, filter: GraphFilter, associationsByDefault: boolean): Map<string, GraphStep[]> {
  const out = new Map<string, GraphStep[]>(scene.components.map((c) => [c.id, []]));
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  const direction = filter.direction ?? 'both';
  const add = (step: Omit<GraphStep, 'from' | 'to' | 'forward'>, a: string, b: string) => {
    if (direction !== 'in') out.get(a)?.push({ ...step, from: a, to: b, forward: true });
    if (direction !== 'out') out.get(b)?.push({ ...step, from: b, to: a, forward: false });
  };
  const relationshipOk = (r: Relationship | undefined) => !filter.relationships || (r !== undefined && filter.relationships.includes(r));
  if (filter.connections ?? true) {
    for (const c of scene.connections) {
      const domain = domainOf(c, filter.resolvePorts, byId);
      if (filter.domains && (domain === undefined || !filter.domains.includes(domain))) continue;
      if (!relationshipOk(c.relationship)) continue;
      add({ edge: 'connection', id: c.id, ...(domain ? { domain } : {}), ...(c.relationship ? { relationship: c.relationship } : {}) }, c.from.instanceId, c.to.instanceId);
    }
  }
  if ((filter.associations ?? associationsByDefault) && !filter.domains) {
    for (const a of scene.associations ?? []) {
      if (!relationshipOk(a.relationship)) continue;
      add({ edge: 'association', id: a.id, relationship: a.relationship }, a.from, a.to);
    }
  }
  return out;
}

/** Components one followed edge away from `instanceId`, each once, in edge order. Empty for an unknown id. */
export function neighbours(scene: ScadaScene, instanceId: string, filter: GraphFilter = {}): string[] {
  const seen = new Set<string>();
  for (const step of steps(scene, filter, true).get(instanceId) ?? []) if (step.to !== instanceId) seen.add(step.to);
  return [...seen];
}

/**
 * Every component reachable from `instanceId` through followed edges, breadth first, excluding
 * `instanceId` itself. For example, with `{ relationships: ['controls', 'drives'], direction: 'out' }`
 * from a PLC: the drives it controls and the motors they drive. Derived only from explicit edges.
 */
export function relatedComponents(scene: ScadaScene, instanceId: string, filter: GraphFilter = {}): string[] {
  const graph = steps(scene, filter, true);
  if (!graph.has(instanceId)) return [];
  return walkSteps(graph, instanceId).order.slice(1);
}

/**
 * The shortest chain of followed edges from `fromId` to `toId` (fewest edges; ties go to scene
 * order), or undefined when there is none. Empty when both ids are the same known component.
 */
export function pathBetween(scene: ScadaScene, fromId: string, toId: string, filter: GraphFilter = {}): GraphStep[] | undefined {
  const graph = steps(scene, filter, true);
  if (!graph.has(fromId) || !graph.has(toId)) return undefined;
  const { via } = walkSteps(graph, fromId);
  if (fromId !== toId && !via.has(toId)) return undefined;
  const path: GraphStep[] = [];
  for (let at = toId; at !== fromId; ) {
    const step = via.get(at)!;
    path.unshift(step);
    at = step.from;
  }
  return path;
}

/** Breadth-first walk over steps: visit order and the step that first reached each component. */
function walkSteps(graph: Map<string, GraphStep[]>, start: string): { order: string[]; via: Map<string, GraphStep> } {
  const order = [start];
  const via = new Map<string, GraphStep>();
  const visited = new Set([start]);
  for (let i = 0; i < order.length; i++) {
    for (const step of graph.get(order[i]) ?? []) {
      if (visited.has(step.to)) continue;
      visited.add(step.to);
      via.set(step.to, step);
      order.push(step.to);
    }
  }
  return { order, via };
}

/** Connection filter for the older helpers: optional domains, resolved like `GraphFilter`. Associations are never followed. */
export type ConnectionFilter = Pick<GraphFilter, 'domains' | 'resolvePorts'>;

/** Domains whose ports are joined physically (fluid, mechanical and the deprecated `electrical`, as `matesPhysically`): the filter for assemblies, which move parts that are bolted together. */
export const physicalDomains: readonly PortKind[] = ['fluid', 'mechanical', 'electrical'];

/** Connections touching `instanceId`, optionally only in some domains. Associations are separate (`scene.associations`). */
export function connectionsOf(scene: ScadaScene, instanceId: string, filter: ConnectionFilter = {}): SceneConnection[] {
  const keep = connectionMatcher(scene, filter);
  return scene.connections.filter((c) => (c.from.instanceId === instanceId || c.to.instanceId === instanceId) && keep(c));
}

function connectionMatcher(scene: ScadaScene, filter: ConnectionFilter): (c: SceneConnection) => boolean {
  if (!filter.domains) return () => true;
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  return (c) => {
    const domain = domainOf(c, filter.resolvePorts, byId);
    return domain !== undefined && filter.domains!.includes(domain);
  };
}

function adjacency(scene: ScadaScene, filter: ConnectionFilter = {}): Map<string, string[]> {
  const neighbours = new Map<string, string[]>(scene.components.map((c) => [c.id, []]));
  const keep = connectionMatcher(scene, filter);
  for (const c of scene.connections) {
    if (!keep(c)) continue;
    neighbours.get(c.from.instanceId)?.push(c.to.instanceId);
    neighbours.get(c.to.instanceId)?.push(c.from.instanceId);
  }
  return neighbours;
}

function walk(neighbours: Map<string, string[]>, start: string, visited: Set<string>): string[] {
  // Iterative breadth-first search: cycles stop at visited nodes and long chains cannot overflow the stack.
  const order = [start];
  visited.add(start);
  for (let i = 0; i < order.length; i++) {
    for (const next of neighbours.get(order[i]) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        order.push(next);
      }
    }
  }
  return order;
}

/**
 * Component ids connected to `instanceId` through any path, ignoring edge direction, in
 * breadth-first order following scene connection order. Empty for an unknown id.
 */
export function reachableComponents(scene: ScadaScene, instanceId: string, filter: ConnectionFilter = {}): string[] {
  const neighbours = adjacency(scene, filter);
  return neighbours.has(instanceId) ? walk(neighbours, instanceId, new Set()) : [];
}

/** Disconnected networks, each in breadth-first order, ordered by their first component in the scene. */
export function connectedGroups(scene: ScadaScene, filter: ConnectionFilter = {}): string[][] {
  const neighbours = adjacency(scene, filter);
  const visited = new Set<string>();
  const groups: string[][] = [];
  for (const c of scene.components) {
    if (!visited.has(c.id)) groups.push(walk(neighbours, c.id, visited));
  }
  return groups;
}
