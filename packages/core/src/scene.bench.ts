import { bench, describe } from 'vitest';
import {
  connect,
  createEmptyScene,
  parseScene,
  resolveFlow,
  resolveTelemetry,
  routeScene,
  serializeScene,
  snapComponent,
  validateScene,
  type ComponentKind,
  type ConnectionPort,
  type FlowReading,
  type Observation,
  type ScadaScene,
} from './index';

// Named benchmark scenes. "chain-N": N valves in a zig-zag line, each connected to the next, so
// every route has two bends; every connection has a flow tag and every valve an open tag.
const fluid = (id: string, x: number, dir: 1 | -1): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize: 0.15 });
const ports: Partial<Record<ComponentKind, ConnectionPort[]>> = { valve: [fluid('in', -0.6, -1), fluid('out', 0.6, 1)] };
const options = { resolvePorts: (t: ComponentKind) => ports[t], resolveBindable: () => ({ open: 'boolean' as const }) };
const NOW = Date.parse('2026-10-15T12:00:00Z');

function chain(n: number): ScadaScene {
  const scene = createEmptyScene();
  for (let i = 0; i < n; i++) {
    scene.components.push({ id: `v${i}`, type: 'valve', position: { x: i * 3, y: 0.2 + (i % 2) * 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } });
    if (i > 0) scene.connections.push({ id: `e${i}`, from: { instanceId: `v${i - 1}`, portId: 'out' }, to: { instanceId: `v${i}`, portId: 'in' } });
  }
  scene.tagBindings = [
    ...scene.connections.map((c) => ({ id: `f${c.id}`, tagId: `FT-${c.id}`, kind: 'flow' as const, connectionId: c.id })),
    ...scene.components.map((c) => ({ id: `o${c.id}`, tagId: `XV-${c.id}`, kind: 'property' as const, instanceId: c.id, property: 'open' })),
  ];
  return scene;
}

for (const n of [100, 1000]) {
  const scene = chain(n);
  const text = serializeScene(scene);
  const readings: FlowReading[] = scene.connections.map((c) => ({ connectionId: c.id, rate: 1, quality: 'GOOD', source: 'MEASURED', sourceTimestamp: new Date(NOW - 500).toISOString() }));
  const observations: Observation[] = (scene.tagBindings ?? []).map((b) => ({ tagId: b.tagId, value: b.kind === 'flow' ? 1 : true, quality: 'GOOD', sourceTimestamp: new Date(NOW - 500).toISOString() }));
  // A valve dropped next to the last outlet, as the editor does on every dragover.
  const last = scene.components[n - 1].position;
  const dragged = { id: 'new', type: 'valve' as const, position: { x: last.x + 1.3, y: last.y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} };

  describe(`chain-${n} (${n} components, ${n - 1} connections, ${scene.tagBindings!.length} bindings)`, () => {
    bench('validateScene', () => void validateScene(scene, options));
    bench('serializeScene', () => void serializeScene(scene));
    bench('parseScene', () => void parseScene(text, options));
    bench('routeScene', () => void routeScene(scene, options));
    bench('resolveFlow', () => void resolveFlow(scene, readings, { now: NOW }));
    bench('resolveTelemetry', () => void resolveTelemetry(scene, observations, { now: NOW, resolveBindable: options.resolveBindable }));
    bench('snapComponent (one dragover)', () => void snapComponent(scene, dragged, options));
    bench('connect (one new edge, revalidates)', () => {
      const added = { ...scene, components: [...scene.components, { ...dragged, position: { x: last.x + 1.2, y: last.y, z: 0 } }] };
      void connect(added, { id: 'enew', from: { instanceId: `v${n - 1}`, portId: 'out' }, to: { instanceId: 'new', portId: 'in' } }, options);
    });
  });
}
