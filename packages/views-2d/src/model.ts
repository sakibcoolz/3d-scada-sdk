import { isBuiltInKind, type ComponentInstance, type ConnectionPort, type PortKind, type Relationship, type ScadaScene, type SymbolPlacement, type ViewKind } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { builtInSymbol, fallbackSymbol, hostSymbol, terminalBlock, type Point, type SymbolDefinition } from './symbols.js';

// What a 2D view shows and where (ADR-0026). Pure and deterministic: the same scene always gives
// the same drawing. Saved placements and routes are used as they are; everything else is laid out
// automatically and marked unplaced. Nothing here changes the scene except `placeSymbol`.

/** Grid that automatic placement and dragging snap to, in drawing units. */
export const GRID = 10;
const MARGIN = 40, ROW_GAP = 40;
/** Column spacing per view: wiring needs more room between terminal blocks than pipes do. */
const COLUMN: Record<ViewKind, number> = { process: 120, electrical: 170 };

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
 * Columns for automatic placement in the process view: layers along connection direction (from → to),
 * in scene order, with a cycle broken at the first remaining component. Components with only
 * associations join their first partner's column, after the connected ones.
 */
function processColumns(members: ComponentInstance[], edges: { from: string; to: string; kind: DrawnEdge['kind'] }[]): string[][] {
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
  return toColumns([...order.filter((id) => connected.has(id)), ...order.filter((id) => !connected.has(id))], layer);
}

/** Ids grouped by column, keeping their order. */
function toColumns(order: string[], column: ReadonlyMap<string, number>): string[][] {
  const columns: string[][] = [];
  for (const id of order) (columns[column.get(id)!] ??= []).push(id);
  return columns.map((c) => c ?? []);
}

/**
 * The electrical view's columns, left to right (ADR-0026): supplies, controllers and network, I/O
 * cards, field devices, then loads. Decided from port kinds only.
 */
export function electricalTier(ports: readonly ConnectionPort[]): 0 | 1 | 2 | 3 | 4 {
  const wired = ports.filter((p) => p.kind !== 'fluid' && p.kind !== 'mechanical' && p.power?.kind !== 'PE');
  const signal = wired.some((p) => p.kind === 'signal');
  if (signal && wired.every((p) => p.kind === 'signal')) return 2; // I/O card
  if (signal) return 3; // field device: drive, transmitter, sensor
  if (wired.some((p) => p.kind === 'network')) return 1; // controller or switch
  if (wired.some((p) => p.kind === 'power' && p.flow === 'out') || wired.length === 0) return 0; // supply, earth bar
  return 4; // load: motor
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

  // Symbols first: a host's own, else the view's built-in, else a terminal block (electrical) or a labelled box.
  const definitions = new Map(members.map((c) => [c.id, registry.definitionFor(c.type, c.properties)]));
  const symbolOf = new Map(members.map((c) => {
    const definition = definitions.get(c.id)!;
    const own = definition.symbols?.[view];
    const symbol = own ? hostSymbol(own) : builtInSymbol(view, c) ?? (view === 'electrical' ? terminalBlock(definition.label, definition.ports) : fallbackSymbol(definition.label));
    return [c.id, symbol] as const;
  }));

  // Automatic places: columns per view, rows stacked by symbol height, below any saved symbols.
  const columns = view === 'process'
    ? processColumns(members, candidates)
    : toColumns(members.map((c) => c.id), new Map(members.map((c) => [c.id, electricalTier(definitions.get(c.id)!.ports)])));
  const savedBottom = Math.max(-Infinity, ...members.filter((c) => savedSymbols[c.id]).map((c) => savedSymbols[c.id].y + symbolOf.get(c.id)!.height / 2));
  const top = Number.isFinite(savedBottom) ? savedBottom + ROW_GAP : MARGIN;
  const auto = new Map<string, Point>();
  columns.forEach((ids, column) => {
    let y = top;
    for (const id of ids.filter((id) => !savedSymbols[id])) {
      const height = symbolOf.get(id)!.height;
      auto.set(id, [snap(MARGIN + column * COLUMN[view]), snap(y + height / 2)]);
      y += height + ROW_GAP;
    }
  });

  const symbols: PlacedSymbol[] = members.map((c) => {
    const definition = definitions.get(c.id)!;
    const symbol = symbolOf.get(c.id)!;
    const own = savedSymbols[c.id];
    const [x, y] = own ? [own.x, own.y] : auto.get(c.id)!;
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
