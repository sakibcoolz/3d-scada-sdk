import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  canonicalUnits,
  connectProvider,
  createObservationStore,
  resolveTelemetry,
  type DataProvider,
  type Observation,
  type PropertyState,
  type ScadaScene,
  type TelemetryUnknownReason,
  type ValueSource,
  type ViewKind,
} from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { layoutView, placeSymbol, type DrawnEdge, type PlacedSymbol } from './model.js';
import type { SymbolShape } from './symbols.js';

// One SVG diagram over the scene (ADR-0026): symbols, lines, selection, pan and zoom, live values,
// and, when editable, dragging a symbol to save its place. All text is React text, never markup.

export interface ViewTelemetry {
  /** Observations passed directly. */
  observations?: readonly Observation[];
  /** Optional host provider, subscribed while mounted. The SDK opens no connection itself. */
  provider?: DataProvider;
  /** Default MEASURED; measured and simulated values are never mixed. */
  source?: ValueSource;
  staleAfterMs?: number;
}

export interface DiagramViewProps {
  scene: ScadaScene;
  /** Component types (ADR-0022); built-in kinds by default. */
  registry?: ComponentRegistry;
  /** Selected component ids. Pass with `onSelectionChange` to share selection with other views. */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  telemetry?: ViewTelemetry;
  /** Lets the user drag symbols; each drop saves `views.<view>.symbols[id]` through `onChange`. */
  editable?: boolean;
  onChange?: (scene: ScadaScene) => void;
  style?: React.CSSProperties;
}

const colors = {
  background: '#0f1d2c',
  grid: '#1a2b3c',
  line: '#9fb3c8',
  selected: '#ffd166',
  text: '#ebf2fa',
  muted: '#8a96a3',
  unknown: '#e7a33e',
  wire: { power: '#e8892c', signal: '#3d8bfd', network: '#2fb36d', electrical: '#e8892c', fluid: '#9fb3c8', mechanical: '#9fb3c8' },
} as const;

const reasons: Record<TelemetryUnknownReason, string> = {
  STALE: 'stale',
  BAD_QUALITY: 'bad quality',
  DISCONNECTED: 'disconnected',
  NO_READING: 'no reading',
  INVALID_TIMESTAMP: 'invalid timestamp',
  INVALID_VALUE: 'invalid value',
  INVALID_UNIT: 'invalid unit',
};

/** One line for a bound property, e.g. "level: 55 % · GOOD" or "temperature: unknown (disconnected)". */
export function describeLiveValue(state: PropertyState, unit?: string): string {
  if (state.status === 'unknown') return `${state.property}: unknown (${reasons[state.reason]})`;
  const value = typeof state.value === 'number' ? String(Math.round(state.value * 100) / 100) : String(state.value);
  return `${state.property}: ${value}${unit ? ` ${unit}` : ''} · ${state.quality}`;
}

function useObservations(telemetry: ViewTelemetry | undefined): readonly Observation[] {
  const [store] = useState(() => createObservationStore());
  const provider = telemetry?.provider;
  useEffect(() => (provider ? connectProvider(store, provider) : undefined), [store, provider]);
  const fed = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useMemo(() => [...(telemetry?.observations ?? []), ...fed], [telemetry?.observations, fed]);
}

/** A clock that ticks each second while telemetry is shown, so values age into STALE. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Shape({ shape, stroke }: { shape: SymbolShape; stroke: string }) {
  const common = { stroke, strokeWidth: 1, fill: 'fill' in shape && shape.fill ? stroke : 'none', vectorEffect: 'non-scaling-stroke' as const };
  switch (shape.kind) {
    case 'rect': return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...common} />;
    case 'circle': return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
    case 'line': return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
    case 'polygon': return <polygon points={shape.points.map((p) => p.join(',')).join(' ')} {...common} />;
    case 'polyline': return <polyline points={shape.points.map((p) => p.join(',')).join(' ')} {...common} />;
    case 'text': return <text x={shape.x} y={shape.y} fontSize={shape.size ?? 5} textAnchor="middle" fill={stroke} fontFamily="system-ui, sans-serif">{shape.text}</text>;
  }
}

function Edge({ edge }: { edge: DrawnEdge }) {
  const color = edge.kind === 'association' ? colors.muted : colors.wire[edge.domain ?? 'fluid'];
  const width = edge.domain === 'fluid' ? 1.6 : 1;
  return (
    <polyline
      data-edge-id={edge.id}
      data-edge-kind={edge.kind}
      points={edge.points.map((p) => p.join(',')).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={edge.kind === 'association' ? '4 3' : edge.domain === 'mechanical' ? '1 2' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

type Camera = { x: number; y: number; width: number; height: number };

/** The shared SVG diagram; `ProcessView` and `ElectricalView` choose the view. */
export function DiagramView({ view, label, scene, registry = builtInRegistry, selectedIds, onSelectionChange, telemetry, editable = false, onChange, style }: DiagramViewProps & { view: ViewKind; label: string }) {
  const drawing = useMemo(() => layoutView(scene, view, registry), [scene, view, registry]);
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selection = selectedIds ?? ownSelection;
  const select = (ids: string[]) => {
    if (!selectedIds) setOwnSelection(ids);
    onSelectionChange?.(ids);
  };

  const observations = useObservations(telemetry);
  const now = useNow(!!telemetry);
  const live = useMemo(() => {
    if (!telemetry) return new Map<string, string[]>();
    const { properties } = resolveTelemetry(scene, observations, { now, source: telemetry.source, staleAfterMs: telemetry.staleAfterMs, resolveBindable: registry.resolvers.resolveBindable });
    const types = new Map(scene.components.map((c) => [c.id, c.type]));
    const lines = new Map<string, string[]>();
    for (const state of properties) {
      const quantity = registry.resolvers.resolveBindable(types.get(state.instanceId) ?? '')?.[state.property];
      lines.set(state.instanceId, [...(lines.get(state.instanceId) ?? []), describeLiveValue(state, quantity && canonicalUnits[quantity])]);
    }
    return lines;
  }, [telemetry, scene, observations, now, registry]);

  // Camera: fitted to the drawing until the user pans or zooms.
  const fit = (): Camera => {
    const b = drawing.bounds ?? { minX: 0, minY: 0, maxX: 200, maxY: 120 };
    const pad = 20;
    return { x: b.minX - pad, y: b.minY - pad, width: b.maxX - b.minX + 2 * pad, height: b.maxY - b.minY + 2 * pad };
  };
  const [camera, setCamera] = useState<Camera | undefined>();
  const shown = camera ?? fit();
  const svg = useRef<SVGSVGElement>(null);
  const toDrawing = (event: { clientX: number; clientY: number }): [number, number] => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return [0, 0];
    // preserveAspectRatio="xMidYMid meet": one scale for both axes, content centred.
    const scale = Math.max(shown.width / box.width, shown.height / box.height);
    const ox = shown.x + shown.width / 2 - (box.width * scale) / 2, oy = shown.y + shown.height / 2 - (box.height * scale) / 2;
    return [ox + (event.clientX - box.left) * scale, oy + (event.clientY - box.top) * scale];
  };
  const zoomRef = useRef<(factor: number) => void>(() => {});
  // A non-passive listener, so zooming with the wheel does not also scroll the page.
  useEffect(() => {
    const element = svg.current;
    if (!element) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(e.deltaY > 0 ? 1.2 : 1 / 1.2);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);
  const zoom = (factor: number) => setCamera({ x: shown.x + (shown.width * (1 - factor)) / 2, y: shown.y + (shown.height * (1 - factor)) / 2, width: shown.width * factor, height: shown.height * factor });

  zoomRef.current = zoom;

  // One gesture at a time: panning the background, or dragging a symbol.
  const gesture = useRef<{ kind: 'pan'; start: [number, number]; camera: Camera; moved: boolean } | { kind: 'drag'; id: string; start: [number, number]; origin: [number, number]; at?: [number, number]; moved: boolean; additive: boolean } | undefined>(undefined);
  const [dragged, setDragged] = useState<{ id: string; x: number; y: number } | undefined>();

  const onBackgroundDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    gesture.current = { kind: 'pan', start: toDrawing(e), camera: shown, moved: false };
  };
  const onSymbolDown = (e: React.PointerEvent, s: PlacedSymbol) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    gesture.current = { kind: 'drag', id: s.id, start: toDrawing(e), origin: [s.x, s.y], moved: false, additive: e.shiftKey };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const [x, y] = toDrawing(e);
    if (g.kind === 'pan') {
      const dx = x - g.start[0], dy = y - g.start[1];
      if (Math.hypot(dx, dy) > 1) g.moved = true;
      if (g.moved) setCamera({ ...shown, x: shown.x - dx, y: shown.y - dy });
    } else if (editable) {
      const dx = x - g.start[0], dy = y - g.start[1];
      if (Math.hypot(dx, dy) > 2) g.moved = true;
      if (g.moved) {
        g.at = [g.origin[0] + dx, g.origin[1] + dy];
        setDragged({ id: g.id, x: g.at[0], y: g.at[1] });
      }
    }
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = undefined;
    if (!g) return;
    if (g.kind === 'pan') {
      if (!g.moved) select([]);
    } else if (g.moved && g.at) {
      setDragged(undefined);
      onChange?.(placeSymbol(scene, view, g.id, g.at[0], g.at[1]));
    } else {
      toggle(g.id, g.additive);
    }
  };
  const toggle = (id: string, additive: boolean) =>
    select(additive ? (selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]) : [id]);

  return (
    <div style={{ position: 'relative', background: colors.background, color: colors.text, fontFamily: 'system-ui, sans-serif', ...style }}>
      <svg
        ref={svg}
        role="group"
        aria-label={label}
        viewBox={`${shown.x} ${shown.y} ${shown.width} ${shown.height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <rect x={shown.x} y={shown.y} width={shown.width} height={shown.height} fill={colors.background} />
        {drawing.edges.map((edge) => {
          const moved = dragged && (edge.from === dragged.id || edge.to === dragged.id);
          return <g key={edge.id} opacity={moved ? 0.35 : 1}><Edge edge={edge} /></g>;
        })}
        {drawing.symbols.map((s) => {
          const selected = selection.includes(s.id);
          const stroke = selected ? colors.selected : colors.line;
          const [x, y] = dragged?.id === s.id ? [dragged.x, dragged.y] : [s.x, s.y];
          const lines = live.get(s.id) ?? [];
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`${s.label}${s.placed ? '' : ' (unplaced)'}`}
              aria-pressed={selected}
              data-component-id={s.id}
              data-x={s.x}
              data-y={s.y}
              data-placed={s.placed}
              transform={`translate(${x} ${y})`}
              style={{ cursor: editable ? 'move' : 'pointer', outline: 'none' }}
              onPointerDown={(e) => onSymbolDown(e, s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(s.id, e.shiftKey);
                }
              }}
            >
              <g transform={`rotate(${s.rotation}) translate(${-s.symbol.width / 2} ${-s.symbol.height / 2})`}>
                {/* Outlines leave the inside unpainted; this makes the whole symbol clickable and draggable. */}
                <rect x={-3} y={-3} width={s.symbol.width + 6} height={s.symbol.height + 6} fill="transparent" />
                {!s.placed && <rect x={-3} y={-3} width={s.symbol.width + 6} height={s.symbol.height + 6} fill="none" stroke={colors.muted} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
                {selected && <rect x={-4} y={-4} width={s.symbol.width + 8} height={s.symbol.height + 8} fill={colors.selected} opacity={0.12} />}
                {s.symbol.shapes.map((shape, i) => <Shape key={i} shape={shape} stroke={stroke} />)}
              </g>
              <text y={Math.max(s.symbol.width, s.symbol.height) / 2 + 8} fontSize={7} textAnchor="middle" fill={colors.text}>{s.label}</text>
              {lines.map((line, i) => (
                <text key={i} y={Math.max(s.symbol.width, s.symbol.height) / 2 + 15 + i * 6} fontSize={5.5} textAnchor="middle" fill={line.includes('unknown') ? colors.unknown : colors.muted}>{line}</text>
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
        <button type="button" aria-label={`Zoom in ${label}`} onClick={() => zoom(1 / 1.25)}>+</button>
        <button type="button" aria-label={`Zoom out ${label}`} onClick={() => zoom(1.25)}>−</button>
        <button type="button" aria-label={`Fit ${label}`} onClick={() => setCamera(undefined)}>Fit</button>
      </div>
    </div>
  );
}

/** The process diagram (P&ID style): vessels, pumps, valves, pipes and instruments (ADR-0026). */
export function ProcessView(props: DiagramViewProps) {
  return <DiagramView {...props} view="process" label="Process view" />;
}
