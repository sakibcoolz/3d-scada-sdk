// The "limits" scene (T-095): a document at the default validator limits that matter for scale.
// Shared by scale.bench.ts and scale.test.ts. Test-only: excluded from the build.
import type { AlarmState } from '../status.js';
import type { Observation } from '../telemetry.js';
import type { ComponentType, ConnectionPort, Quantity, ScadaScene } from '../scene.js';
import type { SceneValidationOptions } from '../validation.js';

const fluid = (id: string, x: number, dir: 1 | -1): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dir, 0, 0], nominalSize: 0.15 });
const signal = (id: string, flow: 'in' | 'out'): ConnectionPort => ({ id, kind: 'signal', position: [0, 0.3, flow === 'in' ? -0.1 : 0.1], direction: [0, 0, flow === 'in' ? -1 : 1], flow, signal: { type: 'AI' } });
const ports: Partial<Record<ComponentType, ConnectionPort[]>> = { valve: [fluid('in', -0.6, -1), fluid('out', 0.6, 1), signal('s-in', 'in'), signal('s-out', 'out')] };
const bindable: Partial<Record<ComponentType, Record<string, Quantity>>> = { valve: { open: 'boolean' } };
export const scaleOptions: SceneValidationOptions = { resolvePorts: (t) => ports[t], resolveBindable: (t) => bindable[t] };

export const SCALE_NOW = Date.parse('2026-10-23T12:00:00Z');
const at = new Date(SCALE_NOW - 500).toISOString();

/**
 * "limits-N": N valves in a line, each joined to the next by a pipe run and by a signal wire; per
 * valve a flow variable (Modbus holding register, bound to the outgoing run) and an open/closed
 * variable (coil, bound to the valve). At N = 10,000: 19,998 connections, 20,000 variables and
 * 19,999 bindings, against limits of 10,000 / 20,000 / 20,000 / 20,000.
 */
export function limitsScene(n = 10_000): ScadaScene {
  const sources = 10;
  const scene: ScadaScene = {
    schemaVersion: 4,
    documentType: 'industrial.scene',
    units: 'm',
    project: { id: `limits-${n}`, name: `Limits ${n}`, revision: '1' },
    components: [],
    connections: [],
    dataSources: Array.from({ length: sources }, (_, k) => ({ id: `plc-${k}`, protocol: 'modbus-tcp', endpointRef: `host:plc-${k}` })),
    runtimeVariables: [],
    tagBindings: [],
  };
  for (let i = 0; i < n; i++) {
    const id = `v${i}`;
    const dataSourceId = `plc-${i % sources}`;
    scene.components.push({ id, type: 'valve', position: { x: i * 3, y: 0.2 + (i % 2) * 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } });
    scene.runtimeVariables!.push(
      { id: `${id}.FLOW`, componentId: id, dataType: 'float32', unit: 'm3/h', access: 'read', source: { dataSourceId, address: { area: 'holding', address: (2 * i) % 65_534, unitId: 1 } } },
      { id: `${id}.OPEN`, componentId: id, dataType: 'bool', access: 'read', source: { dataSourceId, address: { area: 'coil', address: i % 65_535, unitId: 1 } } },
    );
    scene.tagBindings!.push({ id: `b-open-${i}`, tagId: `${id}.OPEN`, kind: 'property', instanceId: id, property: 'open' });
    if (i === 0) continue;
    const prev = `v${i - 1}`;
    scene.connections.push(
      { id: `e${i}`, from: { instanceId: prev, portId: 'out' }, to: { instanceId: id, portId: 'in' } },
      { id: `w${i}`, from: { instanceId: prev, portId: 's-out' }, to: { instanceId: id, portId: 's-in' } },
    );
    scene.tagBindings!.push({ id: `b-flow-${i}`, tagId: `${prev}.FLOW`, kind: 'flow', connectionId: `e${i}` });
  }
  return scene;
}

/** One GOOD observation per variable. */
export function limitsObservations(scene: ScadaScene): Observation[] {
  return (scene.runtimeVariables ?? []).map((v) => ({ tagId: v.id, value: v.dataType === 'bool' ? true : 12.5, quality: 'GOOD', sourceTimestamp: at, dataType: v.dataType }));
}

/** An active alarm on every tenth valve, half by component and half by tag. */
export function limitsAlarms(scene: ScadaScene): AlarmState[] {
  return scene.components.filter((_, i) => i % 10 === 0).map((c, k) => ({ id: `a${k}`, severity: 'high', message: 'High flow', active: true, ...(k % 2 ? { componentId: c.id } : { tagId: `${c.id}.FLOW` }) }));
}
