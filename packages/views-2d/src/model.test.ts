import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { controlLibrary, createComponentRegistry } from '@sakibcoolz/components';
import { GRID, ProcessView, builtInSymbol, inView, layoutView, orthogonalRoute, placeSymbol, portAnchor } from './index.js';

// The process view's model (ADR-0026, T-084): membership by ports, automatic placement, routes and
// saved layouts. Pure, so the same scene always draws the same way.

const registry = createComponentRegistry(...controlLibrary);
const at = (id: string, type: string, properties: ComponentInstance['properties'] = {}, extra: Partial<ComponentInstance> = {}): ComponentInstance =>
  ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties, ...extra });
const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const valid = (doc: object): ScadaScene => {
  const r = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', connections: [], ...doc }, registry.resolvers);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const plant = valid({
  components: [at('TK', 'tank'), at('V', 'valve'), at('P', 'pump'), at('M', 'sdk.motor'), at('LT', 'sdk.transmitter', { measures: 'level' }), at('VFD', 'sdk.vfd'), at('PLC', 'sdk.plc.cpu')],
  connections: [edge('c1', 'TK', 'outlet', 'V', 'in'), edge('c2', 'V', 'out', 'P', 'suction'), edge('w1', 'VFD', 'U-V-W', 'M', 'terminals')],
  associations: [{ id: 'a1', relationship: 'drives', from: 'M', to: 'P' }, { id: 'a2', relationship: 'measures', from: 'LT', to: 'TK' }, { id: 'a3', relationship: 'controls', from: 'PLC', to: 'VFD' }],
});

describe('which components and lines the process view shows', () => {
  it('takes built-in kinds, types with fluid or mechanical ports, and types that ask for it', () => {
    const members = plant.components.filter((c) => inView('process', c, registry)).map((c) => c.id);
    expect(members).toEqual(['TK', 'V', 'P', 'M', 'LT']);
    // The transmitter asks for both views; the drive and PLC have only wiring.
    expect(inView('electrical', plant.components[4], registry)).toBe(true);
    expect(inView('process', plant.components[5], registry)).toBe(false);
  });

  it('draws pipes between members and the process associations, but no wiring', () => {
    const { edges } = layoutView(plant, 'process', registry);
    expect(edges.map((e) => [e.id, e.kind, e.domain ?? e.relationship])).toEqual([
      ['c1', 'connection', 'fluid'],
      ['c2', 'connection', 'fluid'],
      ['a1', 'association', 'drives'],
      ['a2', 'association', 'measures'],
    ]);
  });

  it('labels symbols with the name, else the id, and gives transmitters their ISA letters', () => {
    const named = valid({ components: [at('TK', 'tank', {}, { name: 'Raw milk tank' }), at('LT', 'sdk.transmitter', { measures: 'flow' })] });
    expect(layoutView(named, 'process', registry).symbols.map((s) => s.label)).toEqual(['Raw milk tank', 'LT']);
    expect(builtInSymbol('process', { type: 'sdk.transmitter', properties: { measures: 'flow' } })?.shapes[1]).toMatchObject({ kind: 'text', text: 'FT' });
  });
});

describe('automatic placement and routes', () => {
  it('lays components out left to right along the flow, on the grid, and marks them unplaced', () => {
    const { symbols } = layoutView(plant, 'process', registry);
    const pos = Object.fromEntries(symbols.map((s) => [s.id, [s.x, s.y, s.placed]]));
    expect(pos.TK[0]).toBeLessThan(pos.V[0] as number);
    expect(pos.V[0]).toBeLessThan(pos.P[0] as number);
    // Association-only partners share their partner's column, below it.
    expect(pos.LT[0]).toBe(pos.TK[0]);
    expect(pos.LT[1]).toBeGreaterThan(pos.TK[1] as number);
    for (const s of symbols) {
      expect(s.x % GRID).toBe(0);
      expect(s.y % GRID).toBe(0);
      expect(s.placed).toBe(false);
    }
  });

  it('is deterministic and survives cycles', () => {
    expect(layoutView(plant, 'process', registry)).toEqual(layoutView(plant, 'process', registry));
    const loop = valid({ components: [at('A', 'valve'), at('B', 'valve')], connections: [edge('ab', 'A', 'out', 'B', 'in'), edge('ba', 'B', 'out', 'A', 'in')] });
    expect(layoutView(loop, 'process', registry).symbols.map((s) => s.id)).toEqual(['A', 'B']);
  });

  it('routes pipes from port to port with at most two bends', () => {
    expect(orthogonalRoute([0, 0], [100, 0])).toEqual([[0, 0], [100, 0]]);
    expect(orthogonalRoute([0, 0], [100, 40])).toEqual([[0, 0], [50, 0], [50, 40], [100, 40]]);
    const { symbols, edges } = layoutView(plant, 'process', registry);
    const valve = symbols.find((s) => s.id === 'V')!;
    // The valve symbol names its ports: inlet on its left edge.
    expect(edges[0].points.at(-1)).toEqual([valve.x - 12, valve.y]);
    // Without a named port, the 3D position maps into the box: the tank outlet is on its right side.
    expect(portAnchor({ width: 40, height: 60, shapes: [] }, { id: 'outlet', position: [1.2, -0.9, 0] }, { min: [-1.2, -1.535, -1], max: [1.2, 1.535, 1] })[0]).toBe(40);
  });
});

describe('saved layouts', () => {
  it('uses saved places and routes, hides hidden symbols, and puts the rest below', () => {
    const scene = valid({
      ...plant,
      views: { process: { symbols: { TK: { x: 500, y: 300 }, V: { x: 0, y: 0, hidden: true } }, routes: { a2: { points: [[1, 2], [3, 4]] } } } },
    });
    const drawing = layoutView(scene, 'process', registry);
    const tank = drawing.symbols.find((s) => s.id === 'TK')!;
    expect([tank.x, tank.y, tank.placed]).toEqual([500, 300, true]);
    expect(drawing.symbols.some((s) => s.id === 'V')).toBe(false);
    expect(drawing.edges.find((e) => e.id === 'a2')).toMatchObject({ points: [[1, 2], [3, 4]], routed: true });
    for (const s of drawing.symbols.filter((s) => !s.placed)) expect(s.y).toBeGreaterThan(300);
  });

  it('placeSymbol saves a snapped place, keeps rotation, and validates', () => {
    const turned = valid({ ...plant, views: { process: { symbols: { P: { x: 0, y: 0, rotation: 90 } } } } });
    const moved = placeSymbol(turned, 'process', 'P', 123.4, 57);
    expect(moved.views?.process?.symbols?.P).toEqual({ x: 120, y: 60, rotation: 90 });
    expect(validateScene(moved, registry.resolvers).ok).toBe(true);
    expect(placeSymbol(plant, 'process', 'nope', 1, 1)).toBe(plant);
    expect(plant.views).toBeUndefined();
  });
});

describe('<ProcessView>', () => {
  const render = (scene: ScadaScene, props: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(ProcessView, { scene, registry, ...props }));

  it('renders accessible symbols and lines for the members only', () => {
    const html = render(plant, { selectedIds: ['P'] });
    expect(html).toContain('aria-label="Process view"');
    expect(html.match(/role="button"/g)).toHaveLength(5);
    expect(html).toContain('aria-label="P (unplaced)" aria-pressed="true"');
    expect(html).not.toContain('data-component-id="PLC"');
    expect(html.match(/data-edge-kind="association"/g)).toHaveLength(2);
  });

  it('writes untrusted names as text, never markup', () => {
    const html = render(valid({ components: [at('TK', 'tank', {}, { name: '<img src=x onerror=alert(1)>' })] }));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('shows bound live values, and untrusted ones as unknown', () => {
    const scene = valid({
      components: [at('TK', 'tank')],
      tagBindings: [{ id: 'b1', tagId: 'LT', kind: 'property', instanceId: 'TK', property: 'level' }, { id: 'b2', tagId: 'TT', kind: 'property', instanceId: 'TK', property: 'temperature' }],
    });
    const now = new Date().toISOString();
    const html = render(scene, { telemetry: { observations: [{ tagId: 'LT', value: 55, quality: 'GOOD', sourceTimestamp: now }, { tagId: 'TT', value: 20, quality: 'DISCONNECTED', sourceTimestamp: now }] } });
    expect(html).toContain('level: 55 % · GOOD');
    expect(html).toContain('temperature: unknown (disconnected)');
  });
});
