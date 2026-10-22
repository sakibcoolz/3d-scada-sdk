import type { ComponentInstance, ComponentType, ViewKind } from '@sakibcoolz/core';

// Built-in 2D symbols (ADR-0026) as plain data: ISA-5.1-style process symbols for the 14 built-in kinds
// and the `sdk.*` library. The standards are a reference only; no compliance is claimed. Coordinates
// are drawing units (1 mm) from the symbol's top-left corner, y down.

export type Point = [number, number];

/** One stroke of a symbol. Strokes use the view's line colour; nothing is filled unless `fill` is set. */
export type SymbolShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; fill?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polygon'; points: Point[]; fill?: boolean }
  | { kind: 'polyline'; points: Point[] }
  | { kind: 'text'; x: number; y: number; text: string; size?: number };

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

/**
 * The built-in symbol for a component in a view, or undefined when there is none (the view then
 * draws a labelled box). A transmitter's letters follow what it measures.
 */
export function builtInSymbol(view: ViewKind, component: Pick<ComponentInstance, 'type' | 'properties'>): SymbolDefinition | undefined {
  if (view !== 'process') return undefined;
  if (component.type === 'sdk.transmitter') return bubble(`${MEASURED[String(component.properties.measures ?? 'pressure')] ?? 'X'}T`);
  return processSymbols[component.type as ComponentType];
}

/** A plain box with the type's label, for types without a symbol. */
export function fallbackSymbol(label: string): SymbolDefinition {
  const text = label.length > 14 ? `${label.slice(0, 13)}…` : label;
  return { width: 44, height: 24, shapes: [{ kind: 'rect', x: 0, y: 0, width: 44, height: 24 }, { kind: 'text', x: 22, y: 14, text, size: 4 }] };
}
