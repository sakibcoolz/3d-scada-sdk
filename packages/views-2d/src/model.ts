import { isBuiltInKind, type ComponentInstance, type PortKind, type Relationship, type ScadaScene, type SymbolPlacement, type ViewKind } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { builtInSymbol, fallbackSymbol, type Point, type SymbolDefinition } from './symbols.js';

// What a 2D view shows and where (ADR-0026). Pure and deterministic: the same scene always gives
// the same drawing. Saved placements and routes are used as they are; everything else is laid out
// automatically and marked unplaced. Nothing here changes the scene except `placeSymbol`.

/** Grid that automatic placement and dragging snap to, in drawing units. */
export const GRID = 10;
const MARGIN = 40, COLUMN = 120, ROW = 90;

/** Port kinds each view draws as lines, and the associations it draws dashed. */
const viewDomains: Record<ViewKind, readonly PortKind[]> = { process: ['fluid', 'mechanical'], electrical: ['power', 'signal', 'network', 'electrical'] };
const viewRelationships: Record<ViewKind, readonly Relationship[]> = { process: ['measures', 'drives'], electrical: ['controls', 'communicates'] };

export interface PlacedSymbol {
  id: string;
  /** Centre, in drawing units. */
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  /** False when the position was chosen automatically and not saved. */
  placed: boolean;
  /** The component's name, else its id. Display text only, never markup. */
  label: string;
  symbol: SymbolDefinition;
  /** Where each port meets the symbol, in drawing units. */
  anchors: Readonly<Record<string, Point>>;
}

export interface DrawnEdge {
  id: string;
  kind: 'connection' | 'association';
  /** Port kind of a connection; undefined for an association. */
  domain?: PortKind;
  relationship?: Relationship;
  from: string;
  to: string;
  points: Point[];
  /** False when the route was computed and not saved. */
  routed: boolean;
}

export interface ViewDrawing {
  symbols: PlacedSymbol[];
  edges: DrawnEdge[];
  /** Box around every symbol and edge, or undefined for an empty view. */
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * Whether a component appears in a view: its definition's `views` when set; otherwise every built-in
 * kind is process equipment, and other types join the views their port kinds belong to.
 */
export function inView(view: ViewKind, component: ComponentInstance, registry: ComponentRegistry = builtInRegistry): boolean {
  const definition = registry.definitionFor(component.type, component.properties);
  if (definition.views) return definition.views.includes(view);
  if (isBuiltInKind(component.type)) return view === 'process';
  return definition.ports.some((p) => viewDomains[view].includes(p.kind));
}

/** Rotates a symbol-local point about the symbol's centre. */
function rotate([x, y]: Point, width: number, height: number, rotation: number): Point {
  const dx = x - width / 2, dy = y - height / 2;
  const [cos, sin] = [Math.round(Math.cos((rotation * Math.PI) / 180)), Math.round(Math.sin((rotation * Math.PI) / 180))];
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/**
 * Where a port meets a symbol, relative to the symbol's top-left corner: the symbol's own `ports`
 * entry, else the port's 3D position seen from the front (x right, y up) scaled into the symbol box.
 */
export function portAnchor(symbol: SymbolDefinition, port: { id: string; position: readonly number[] }, bounds: { min: readonly number[]; max: readonly number[] }): Point {
  const own = symbol.ports?.[port.id];
  if (own) return own;
  const span = (i: number) => bounds.max[i] - bounds.min[i] || 1;
  return [((port.position[0] - bounds.min[0]) / span(0)) * symbol.width, ((bounds.max[1] - port.position[1]) / span(1)) * symbol.height];
}

/**
 * Layers for automatic placement: along connection direction (from → to), in scene order, with a
 * cycle broken at the first remaining component. Components with only associations join their first
 * partner's layer.
 */
function autoPositions(members: ComponentInstance[], edges: { from: string; to: string; kind: DrawnEdge['kind'] }[]): Map<string, Point> {
  const ids = members.map((c) => c.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const connected = new Set<string>();
  for (const e of edges) {
    if (e.kind !== 'connection') continue;
    out.get(e.from)!.push(e.to);
    indegree.set(e.to, indegree.get(e.to)! + 1);
    connected.add(e.from).add(e.to);
  }
  const layer = new Map<string, number>();
  const order: string[] = [];
  const done = new Set<string>();
  const remaining = new Map(indegree);
  const ready = ids.filter((id) => remaining.get(id) === 0);
  while (order.length < ids.length) {
    const next = ready.shift() ?? ids.find((id) => !done.has(id))!;
    if (done.has(next)) continue;
    done.add(next);
    order.push(next);
    if (!layer.has(next)) layer.set(next, 0);
    for (const to of out.get(next)!) {
      if (done.has(to)) continue;
      layer.set(to, Math.max(layer.get(to) ?? 0, layer.get(next)! + 1));
      remaining.set(to, remaining.get(to)! - 1);
      if (remaining.get(to) === 0) ready.push(to);
    }
  }
  const joined = new Set(connected);
  for (const e of edges) {
    if (e.kind !== 'association') continue;
    for (const [self, partner] of [[e.from, e.to], [e.to, e.from]]) {
      if (!joined.has(self) && joined.has(partner)) {
        layer.set(self, layer.get(partner)!);
        joined.add(self);
      }
    }
  }
  const rows = new Map<number, number>();
  const positions = new Map<string, Point>();
  // Connected components take the first rows, so association partners land below what they relate to.
  for (const id of [...order.filter((id) => connected.has(id)), ...order.filter((id) => !connected.has(id))]) {
    const l = layer.get(id)!;
    const row = rows.get(l) ?? 0;
    rows.set(l, row + 1);
    positions.set(id, [snap(MARGIN + l * COLUMN), snap(MARGIN + row * ROW)]);
  }
  return positions;
}

/**
 * An association's line between two symbols: from edge to edge along the axis they are furthest
 * apart on, so it never crosses either symbol, turning halfway with at most two bends.
 */
function betweenSymbols(a: PlacedSymbol, b: PlacedSymbol): Point[] {
  const size = (s: PlacedSymbol) => (s.rotation % 180 === 0 ? [s.symbol.width / 2, s.symbol.height / 2] : [s.symbol.height / 2, s.symbol.width / 2]);
  const [aw, ah] = size(a), [bw, bh] = size(b);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = Math.sign(dx) || 1;
    return orthogonalRoute([a.x + s * aw, a.y], [b.x - s * bw, b.y]);
  }
  const s = Math.sign(dy);
  const from: Point = [a.x, a.y + s * ah], to: Point = [b.x, b.y - s * bh];
  if (Math.abs(from[0] - to[0]) < 0.5) return [from, to];
  const mid = snap((from[1] + to[1]) / 2);
  return [from, [from[0], mid], [to[0], mid], to];
}

/** An orthogonal line from `a` to `b` with at most two bends, turning halfway across. */
export function orthogonalRoute(a: Point, b: Point): Point[] {
  if (Math.abs(a[1] - b[1]) < 0.5 || Math.abs(a[0] - b[0]) < 0.5) return [a, b];
  const mid = snap((a[0] + b[0]) / 2);
  return [a, [mid, a[1]], [mid, b[1]], b];
}

/**
 * Everything one view draws: visible member symbols with their positions and port anchors, and the
 * connections and associations between them. Saved symbols and routes win; the rest is placed
 * automatically (unplaced symbols go below the saved ones). Entries for ids that no longer exist are ignored.
 */
export function layoutView(scene: ScadaScene, view: ViewKind, registry: ComponentRegistry = builtInRegistry): ViewDrawing {
  const saved = scene.views?.[view];
  const savedSymbols: Readonly<Record<string, SymbolPlacement>> = saved?.symbols ?? {};
  const members = scene.components.filter((c) => inView(view, c, registry) && !savedSymbols[c.id]?.hidden);
  const memberIds = new Set(members.map((c) => c.id));
  const byId = new Map(members.map((c) => [c.id, c]));

  const portKind = (instanceId: string, portId: string) => {
    const c = byId.get(instanceId);
    return c && registry.definitionFor(c.type, c.properties).ports.find((p) => p.id === portId)?.kind;
  };
  const candidates: Omit<DrawnEdge, 'points' | 'routed'>[] = [];
  for (const c of scene.connections) {
    if (!memberIds.has(c.from.instanceId) || !memberIds.has(c.to.instanceId)) continue;
    const domain = portKind(c.from.instanceId, c.from.portId);
    if (!domain || !viewDomains[view].includes(domain)) continue;
    candidates.push({ id: c.id, kind: 'connection', domain, ...(c.relationship ? { relationship: c.relationship } : {}), from: c.from.instanceId, to: c.to.instanceId });
  }
  for (const a of scene.associations ?? []) {
    if (memberIds.has(a.from) && memberIds.has(a.to) && viewRelationships[view].includes(a.relationship)) {
      candidates.push({ id: a.id, kind: 'association', relationship: a.relationship, from: a.from, to: a.to });
    }
  }

  const auto = autoPositions(members, candidates);
  const savedBottom = Math.max(-Infinity, ...members.filter((c) => savedSymbols[c.id]).map((c) => savedSymbols[c.id].y));
  const shift = Number.isFinite(savedBottom) ? snap(savedBottom + ROW) : 0;
  const symbols: PlacedSymbol[] = members.map((c) => {
    const definition = registry.definitionFor(c.type, c.properties);
    const symbol = builtInSymbol(view, c) ?? fallbackSymbol(definition.label);
    const own = savedSymbols[c.id];
    const [x, y] = own ? [own.x, own.y] : [auto.get(c.id)![0], auto.get(c.id)![1] + shift];
    const rotation = own?.rotation ?? 0;
    const anchors: Record<string, Point> = {};
    for (const port of definition.ports) {
      const [dx, dy] = rotate(portAnchor(symbol, port, definition.bounds), symbol.width, symbol.height, rotation);
      anchors[port.id] = [x + dx, y + dy];
    }
    return { id: c.id, x, y, rotation, placed: !!own, label: c.name ?? c.id, symbol, anchors };
  });

  const placed = new Map(symbols.map((s) => [s.id, s]));
  const scenePorts = new Map(scene.connections.map((c) => [c.id, c]));
  const edges: DrawnEdge[] = candidates.map((e) => {
    const route = saved?.routes?.[e.id];
    if (route) return { ...e, points: route.points.map(([x, y]) => [x, y] as Point), routed: true };
    const connection = e.kind === 'connection' ? scenePorts.get(e.id) : undefined;
    if (!connection) return { ...e, points: betweenSymbols(placed.get(e.from)!, placed.get(e.to)!), routed: false };
    return { ...e, points: orthogonalRoute(placed.get(e.from)!.anchors[connection.from.portId], placed.get(e.to)!.anchors[connection.to.portId]), routed: false };
  });

  let bounds: ViewDrawing['bounds'];
  const grow = (x: number, y: number) => {
    bounds = bounds ? { minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y), maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y) } : { minX: x, minY: y, maxX: x, maxY: y };
  };
  for (const s of symbols) {
    const half = Math.max(s.symbol.width, s.symbol.height) / 2;
    grow(s.x - half, s.y - half);
    grow(s.x + half, s.y + half + 18); // room for the label and a live value
  }
  for (const e of edges) for (const [x, y] of e.points) grow(x, y);
  return { symbols, edges, ...(bounds ? { bounds } : {}) };
}

/**
 * The scene with one symbol saved at (x, y) in a view, snapped to the grid, keeping its rotation and
 * hidden flag. Returns the scene unchanged for an unknown component.
 */
export function placeSymbol(scene: ScadaScene, view: ViewKind, componentId: string, x: number, y: number): ScadaScene {
  if (!scene.components.some((c) => c.id === componentId)) return scene;
  const layout = scene.views?.[view] ?? {};
  const symbols = { ...layout.symbols, [componentId]: { ...layout.symbols?.[componentId], x: snap(x), y: snap(y) } };
  return { ...scene, views: { ...scene.views, [view]: { ...layout, symbols } } };
}
