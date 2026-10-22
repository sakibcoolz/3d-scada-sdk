import type { ConnectionPort, Vector3Tuple, VariableTemplate } from '@sakibcoolz/core';
import type { GeometryPart } from '../geometry.js';
import type { ComponentTypeDefinition } from '../registry.js';

// Generic control equipment (ADR-0025): vendor-neutral `sdk.*` types built only from public
// mechanisms: primitive parts, typed ports (ADR-0023) and variable templates (ADR-0024).
// Ratings exist to drive compatibility checks; they are not equipment data and certify nothing.

type Values = Record<string, string | number>;
type Size = { width: number; height: number; depth: number };

const FRONT: Vector3Tuple = [0, 0, 1];
const ETHERNET = { medium: 'ethernet', protocols: ['modbus-tcp', 'opcua'] };

/** Box standing on the floor, centred on x and z. */
const bounds = ({ width, height, depth }: Size) => ({ min: [-width / 2, 0, -depth / 2] as Vector3Tuple, max: [width / 2, height, depth / 2] as Vector3Tuple });

/** Housing plus a front label plate. */
function housing(size: Size, label: string): GeometryPart[] {
  const { width, height, depth } = size;
  return [
    { shape: 'box', role: 'shell', center: [0, height / 2, 0], size: [width, height, depth] },
    { shape: 'box', role: 'plate', center: [0, height * 0.92, depth / 2 + 0.002], size: [width * 0.8, height * 0.1, 0.004], text: label },
  ];
}

/**
 * Terminals on the front face in two columns, top to bottom below the label: the first half on the
 * left, the second half on the right, so channel n sits in a predictable place.
 */
function frontTerminals(size: Size, ports: Omit<ConnectionPort, 'position' | 'direction'>[]): ConnectionPort[] {
  const { width, height, depth } = size;
  const rows = Math.ceil(ports.length / 2);
  const top = height * 0.8, bottom = height * 0.1;
  return ports.map((p, i) => {
    const column = i < rows ? -1 : 1;
    const row = i < rows ? i : i - rows;
    const y = rows === 1 ? (top + bottom) / 2 : top - (row * (top - bottom)) / (rows - 1);
    return { ...p, position: [(column * width) / 4, y, depth / 2], direction: FRONT };
  });
}

const supply24 = (): Omit<ConnectionPort, 'position' | 'direction'> => ({ id: '24V', kind: 'power', name: '24 V DC supply', flow: 'in', power: { kind: 'DC', voltage: 24 } });
const earth = (maxConnections?: number): Omit<ConnectionPort, 'position' | 'direction'> => ({ id: 'PE', kind: 'power', name: 'Protective earth', power: { kind: 'PE' }, ...(maxConnections ? { maxConnections } : {}) });

/**
 * A definition whose ports, tags and parts follow its parameters: the base shape is `shape` of the
 * defaults, and `build` gives every other combination (the registry calls it only with valid values).
 */
function parametric(
  head: Omit<ComponentTypeDefinition, 'ports' | 'parts' | 'bounds' | 'variables' | 'build'>,
  shape: (values: Values) => { size: Size; label: string; ports: Omit<ConnectionPort, 'position' | 'direction'>[]; variables?: VariableTemplate[] },
): ComponentTypeDefinition {
  const make = (values: Values) => {
    const s = shape(values);
    return { ports: frontTerminals(s.size, s.ports), parts: housing(s.size, s.label), bounds: bounds(s.size), ...(s.variables ? { variables: s.variables } : {}) };
  };
  const defaults = Object.fromEntries(Object.entries(head.parameters ?? {}).map(([name, spec]) => [name, spec.default]));
  return { ...head, ...make(defaults), ...(head.parameters ? { build: make } : {}) };
}

const channels = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const ANALOG = { '4-20 mA': { range: [4, 20] as [number, number], unit: 'mA' }, '0-10 V': { range: [0, 10] as [number, number], unit: 'V' } } as const;
type Analog = keyof typeof ANALOG;
const MODULE = (count: number): Size => ({ width: count > 8 ? 0.07 : 0.045, height: 0.1, depth: 0.075 });

function digitalModule(type: 'sdk.plc.di' | 'sdk.plc.do', signalType: 'DI' | 'DO'): ComponentTypeDefinition {
  return parametric(
    {
      type,
      version: '1',
      category: 'control',
      label: signalType === 'DI' ? 'PLC Digital Input Module' : 'PLC Digital Output Module',
      parameters: { channels: { label: 'Channels', choices: ['8', '16'], default: '16' } },
    },
    ({ channels: n }) => {
      const ids = channels(signalType, Number(n));
      return {
        size: MODULE(Number(n)),
        label: `${signalType} ${n}`,
        ports: ids.map((id) => ({ id, kind: 'signal', terminal: id, signal: { type: signalType } })),
        variables: ids.map((name) => ({ name, dataType: 'bool' })),
      };
    },
  );
}

function analogModule(type: 'sdk.plc.ai' | 'sdk.plc.ao', signalType: 'AI' | 'AO', counts: [string, string]): ComponentTypeDefinition {
  return parametric(
    {
      type,
      version: '1',
      category: 'control',
      label: signalType === 'AI' ? 'PLC Analog Input Module' : 'PLC Analog Output Module',
      parameters: {
        channels: { label: 'Channels', choices: counts, default: counts[1] },
        signal: { label: 'Signal', choices: Object.keys(ANALOG), default: '4-20 mA' },
      },
    },
    ({ channels: n, signal }) => {
      const { range, unit } = ANALOG[signal as Analog];
      const ids = channels(signalType, Number(n));
      return {
        size: MODULE(Number(n)),
        label: `${signalType} ${n}`,
        ports: ids.map((id) => ({ id, kind: 'signal', terminal: id, signal: { type: signalType, range: [...range] as [number, number], unit } })),
        variables: ids.map((name) => ({ name, dataType: 'float32', unit })),
      };
    },
  );
}

const plcCpu = parametric({ type: 'sdk.plc.cpu', version: '1', category: 'control', label: 'PLC Controller' }, () => ({
  size: { width: 0.12, height: 0.1, depth: 0.075 },
  label: 'PLC CPU',
  ports: [
    { id: 'eth1', kind: 'network', terminal: 'X1', network: ETHERNET },
    { id: 'eth2', kind: 'network', terminal: 'X2', network: ETHERNET },
    supply24(),
    earth(),
  ],
  variables: [{ name: 'RUN', dataType: 'bool' }, { name: 'FAULT', dataType: 'bool' }],
}));

const dcsController = parametric({ type: 'sdk.dcs.controller', version: '1', category: 'control', label: 'DCS Controller' }, () => ({
  size: { width: 0.16, height: 0.2, depth: 0.12 },
  label: 'DCS',
  ports: [
    { id: 'netA', kind: 'network', name: 'Network A', terminal: 'A', network: ETHERNET },
    { id: 'netB', kind: 'network', name: 'Network B (redundant)', terminal: 'B', network: ETHERNET },
    supply24(),
    earth(),
  ],
  variables: [{ name: 'RUN', dataType: 'bool' }, { name: 'FAULT', dataType: 'bool' }, { name: 'REDUNDANCY_OK', dataType: 'bool' }],
}));

const networkSwitch = parametric(
  { type: 'sdk.network.switch', version: '1', category: 'network', label: 'Ethernet Switch', parameters: { ports: { label: 'Ports', choices: ['5', '8', '16'], default: '8' } } },
  ({ ports: n }) => ({
    size: { width: Number(n) > 8 ? 0.11 : 0.06, height: 0.12, depth: 0.09 },
    label: `SWITCH ${n}`,
    ports: [...Array.from({ length: Number(n) }, (_, i) => ({ id: `P${i + 1}`, kind: 'network' as const, terminal: `P${i + 1}`, network: { medium: 'ethernet' } })), supply24()],
  }),
);

const powerSupply = parametric({ type: 'sdk.psu', version: '1', category: 'electrical', label: '24 V DC Power Supply' }, () => ({
  size: { width: 0.06, height: 0.12, depth: 0.11 },
  label: 'PSU 24V',
  ports: [
    { id: 'L1', kind: 'power', name: 'Mains in', flow: 'in', power: { kind: 'AC', voltage: 230, phases: 1 } },
    { id: '24V', kind: 'power', name: '24 V DC out', flow: 'out', power: { kind: 'DC', voltage: 24 }, maxConnections: 16 },
    earth(),
  ],
  variables: [{ name: 'DC_OK', dataType: 'bool' }],
}));

const definitions: ComponentTypeDefinition[] = [
  plcCpu,
  digitalModule('sdk.plc.di', 'DI'),
  digitalModule('sdk.plc.do', 'DO'),
  analogModule('sdk.plc.ai', 'AI', ['4', '8']),
  analogModule('sdk.plc.ao', 'AO', ['2', '4']),
  dcsController,
  networkSwitch,
  powerSupply,
];

const own = new WeakSet<object>(definitions);

/** True for the library's own definition objects: only these may use the reserved `sdk.` prefix. */
export function isLibraryDefinition(definition: object): boolean {
  return own.has(definition);
}

/**
 * The control equipment library (ADR-0025). Opt in with `createComponentRegistry(...controlLibrary)`;
 * without it nothing changes. Passive in simulation; ratings drive compatibility checks only.
 */
export const controlLibrary: readonly ComponentTypeDefinition[] = Object.freeze(definitions);
