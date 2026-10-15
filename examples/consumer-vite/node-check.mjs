// Plain Node, no bundler: the core and catalog must load as ES modules and validate a scene.
import { parseScene, serializeScene, findOpenJoints } from '@scada3d/core';
import { catalogResolvers, pipeSizes } from '@scada3d/components';

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
console.log(`node-check ok: ${Object.keys(pipeSizes).length} sizes, ${serializeScene(result.scene).length} bytes of canonical JSON`);
