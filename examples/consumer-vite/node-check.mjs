// Plain Node, no bundler: the core and catalog must load as ES modules and validate a scene.
import { parseScene, serializeScene, findOpenJoints } from '@sakibcoolz/core';
import { catalogResolvers, pipeSizes } from '@sakibcoolz/components';
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
// The JSON Schema ships with core and resolves through the package exports (T-069).
const schemaFile = fileURLToPath(import.meta.resolve('@sakibcoolz/core/schema/industrial-scene.v4.schema.json'));
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
if (schema.properties?.documentType?.const !== 'industrial.scene') throw new Error('scene JSON Schema missing from the package');
console.log(`node-check ok: SVG sanitizer ok, ${Object.keys(pipeSizes).length} sizes, ${serializeScene(result.scene).length} bytes of canonical JSON, simulated level ${simulated.levels.t.toFixed(1)} % (mass-balance) / ${hydraulic.levels.t.toFixed(1)} % (hydraulic) after 30 s`);
