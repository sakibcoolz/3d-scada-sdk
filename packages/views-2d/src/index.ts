// @sakibcoolz/views-2d: process and electrical 2D views (SVG) over one scene (ADR-0026).
export { DiagramView, ElectricalView, ProcessView, describeLiveValue, describeStatus, statusColors } from './DiagramView.js';
export type { DiagramViewProps, ViewTelemetry } from './DiagramView.js';
export { GRID, electricalTier, inView, layoutView, orthogonalRoute, placeSymbol, portAnchor } from './model.js';
export type { DrawnEdge, PlacedSymbol, ViewDrawing } from './model.js';
export { builtInSymbol, fallbackSymbol, hostSymbol, terminalBlock } from './symbols.js';
export type { Point, SymbolDefinition, SymbolShape } from './symbols.js';
