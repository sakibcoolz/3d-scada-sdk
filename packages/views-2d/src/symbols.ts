import type { ComponentInstance, ComponentType, ConnectionPort, ViewKind } from '@sakibcoolz/core';
import type { RegisteredSymbol } from '@sakibcoolz/components';

// Built-in 2D symbols (ADR-0026) as plain data: ISA-5.1-style process symbols for the 14 built-in kinds
// and the `sdk.*` library, and IEC-60617-style electrical symbols generated from a type's terminals.
// The standards are a reference only; no compliance is claimed. Coordinates
// are drawing units (1 mm) from the symbol's top-left corner, y down.

export type Point = [number, number];

/** One stroke of a symbol. Strokes use the view's line colour; nothing is filled unless `fill` is set. */
export type SymbolShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; fill?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polygon'; points: Point[]; fill?: boolean }
  | { kind: 'polyline'; points: Point[] }
  | { kind: 'text'; x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end' }
  /** A sanitized host path (ADR-0026), already transformed into symbol units, in its own colours. */
  | { kind: 'path'; d: string; transform: [number, number, number, number, number, number]; fill: string; stroke: string; strokeWidth: number };

export interface SymbolDefinition {
  width: number;
  height: number;
  shapes: SymbolShape[];
  /** Where named ports meet the symbol; other ports are mapped from their 3D position (`portAnchor`). */
  ports?: Readonly<Record<string, Point>>;
}

/** An instrument bubble with its ISA tag letters, e.g. "LT" for a level transmitter. */
const bubble = (letters: string): SymbolDefinition => ({
  width: 24,
  height: 24,
  shapes: [{ kind: 'circle', cx: 12, cy: 12, r: 11 }, { kind: 'text', x: 12, y: 14.5, text: letters, size: 7 }],
});
const motor: SymbolDefinition = { width: 26, height: 26, shapes: [{ kind: 'circle', cx: 13, cy: 13, r: 12 }, { kind: 'text', x: 13, y: 16, text: 'M', size: 9 }] };

const processSymbols: Record<string, SymbolDefinition> = {
  tank: { width: 40, height: 60, shapes: [{ kind: 'rect', x: 0, y: 0, width: 40, height: 60, rx: 8 }] },
  conicalTank: { width: 40, height: 60, shapes: [{ kind: 'polygon', points: [[0, 0], [40, 0], [40, 40], [20, 60], [0, 40]] }] },
  horizontalTank: { width: 70, height: 36, shapes: [{ kind: 'rect', x: 0, y: 0, width: 70, height: 36, rx: 16 }] },
  sphericalTank: {
    width: 50,
    height: 56,
    shapes: [{ kind: 'circle', cx: 25, cy: 25, r: 24 }, { kind: 'line', x1: 8, y1: 42, x2: 4, y2: 56 }, { kind: 'line', x1: 42, y1: 42, x2: 46, y2: 56 }],
  },
  pool: { width: 70, height: 30, shapes: [{ kind: 'polyline', points: [[0, 0], [0, 30], [70, 30], [70, 0]] }] },
  pipe: { width: 40, height: 6, shapes: [{ kind: 'line', x1: 0, y1: 3, x2: 40, y2: 3 }] },
  elbow: { width: 12, height: 12, shapes: [{ kind: 'polyline', points: [[0, 6], [6, 6], [6, 12]] }] },
  tee: { width: 20, height: 12, shapes: [{ kind: 'line', x1: 0, y1: 6, x2: 20, y2: 6 }, { kind: 'line', x1: 10, y1: 6, x2: 10, y2: 0 }] },
  reducer: { width: 16, height: 12, shapes: [{ kind: 'polygon', points: [[0, 0], [16, 3], [16, 9], [0, 12]] }] },
  coupler: { width: 8, height: 10, shapes: [{ kind: 'rect', x: 0, y: 0, width: 8, height: 10 }] },
  valve: {
    width: 24,
    height: 16,
    shapes: [{ kind: 'polygon', points: [[0, 0], [12, 8], [0, 16]] }, { kind: 'polygon', points: [[24, 0], [12, 8], [24, 16]] }],
    ports: { in: [0, 8], out: [24, 8] },
  },
  pump: {
    width: 30,
    height: 30,
    shapes: [{ kind: 'circle', cx: 15, cy: 15, r: 14 }, { kind: 'line', x1: 15, y1: 1, x2: 30, y2: 1 }, { kind: 'polygon', points: [[9, 24], [21, 24], [15, 29]], fill: true }],
    ports: { suction: [1, 15], discharge: [30, 1] },
  },
  sensor: bubble('XT'),
  motor,
  'sdk.motor': motor,
  'sdk.switch': bubble('XS'),
};

/** ISA first letter by measured quantity, for transmitters. */
const MEASURED: Record<string, string> = { pressure: 'P', temperature: 'T', level: 'L', flow: 'F' };

const transmitterLetters = (component: Pick<ComponentInstance, 'properties'>) => `${MEASURED[String(component.properties.measures ?? 'pressure')] ?? 'X'}T`;

/** A motor as a terminal-fed circle: power terminals on top, earth below. */
const electricalMotor: SymbolDefinition = { ...motor, ports: { terminals: [13, 0], PE: [13, 26] } };
/** An instrument bubble wired from its sides: supply on the left, output on the right. */
const wiredBubble = (letters: string): SymbolDefinition => ({ ...bubble(letters), ports: { '24V': [0, 12], out: [24, 12] } });

/**
 * The built-in symbol for a component in a view, or undefined when there is none. In the process view
 * a type without one gets a labelled box; in the electrical view, a terminal block (`terminalBlock`).
 * A transmitter's letters follow what it measures.
 */
export function builtInSymbol(view: ViewKind, component: Pick<ComponentInstance, 'type' | 'properties'>): SymbolDefinition | undefined {
  if (view === 'electrical') {
    if (component.type === 'sdk.motor' || component.type === 'motor') return electricalMotor;
    if (component.type === 'sdk.transmitter') return wiredBubble(transmitterLetters(component));
    if (component.type === 'sdk.switch') return wiredBubble('XS');
    return undefined;
  }
  if (component.type === 'sdk.transmitter') return bubble(transmitterLetters(component));
  return processSymbols[component.type as ComponentType];
}

type Side = 'left' | 'right' | 'top' | 'bottom';
/** Inputs on the left, outputs on the right, network on top, protective earth at the bottom. */
function terminalSide(port: ConnectionPort): Side {
  if (port.kind === 'network') return 'top';
  if (port.power?.kind === 'PE') return 'bottom';
  if (port.flow === 'out' || port.signal?.type === 'DO' || port.signal?.type === 'AO') return 'right';
  return 'left';
}

/**
 * An electrical terminal block for any type (IEC-60617 style): a box titled with the type's label and
 * one labelled terminal per wired port, placed by `terminalSide`. Mechanical and fluid ports are left
 * out. Terminal labels are the port's `terminal`, else its id.
 */
export function terminalBlock(title: string, ports: readonly ConnectionPort[]): SymbolDefinition {
  const wired = ports.filter((p) => p.kind !== 'fluid' && p.kind !== 'mechanical');
  const sides: Record<Side, ConnectionPort[]> = { left: [], right: [], top: [], bottom: [] };
  for (const p of wired) sides[terminalSide(p)].push(p);
  const pitch = 8, head = 14;
  const rows = Math.max(sides.left.length, sides.right.length, 1);
  const width = Math.max(56, (Math.max(sides.top.length, sides.bottom.length) + 1) * 12);
  const height = head + rows * pitch + (sides.bottom.length > 0 ? 10 : 4);
  const name = title.length > 18 ? `${title.slice(0, 17)}…` : title;
  const shapes: SymbolShape[] = [{ kind: 'rect', x: 0, y: 0, width, height }, { kind: 'text', x: width / 2, y: 8, text: name, size: 4.5 }];
  const anchors: Record<string, Point> = {};
  const place = (p: ConnectionPort, at: Point, label: Point, anchor: 'start' | 'middle' | 'end') => {
    anchors[p.id] = at;
    shapes.push({ kind: 'circle', cx: at[0], cy: at[1], r: 1.4, fill: true }, { kind: 'text', x: label[0], y: label[1], text: p.terminal ?? p.id, size: 3.2, anchor });
  };
  sides.left.forEach((p, i) => place(p, [0, head + i * pitch + 2], [3, head + i * pitch + 3], 'start'));
  sides.right.forEach((p, i) => place(p, [width, head + i * pitch + 2], [width - 3, head + i * pitch + 3], 'end'));
  sides.top.forEach((p, i) => place(p, [((i + 1) * width) / (sides.top.length + 1), 0], [((i + 1) * width) / (sides.top.length + 1), -2], 'middle'));
  sides.bottom.forEach((p, i) => place(p, [((i + 1) * width) / (sides.bottom.length + 1), height], [((i + 1) * width) / (sides.bottom.length + 1), height - 2.5], 'middle'));
  return { width, height, shapes, ports: anchors };
}

/** 2D affine product a · b, both [a b c d e f] as in SVG `matrix()`. */
const multiply = (a: readonly number[], b: readonly number[]): [number, number, number, number, number, number] =>
  [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** A host's sanitized symbol (ADR-0026), its viewBox scaled onto its width and height. */
export function hostSymbol(symbol: RegisteredSymbol): SymbolDefinition {
  const [vx, vy, vw, vh] = symbol.drawing.viewBox;
  const fit = [symbol.width / vw, 0, 0, symbol.height / vh, (-vx * symbol.width) / vw, (-vy * symbol.height) / vh];
  return {
    width: symbol.width,
    height: symbol.height,
    shapes: symbol.drawing.shapes.map((s) => ({ kind: 'path', d: s.d, transform: multiply(fit, s.transform), fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth })),
    ...(symbol.ports ? { ports: Object.fromEntries(Object.entries(symbol.ports).map(([id, [x, y]]) => [id, [x, y] as Point])) } : {}),
  };
}

/** A plain box with the type's label, for types without a symbol. */
export function fallbackSymbol(label: string): SymbolDefinition {
  const text = label.length > 14 ? `${label.slice(0, 13)}…` : label;
  return { width: 44, height: 24, shapes: [{ kind: 'rect', x: 0, y: 0, width: 44, height: 24 }, { kind: 'text', x: 22, y: 14, text, size: 4 }] };
}
