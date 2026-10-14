import type { ComponentInstance, ScadaScene, Vector3Tuple } from '@scada3d/core';

// MVP demo network: tank -> valve -> pipe -> tee, tee run to valve A, tee branch up to valve B.
// Gaps between ports are filled by routed pipes; the tank stands on the grid (y = 1.535).
const base = 1.535;
const line = base - 0.9; // tank outlet height

const at = (id: string, kind: ComponentInstance['kind'], position: Vector3Tuple): ComponentInstance => ({
  id,
  kind,
  position,
  rotation: [0, 0, 0],
  properties: kind === 'tank' ? { level: 60 } : kind === 'valve' ? { open: true } : {},
});

export const demoScene: ScadaScene = {
  version: 1,
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
};
