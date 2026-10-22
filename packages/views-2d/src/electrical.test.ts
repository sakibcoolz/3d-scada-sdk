import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { controlLibrary, createComponentRegistry, type ComponentTypeDefinition } from '@sakibcoolz/components';
import { ElectricalView, electricalTier, layoutView, terminalBlock } from './index.js';

// The electrical view (ADR-0026, T-085): wired equipment by tier, terminal blocks generated from
// ports, wires by domain, and host SVG symbols sanitized at registration.

const registry = createComponentRegistry(...controlLibrary);
const at = (id: string, type: string, properties: ComponentInstance['properties'] = {}): ComponentInstance =>
  ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });
const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const valid = (doc: object, resolvers = registry.resolvers): ScadaScene => {
  const r = validateScene({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', connections: [], ...doc }, resolvers);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const line = valid({
  components: [
    at('TK', 'tank'), at('P', 'pump'), at('M', 'sdk.motor'), at('VFD', 'sdk.vfd'), at('LT', 'sdk.transmitter', { measures: 'level' }),
    at('PSU', 'sdk.psu'), at('PLC', 'sdk.plc.cpu'), at('AI', 'sdk.plc.ai', { channels: '4' }), at('DO', 'sdk.plc.do', { channels: '8' }), at('SW', 'sdk.network.switch'),
  ],
  connections: [
    edge('tp', 'TK', 'outlet', 'P', 'suction'),
    edge('pwr', 'VFD', 'U-V-W', 'M', 'terminals'),
    edge('run', 'DO', 'DO0', 'VFD', 'run'),
    edge('lvl', 'LT', 'out', 'AI', 'AI0'),
    edge('24v', 'PSU', '24V', 'PLC', '24V'),
    edge('net', 'PLC', 'eth1', 'SW', 'P1'),
  ],
  associations: [{ id: 'ctl', relationship: 'controls', from: 'PLC', to: 'VFD' }, { id: 'drv', relationship: 'drives', from: 'M', to: 'P' }],
});

describe('what the electrical view shows', () => {
  it('takes wired equipment and instruments, not vessels and pumps, and draws wires but no pipes', () => {
    const drawing = layoutView(line, 'electrical', registry);
    expect(drawing.symbols.map((s) => s.id)).toEqual(['M', 'VFD', 'LT', 'PSU', 'PLC', 'AI', 'DO', 'SW']);
    expect(drawing.edges.map((e) => [e.id, e.domain ?? e.relationship])).toEqual([
      ['pwr', 'power'], ['run', 'signal'], ['lvl', 'signal'], ['24v', 'power'], ['net', 'network'], ['ctl', 'controls'],
    ]);
  });

  it('places supplies, controllers, I/O cards, field devices and loads left to right', () => {
    const x = Object.fromEntries(layoutView(line, 'electrical', registry).symbols.map((s) => [s.id, s.x]));
    expect(x.PSU).toBeLessThan(x.PLC);
    expect(x.PLC).toBe(x.SW);
    expect(x.SW).toBeLessThan(x.AI);
    expect(x.AI).toBe(x.DO);
    expect(x.DO).toBeLessThan(x.VFD);
    expect(x.VFD).toBe(x.LT);
    expect(x.LT).toBeLessThan(x.M);
    const tier = (type: string) => electricalTier(registry.definitionFor(type).ports);
    expect(['sdk.psu', 'sdk.plc.cpu', 'sdk.plc.di', 'sdk.vfd', 'sdk.motor'].map(tier)).toEqual([0, 1, 2, 3, 4]);
  });

  it('stacks tall I/O cards without overlap', () => {
    const cards = layoutView(line, 'electrical', registry).symbols.filter((s) => s.id === 'AI' || s.id === 'DO');
    const [a, b] = cards;
    expect(b.y - b.symbol.height / 2).toBeGreaterThan(a.y + a.symbol.height / 2);
  });
});

describe('terminal blocks', () => {
  it('puts inputs left, outputs right, network on top and earth below, labelled by terminal', () => {
    const block = terminalBlock('Variable-Frequency Drive', registry.definitionFor('sdk.vfd').ports);
    const side = (id: string) => {
      const [x, y] = block.ports![id];
      return x === 0 ? 'left' : x === block.width ? 'right' : y === 0 ? 'top' : y === block.height ? 'bottom' : 'inside';
    };
    expect(['L1-L3', 'run', 'speedRef', 'U-V-W', 'speed', 'fault', 'eth', 'PE'].map(side)).toEqual(['left', 'left', 'left', 'right', 'right', 'right', 'top', 'bottom']);
    const texts = block.shapes.filter((s) => s.kind === 'text').map((s) => (s.kind === 'text' ? s.text : ''));
    expect(texts).toEqual(expect.arrayContaining(['Variable-Frequenc…', 'DI1', 'AI1', 'U V W', 'X1', 'PE']));
  });

  it('runs a wire from the exact terminals it joins', () => {
    const drawing = layoutView(line, 'electrical', registry);
    const run = drawing.edges.find((e) => e.id === 'run')!;
    const DO = drawing.symbols.find((s) => s.id === 'DO')!, VFD = drawing.symbols.find((s) => s.id === 'VFD')!;
    expect(run.points[0]).toEqual(DO.anchors.DO0);
    expect(run.points.at(-1)).toEqual(VFD.anchors.run);
    expect(DO.anchors.DO0[0]).toBe(DO.x + DO.symbol.width / 2); // an output, on the card's right edge
  });
});

describe('host symbols (sanitized at registration)', () => {
  const box: ComponentTypeDefinition = {
    type: 'com.acme.relay',
    label: 'Relay',
    ports: [{ id: 'A1', kind: 'power', position: [0, 0.5, 0], direction: [0, 0, 1], power: { kind: 'DC', voltage: 24 } }],
    bounds: { min: [-0.1, 0, -0.1], max: [0.1, 1, 0.1] },
    parts: [{ shape: 'box', role: 'shell', center: [0, 0.5, 0], size: [0.2, 1, 0.2] }],
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><rect x="0" y="0" width="10" height="20" fill="#223344" stroke="#ffffff"/></svg>';

  it('draws a registered symbol as clean paths at its size, with its port points', () => {
    const host = createComponentRegistry({ ...box, electricalSymbol: { svg, width: 20, height: 40, ports: { A1: [0, 20] } } });
    const scene = valid({ components: [at('K1', 'com.acme.relay')] }, host.resolvers);
    const [k1] = layoutView(scene, 'electrical', host).symbols;
    expect(k1.symbol.width).toBe(20);
    expect(k1.symbol.shapes[0]).toMatchObject({ kind: 'path', fill: '#223344', stroke: '#ffffff', transform: [2, 0, 0, 2, 0, 0] });
    expect(k1.anchors.A1).toEqual([k1.x - 10, k1.y]);
    const html = renderToStaticMarkup(React.createElement(ElectricalView, { scene, registry: host }));
    expect(html).toContain('<path d="M');
    expect(html).toContain('transform="matrix(2 0 0 2 0 0)"');
  });

  it('refuses unsafe or ill-fitting symbols when registering', () => {
    const refused = (symbol: object) => () => createComponentRegistry({ ...box, symbol2D: symbol as never });
    expect(refused({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>', width: 10, height: 10 })).toThrow('"com.acme.relay" symbol2D SVG is refused');
    expect(refused({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="x()"/>', width: 10, height: 10 })).toThrow('symbol2D SVG is refused');
    expect(refused({ svg, width: 0, height: 10 })).toThrow('symbol2D needs a width and height of 1 to 1000');
    expect(refused({ svg, width: 10, height: 10, ports: { B2: [0, 0] } })).toThrow('places "B2", which is not one of its ports');
    expect(refused({ svg, width: 10, height: 10, ports: { A1: [11, 0] } })).toThrow('port "A1" needs an [x, y] point inside the symbol');
    expect(refused({ width: 10, height: 10 })).toThrow('symbol2D needs svg text');
  });
});
