import type { ComponentInstance, ScadaScene, Vector3Tuple } from '@sakibcoolz/core';
import type { TagRow } from './DemoFeed';

// `?control` (ADR-0025): a PLC → VFD → Motor → pump line from the opt-in control library. A tank
// feeds a pump; a motor on a plinth drives it (association); a drive powers the motor; a PLC in a
// panel runs the drive and reads a level transmitter and a high-level switch on the tank. Tags come
// from a `host` data source, which the playground's demo feed stands in for.

const yaw180 = { x: 0, y: 1, z: 0, w: 0 };
const at = (id: string, type: string, position: Vector3Tuple, properties: ComponentInstance['properties'] = {}, extra: Partial<ComponentInstance> = {}): ComponentInstance => ({
  id,
  type,
  position: { x: position[0], y: position[1], z: position[2] },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties,
  ...extra,
});
/** Mounted on the panel's front face (z = 0.2), as an assembly child (ADR-0008). */
const mounted = (id: string, type: string, x: number, depth: number, properties: ComponentInstance['properties'] = {}) =>
  at(id, type, [x, 0.7, 0.2 + depth / 2], properties, { parentId: 'PNL-01' });
const wire = (id: string, from: string, fromPort: string, to: string, toPort: string) => ({ id, from: { instanceId: from, portId: fromPort }, to: { instanceId: to, portId: toPort } });

const tankTop = 3.07;
export const controlScene: ScadaScene = {
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [
    at('TK-101', 'tank', [0, 1.535, 0], { level: 55 }),
    // Suction level with the tank outlet (y 0.635), so the pipe between them is straight.
    at('P-101', 'pump', [3, 0.635, 0]),
    // 45 kW frame: shaft centre 0.268 m above its feet, level with the pump's centre.
    at('M-101', 'sdk.motor', [4, 0.367, 0], { ratedPowerKw: 45 }, { rotation: yaw180 }),
    at('VFD-101', 'sdk.vfd', [5, 0, 1.2], { ratedPowerKw: 45 }),
    at('LT-101', 'sdk.transmitter', [0.5, tankTop, 0], { measures: 'level' }),
    at('LSH-101', 'sdk.switch', [-0.5, tankTop, 0]),
    at('PNL-01', 'sdk.panel', [6, 0, 0]),
    mounted('PSU-01', 'sdk.psu', 5.71, 0.11),
    mounted('PLC-01', 'sdk.plc.cpu', 5.81, 0.075),
    mounted('DI-01', 'sdk.plc.di', 5.9025, 0.075, { channels: '8' }),
    mounted('DO-01', 'sdk.plc.do', 5.95, 0.075, { channels: '8' }),
    mounted('AI-01', 'sdk.plc.ai', 5.9975, 0.075, { channels: '4' }),
    mounted('AO-01', 'sdk.plc.ao', 6.045, 0.075, { channels: '2' }),
    mounted('SW-01', 'sdk.network.switch', 6.11, 0.09, { ports: '5' }),
  ],
  connections: [
    wire('tank-pump', 'TK-101', 'outlet', 'P-101', 'suction'),
    wire('motor-power', 'VFD-101', 'U-V-W', 'M-101', 'terminals'),
    wire('run', 'DO-01', 'DO0', 'VFD-101', 'run'),
    wire('reset', 'DO-01', 'DO1', 'VFD-101', 'reset'),
    wire('speed-ref', 'AO-01', 'AO0', 'VFD-101', 'speedRef'),
    wire('speed', 'VFD-101', 'speed', 'AI-01', 'AI0'),
    wire('fault', 'VFD-101', 'fault', 'DI-01', 'DI0'),
    wire('level', 'LT-101', 'out', 'AI-01', 'AI1'),
    wire('high-level', 'LSH-101', 'out', 'DI-01', 'DI1'),
    wire('net-plc', 'PLC-01', 'eth1', 'SW-01', 'P1'),
    wire('net-vfd', 'VFD-101', 'eth', 'SW-01', 'P2'),
    wire('24v-plc', 'PSU-01', '24V', 'PLC-01', '24V'),
    wire('24v-switch', 'PSU-01', '24V', 'SW-01', '24V'),
    wire('24v-lt', 'PSU-01', '24V', 'LT-101', '24V'),
    wire('24v-lsh', 'PSU-01', '24V', 'LSH-101', '24V'),
    wire('pe-vfd', 'VFD-101', 'PE', 'PNL-01', 'PE'),
    wire('pe-motor', 'M-101', 'PE', 'PNL-01', 'PE'),
    wire('pe-psu', 'PSU-01', 'PE', 'PNL-01', 'PE'),
    wire('pe-plc', 'PLC-01', 'PE', 'PNL-01', 'PE'),
  ],
  associations: [
    { id: 'plc-controls-vfd', relationship: 'controls', from: 'PLC-01', to: 'VFD-101' },
    { id: 'motor-drives-pump', relationship: 'drives', from: 'M-101', to: 'P-101' },
    { id: 'lt-measures-tank', relationship: 'measures', from: 'LT-101', to: 'TK-101' },
    { id: 'lsh-measures-tank', relationship: 'measures', from: 'LSH-101', to: 'TK-101' },
  ],
  dataSources: [{ id: 'demo-feed', name: 'Playground demo feed', protocol: 'host' }],
  runtimeVariables: [
    { id: 'LT-101.PV', componentId: 'LT-101', dataType: 'float32', unit: '%', access: 'read', source: { dataSourceId: 'demo-feed' } },
    { id: 'TT-101', componentId: 'TK-101', dataType: 'float32', unit: '°C', access: 'read', source: { dataSourceId: 'demo-feed' } },
    { id: 'FT-101', dataType: 'float32', access: 'read', source: { dataSourceId: 'demo-feed' } },
    { id: 'VFD-101.ACTUAL_SPEED', componentId: 'VFD-101', dataType: 'float32', unit: 'rpm', access: 'read', source: { dataSourceId: 'demo-feed' } },
    { id: 'VFD-101.RUNNING', componentId: 'VFD-101', dataType: 'bool', access: 'read', source: { dataSourceId: 'demo-feed' } },
  ],
  tagBindings: [
    { id: 'b-level', tagId: 'LT-101.PV', kind: 'property', instanceId: 'TK-101', property: 'level' },
    { id: 'b-temp', tagId: 'TT-101', kind: 'property', instanceId: 'TK-101', property: 'temperature' },
    { id: 'b-flow', tagId: 'FT-101', kind: 'flow', connectionId: 'tank-pump' },
  ],
};

/** The temperature transmitter's link is down, so its tag arrives DISCONNECTED and shows as unknown. */
export const controlTagRows: Record<string, TagRow> = {
  'LT-101.PV': { value: '55', quality: 'GOOD' },
  'TT-101': { value: '24', quality: 'DISCONNECTED' },
  'FT-101': { value: '1.5', quality: 'GOOD' },
};
