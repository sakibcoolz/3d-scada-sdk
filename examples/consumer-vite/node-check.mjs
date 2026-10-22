// Plain Node, no bundler: the core and catalog must load as ES modules and validate a scene.
import { parseScene, serializeScene, findOpenJoints, pathBetween, relatedComponents } from '@sakibcoolz/core';
import { catalogResolvers, createComponentRegistry, pipeSizes } from '@sakibcoolz/components';
import { createSimulation } from '@sakibcoolz/simulation';
import { sanitizeSvg } from '@sakibcoolz/asset-import';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scene = {
  schemaVersion: 3,
  units: 'm',
  components: [
    { id: 'a', type: 'pipe', position: { x: 0, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { length: 2 } },
    { id: 'b', type: 'pipe', position: { x: 2, y: 0.084, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { length: 2 } },
  ],
  connections: [{ id: 'j', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' } }],
};
const result = parseScene(JSON.stringify(scene), catalogResolvers);
if (!result.ok) throw new Error(`scene rejected: ${result.errors[0].message}`);
if (findOpenJoints(result.scene, catalogResolvers).length !== 0) throw new Error('unexpected open joint');
const mismatch = parseScene(JSON.stringify({ ...scene, components: [scene.components[0], { ...scene.components[1], properties: { length: 2, size: 'DN100' } }] }), catalogResolvers);
if (mismatch.ok) throw new Error('a DN150 to DN100 joint must be refused');
// The optional simulator also runs in plain Node: a tank drains through a valve into a free pipe.
const at = (id, type, properties) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties });
const plant = { schemaVersion: 3, units: 'm', components: [at('t', 'tank', { level: 80 }), at('v', 'valve', { open: true }), at('p', 'pipe', { length: 2 })], connections: [{ id: 'c1', from: { instanceId: 't', portId: 'outlet' }, to: { instanceId: 'v', portId: 'in' } }, { id: 'c2', from: { instanceId: 'v', portId: 'out' }, to: { instanceId: 'p', portId: 'in' } }] };
const simulated = createSimulation(plant).step(30);
const hydraulic = createSimulation(plant, { model: 'hydraulic' }).step(30);
if (!(hydraulic.levels.t < 80 && hydraulic.levels.t > simulated.levels.t)) throw new Error('hydraulic model should drain more slowly than the frictionless one');
if (!(simulated.levels.t < 80) || simulated.flows.some((f) => f.source !== 'SIMULATED')) throw new Error('simulation did not drain the tank');
// The SVG sanitizer needs no DOM: it runs in plain Node and refuses scripts.
if (!sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>').ok) throw new Error('sanitizer refused a clean SVG');
if (sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>x</script></svg>').ok) throw new Error('sanitizer accepted a script');
// A host registers its own component type without changing the SDK (ADR-0022).
const registry = createComponentRegistry({
  type: 'com.example.skid',
  label: 'Example skid',
  ports: [{ id: 'in', kind: 'fluid', position: [-0.5, 0, 0], direction: [-1, 0, 0], nominalSize: pipeSizes.DN150.bore }],
  bounds: { min: [-0.5, -0.3, -0.3], max: [0.5, 0.3, 0.3] },
  parts: [{ shape: 'box', role: 'shell', center: [0, 0, 0], size: [1, 0.6, 0.6] }],
});
const skid = { ...scene, components: [{ ...scene.components[0], id: 'skid', type: 'com.example.skid', position: { x: -0.5, y: 0.084, z: 0 }, properties: {} }, scene.components[1]], connections: [] };
if (!parseScene(JSON.stringify(skid), registry.resolvers).ok) throw new Error('a registered host type must validate');
if (parseScene(JSON.stringify(skid), catalogResolvers).ok) throw new Error('an unregistered host type must be refused');
// Typed ports, wired connections and associations between host control types (ADR-0023).
const terminal = (id, kind, extra) => ({ id, kind, position: [0, 0.5, 0.3], direction: [0, 0, 1], ...extra });
const box = { bounds: { min: [-0.3, 0, -0.3], max: [0.3, 1, 0.3] }, parts: [{ shape: 'box', role: 'shell', center: [0, 0.5, 0], size: [0.6, 1, 0.6] }] };
const control = createComponentRegistry(
  { type: 'com.example.plc', label: 'PLC', ...box, ports: [terminal('do0', 'signal', { signal: { type: 'DO' } })] },
  { type: 'com.example.vfd', label: 'VFD', ...box, ports: [terminal('run', 'signal', { signal: { type: 'DI' } }), terminal('uvw', 'power', { flow: 'out', power: { kind: 'AC', voltage: 400, phases: 3 } })] },
  { type: 'com.example.motor', label: 'Motor', ...box, ports: [terminal('terminals', 'power', { flow: 'in', power: { kind: 'AC', voltage: 400, phases: 3 } })] },
);
const line = {
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [at('PLC-01', 'com.example.plc', {}), at('VFD-101', 'com.example.vfd', {}), at('M-101', 'com.example.motor', {})],
  connections: [
    { id: 'run', domain: 'signal', relationship: 'controls', from: { instanceId: 'PLC-01', portId: 'do0' }, to: { instanceId: 'VFD-101', portId: 'run' } },
    { id: 'power', relationship: 'drives', from: { instanceId: 'VFD-101', portId: 'uvw' }, to: { instanceId: 'M-101', portId: 'terminals' } },
  ],
  associations: [{ id: 'a1', relationship: 'controls', from: 'PLC-01', to: 'VFD-101' }],
};
const controlled = parseScene(JSON.stringify(line), control.resolvers);
if (!controlled.ok) throw new Error(`control scene rejected: ${controlled.errors[0].message}`);
if (relatedComponents(controlled.scene, 'PLC-01', { relationships: ['controls', 'drives'], direction: 'out' }).join() !== 'VFD-101,M-101') throw new Error('PLC → VFD → Motor chain not found');
if (pathBetween(controlled.scene, 'M-101', 'PLC-01', { domains: ['power', 'signal'], resolvePorts: control.resolvers.resolvePorts })?.length !== 2) throw new Error('motor to PLC path not found');
const twoOutputs = { ...line, connections: [{ ...line.connections[0], to: { instanceId: 'PLC-01', portId: 'do0' }, from: { instanceId: 'VFD-101', portId: 'uvw' } }] };
if (parseScene(JSON.stringify(twoOutputs), control.resolvers).ok) throw new Error('a power output wired to a signal output must be refused');
// The JSON Schema ships with core and resolves through the package exports (T-069).
const schemaFile = fileURLToPath(import.meta.resolve('@sakibcoolz/core/schema/industrial-scene.v4.schema.json'));
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
if (schema.properties?.documentType?.const !== 'industrial.scene') throw new Error('scene JSON Schema missing from the package');
console.log(`node-check ok: SVG sanitizer ok, ${Object.keys(pipeSizes).length} sizes, ${serializeScene(result.scene).length} bytes of canonical JSON, simulated level ${simulated.levels.t.toFixed(1)} % (mass-balance) / ${hydraulic.levels.t.toFixed(1)} % (hydraulic) after 30 s`);
