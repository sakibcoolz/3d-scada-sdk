// Plain Node, no bundler: the core and catalog must load as ES modules and validate a scene.
import { applyTagSuggestions, parseScene, serializeScene, findOpenJoints, pathBetween, projectAcquisition, relatedComponents, reviewTags, suggestVariables } from '@sakibcoolz/core';
import { catalogResolvers, controlLibrary, createComponentRegistry, pipeSizes } from '@sakibcoolz/components';
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
  { type: 'com.example.vfd', label: 'VFD', ...box, variables: [{ name: 'ACTUAL_SPEED', dataType: 'float32', unit: 'rpm' }], ports: [terminal('run', 'signal', { signal: { type: 'DI' } }), terminal('uvw', 'power', { flow: 'out', power: { kind: 'AC', voltage: 400, phases: 3 } })] },
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
// Typed, read-only tags and the gateway projection (ADR-0024): what to acquire, never how to connect.
const acquired = parseScene(JSON.stringify({
  ...line,
  project: { revision: '3' },
  dataSources: [{ id: 'ds-plc', protocol: 'modbus-tcp', deviceId: 'PLC-01', endpointRef: 'host:gateway-1/plc-01' }],
  runtimeVariables: [{ id: 'M-101.SPEED', componentId: 'M-101', dataType: 'float32', unit: 'rpm', access: 'read', source: { dataSourceId: 'ds-plc', address: { area: 'holding', address: 100, unitId: 1 } } }],
}), control.resolvers);
if (!acquired.ok) throw new Error(`acquisition scene rejected: ${acquired.errors[0].message}`);
const plan = projectAcquisition(acquired.scene);
if (plan.sourceRevision !== '3' || plan.variables.length !== 1 || plan.variables[0].address.address !== 100) throw new Error('unexpected acquisition plan');
const withPassword = { ...JSON.parse(serializeScene(acquired.scene)), dataSources: [{ id: 'ds-plc', protocol: 'modbus-tcp', endpointRef: 'modbus://admin:secret@10.0.0.5' }] };
if (parseScene(JSON.stringify(withPassword), control.resolvers).ok) throw new Error('an endpoint with credentials must be refused');
// Suggested tags come from the definitions and are applied only on request (ADR-0024).
const proposals = suggestVariables(controlled.scene, control.resolvers);
if (proposals.variables.map((v) => v.id).join() !== 'VFD-101.ACTUAL_SPEED') throw new Error('unexpected tag suggestions');
if (controlled.scene.runtimeVariables) throw new Error('suggesting must not change the scene');
const tagged = applyTagSuggestions(controlled.scene, proposals, control.resolvers);
if (!tagged.ok || reviewTags(tagged.scene, control.resolvers).map((f) => f.code).join() !== 'UNUSED_VARIABLE') throw new Error('unexpected tag review');
// The opt-in control library (ADR-0025): generic sdk.* equipment, wired and checked like host types.
const library = createComponentRegistry(...controlLibrary);
const wire = (id, a, ap, b, bp) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const pumpLine = {
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [at('PLC-01', 'sdk.plc.cpu', {}), at('DO-01', 'sdk.plc.do', { channels: '8' }), at('SW-01', 'sdk.network.switch', {}), at('VFD-101', 'sdk.vfd', { supply: '400' }), at('M-101', 'sdk.motor', { voltage: '400' }), at('P-101', 'pump', {})],
  connections: [wire('run', 'DO-01', 'DO0', 'VFD-101', 'run'), wire('n1', 'PLC-01', 'eth1', 'SW-01', 'P1'), wire('n2', 'VFD-101', 'eth', 'SW-01', 'P2'), wire('power', 'VFD-101', 'U-V-W', 'M-101', 'terminals')],
  associations: [{ id: 'a1', relationship: 'drives', from: 'M-101', to: 'P-101' }],
};
const libraryLine = parseScene(JSON.stringify(pumpLine), library.resolvers);
if (!libraryLine.ok) throw new Error(`control library scene rejected: ${libraryLine.errors[0].message}`);
const chain = ['PLC-01', ...pathBetween(libraryLine.scene, 'PLC-01', 'P-101', { resolvePorts: library.resolvers.resolvePorts }).map((s) => s.to)];
if (chain.join() !== 'PLC-01,SW-01,VFD-101,M-101,P-101') throw new Error(`unexpected control chain ${chain.join()}`);
const wrongMotor = { ...pumpLine, components: pumpLine.components.map((c) => (c.id === 'M-101' ? { ...c, properties: { voltage: '230' } } : c)) };
if (parseScene(JSON.stringify(wrongMotor), library.resolvers).ok) throw new Error('a 230 V motor on a 400 V drive must be refused');
if (catalogResolvers.resolveType('sdk.vfd')) throw new Error('the control library must be opt-in');
// The JSON Schema ships with core and resolves through the package exports (T-069).
const schemaFile = fileURLToPath(import.meta.resolve('@sakibcoolz/core/schema/industrial-scene.v4.schema.json'));
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
if (schema.properties?.documentType?.const !== 'industrial.scene') throw new Error('scene JSON Schema missing from the package');
console.log(`node-check ok: control chain ${chain.join(' → ')}, SVG sanitizer ok, ${Object.keys(pipeSizes).length} sizes, ${serializeScene(result.scene).length} bytes of canonical JSON, simulated level ${simulated.levels.t.toFixed(1)} % (mass-balance) / ${hydraulic.levels.t.toFixed(1)} % (hydraulic) after 30 s`);
