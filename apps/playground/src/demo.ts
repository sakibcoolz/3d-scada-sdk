import type { ComponentInstance, ScadaScene, Vector3Tuple } from '@sakibcoolz/core';
import type { TagRow } from './DemoFeed';

// MVP demo network: tank -> valve -> pipe -> tee, tee run to valve A, tee branch up to valve B.
// Gaps between ports are filled by routed pipes; the tank stands on the grid (y = 1.535).
const base = 1.535;
const line = base - 0.9; // tank outlet height

const at = (id: string, type: ComponentInstance['type'], position: Vector3Tuple): ComponentInstance => ({
  id,
  type,
  position: { x: position[0], y: position[1], z: position[2] },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: type === 'tank' ? { level: 60 } : type === 'valve' ? { open: true } : {},
});

export const demoScene: ScadaScene = {
  schemaVersion: 3,
  units: 'm',
  components: [
    at('tank', 'tank', [0, base, 0]),
    at('valve', 'valve', [3, line, 0]),
    at('pipe', 'pipe', [5.6, line, 0]),
    at('tee', 'tee', [8.6, line, 0]),
    at('valve-a', 'valve', [11, line, 0]),
    at('valve-b', 'valve', [11, line + 1.4, 0]),
  ],
  connections: [
    { id: 'tank-valve', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } },
    { id: 'valve-pipe', from: { instanceId: 'valve', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } },
    { id: 'pipe-tee', from: { instanceId: 'pipe', portId: 'out' }, to: { instanceId: 'tee', portId: 'left' } },
    { id: 'tee-a', from: { instanceId: 'tee', portId: 'right' }, to: { instanceId: 'valve-a', portId: 'in' } },
    { id: 'tee-b', from: { instanceId: 'tee', portId: 'branch' }, to: { instanceId: 'valve-b', portId: 'in' } },
  ],
  tagBindings: [
    { id: 'b-level', tagId: 'LT-101', kind: 'property', instanceId: 'tank', property: 'level' },
    { id: 'b-temp', tagId: 'TT-101', kind: 'property', instanceId: 'tank', property: 'temperature' },
    { id: 'b-xv', tagId: 'XV-101', kind: 'property', instanceId: 'valve', property: 'open' },
    { id: 'b-ft1', tagId: 'FT-101', kind: 'flow', connectionId: 'tank-valve' },
    { id: 'b-ft2', tagId: 'FT-102', kind: 'flow', connectionId: 'valve-pipe' },
    { id: 'b-ft3', tagId: 'FT-103', kind: 'flow', connectionId: 'pipe-tee' },
    { id: 'b-ft4', tagId: 'FT-104', kind: 'flow', connectionId: 'tee-a' },
  ],
};

/** Demo tag feed: flow tags in m³/s, level in %, temperature in °C, valve open as true/false. FT for the tee branch is not bound, so it stays unknown. */
export const demoTagRows: Record<string, TagRow> = {
  'FT-101': { value: '2', quality: 'GOOD' },
  'FT-102': { value: '2', quality: 'GOOD' },
  'FT-103': { value: '2', quality: 'GOOD' },
  'FT-104': { value: '1.2', quality: 'GOOD' },
  'LT-101': { value: '60', quality: 'GOOD' },
  'TT-101': { value: '25', quality: 'GOOD' },
  'XV-101': { value: 'true', quality: 'GOOD' },
};

/**
 * Benchmark scene "chain-N" for `?generate=N`: N valves in a zig-zag line (two bends per route),
 * every connection bound to a flow tag fed with 1 m³/s so all flow markers animate.
 */
export function generatedScene(n: number): { scene: ScadaScene; rows: Record<string, TagRow> } {
  const components: ComponentInstance[] = Array.from({ length: n }, (_, i) => at(`v${i}`, 'valve', [(i % 20) * 3, 0.2 + (i % 2) * 1.5, Math.floor(i / 20) * 4]));
  const connections = components.slice(1).map((c, i) => ({ id: `e${i + 1}`, from: { instanceId: components[i].id, portId: 'out' }, to: { instanceId: c.id, portId: 'in' } }));
  const tagBindings = connections.map((c) => ({ id: `b-${c.id}`, tagId: `FT-${c.id}`, kind: 'flow' as const, connectionId: c.id }));
  const rows = Object.fromEntries(tagBindings.map((b) => [b.tagId, { value: '1', quality: 'GOOD' as const }]));
  return { scene: { schemaVersion: 3, units: 'm', components, connections, tagBindings }, rows };
}
