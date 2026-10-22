import type { ConnectionPort, Vector3Tuple, VariableTemplate } from '@sakibcoolz/core';
import type { Bounds, GeometryPart } from '../geometry.js';
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
function frontTerminals(size: Size, ports: Unplaced[]): ConnectionPort[] {
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

const supply24 = (): Unplaced => ({ id: '24V', kind: 'power', name: '24 V DC supply', flow: 'in', power: { kind: 'DC', voltage: 24 } });
const earth = (maxConnections?: number): Unplaced => ({ id: 'PE', kind: 'power', name: 'Protective earth', power: { kind: 'PE' }, ...(maxConnections ? { maxConnections } : {}) });

type Unplaced = Omit<ConnectionPort, 'position' | 'direction'>;
type Built = { ports: ConnectionPort[]; parts: GeometryPart[]; bounds: Bounds; variables?: VariableTemplate[] };

/**
 * A definition whose ports, tags and parts follow its parameters: the base shape is `make` of the
 * defaults, and `build` gives every other combination (the registry calls it only with valid values).
 */
function parametric(head: Omit<ComponentTypeDefinition, 'ports' | 'parts' | 'bounds' | 'variables' | 'build'>, make: (values: Values) => Built): ComponentTypeDefinition {
  const defaults = Object.fromEntries(Object.entries(head.parameters ?? {}).map(([name, spec]) => [name, spec.default]));
  return { ...head, ...make(defaults), ...(head.parameters ? { build: make } : {}) };
}

/** A boxed device: housing, label plate and front terminals, plus any `extra` parts (a keypad). */
function boxed(shape: (values: Values) => { size: Size; label: string; ports: Unplaced[]; variables?: VariableTemplate[]; extra?: GeometryPart[] }) {
  return (values: Values): Built => {
    const s = shape(values);
    return { ports: frontTerminals(s.size, s.ports), parts: [...housing(s.size, s.label), ...(s.extra ?? [])], bounds: bounds(s.size), ...(s.variables ? { variables: s.variables } : {}) };
  };
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
    boxed(({ channels: n }) => {
      const ids = channels(signalType, Number(n));
      return {
        size: MODULE(Number(n)),
        label: `${signalType} ${n}`,
        ports: ids.map((id) => ({ id, kind: 'signal', terminal: id, signal: { type: signalType } })),
        variables: ids.map((name) => ({ name, dataType: 'bool' })),
      };
    }),
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
    boxed(({ channels: n, signal }) => {
      const { range, unit } = ANALOG[signal as Analog];
      const ids = channels(signalType, Number(n));
      return {
        size: MODULE(Number(n)),
        label: `${signalType} ${n}`,
        ports: ids.map((id) => ({ id, kind: 'signal', terminal: id, signal: { type: signalType, range: [...range] as [number, number], unit } })),
        variables: ids.map((name) => ({ name, dataType: 'float32', unit })),
      };
    }),
  );
}

const plcCpu = parametric({ type: 'sdk.plc.cpu', version: '1', category: 'control', label: 'PLC Controller' }, boxed(() => ({
  size: { width: 0.12, height: 0.1, depth: 0.075 },
  label: 'PLC CPU',
  ports: [
    { id: 'eth1', kind: 'network', terminal: 'X1', network: ETHERNET },
    { id: 'eth2', kind: 'network', terminal: 'X2', network: ETHERNET },
    supply24(),
    earth(),
  ],
  variables: [{ name: 'RUN', dataType: 'bool' }, { name: 'FAULT', dataType: 'bool' }],
})));

const dcsController = parametric({ type: 'sdk.dcs.controller', version: '1', category: 'control', label: 'DCS Controller' }, boxed(() => ({
  size: { width: 0.16, height: 0.2, depth: 0.12 },
  label: 'DCS',
  ports: [
    { id: 'netA', kind: 'network', name: 'Network A', terminal: 'A', network: ETHERNET },
    { id: 'netB', kind: 'network', name: 'Network B (redundant)', terminal: 'B', network: ETHERNET },
    supply24(),
    earth(),
  ],
  variables: [{ name: 'RUN', dataType: 'bool' }, { name: 'FAULT', dataType: 'bool' }, { name: 'REDUNDANCY_OK', dataType: 'bool' }],
})));

const networkSwitch = parametric(
  { type: 'sdk.network.switch', version: '1', category: 'network', label: 'Ethernet Switch', parameters: { ports: { label: 'Ports', choices: ['5', '8', '16'], default: '8' } } },
  boxed(({ ports: n }) => ({
    size: { width: Number(n) > 8 ? 0.11 : 0.06, height: 0.12, depth: 0.09 },
    label: `SWITCH ${n}`,
    ports: [...Array.from({ length: Number(n) }, (_, i) => ({ id: `P${i + 1}`, kind: 'network' as const, terminal: `P${i + 1}`, network: { medium: 'ethernet' } })), supply24()],
  })),
);

const powerSupply = parametric({ type: 'sdk.psu', version: '1', category: 'electrical', label: '24 V DC Power Supply' }, boxed(() => ({
  size: { width: 0.06, height: 0.12, depth: 0.11 },
  label: 'PSU 24V',
  ports: [
    { id: 'L1', kind: 'power', name: 'Mains in', flow: 'in', power: { kind: 'AC', voltage: 230, phases: 1 } },
    { id: '24V', kind: 'power', name: '24 V DC out', flow: 'out', power: { kind: 'DC', voltage: 24 }, maxConnections: 16 },
    earth(),
  ],
  variables: [{ name: 'DC_OK', dataType: 'bool' }],
})));

const VOLTAGES = ['230', '400', '480'];
const RATED_POWER = { label: 'Rated power', unit: 'kW', default: 7.5, min: 0.75, max: 90, step: 0.25 } as const;
/** Frame size from rated power: 0.09 at 0.75 kW to 1 at 90 kW. */
const frame = (kw: number) => Math.sqrt(kw / 90);
const threePhase = (voltage: number) => ({ kind: 'AC' as const, voltage, phases: 3 as const });
const UP: Vector3Tuple = [0, 1, 0];

const vfd = parametric(
  {
    type: 'sdk.vfd',
    version: '1',
    category: 'electrical',
    label: 'Variable-Frequency Drive',
    parameters: { ratedPowerKw: RATED_POWER, supply: { label: 'Supply', choices: VOLTAGES, default: '400' } },
  },
  boxed(({ ratedPowerKw, supply }) => {
    const f = frame(Number(ratedPowerKw));
    const size = { width: 0.12 + 0.18 * f, height: 0.25 + 0.45 * f, depth: 0.15 + 0.1 * f };
    const volts = Number(supply);
    return {
      size,
      label: 'VFD',
      ports: [
        { id: 'L1-L3', kind: 'power', name: 'Mains in', terminal: 'L1 L2 L3', flow: 'in', power: threePhase(volts) },
        { id: 'U-V-W', kind: 'power', name: 'Motor out', terminal: 'U V W', flow: 'out', power: threePhase(volts) },
        earth(),
        { id: 'run', kind: 'signal', name: 'Run command', terminal: 'DI1', signal: { type: 'DI' } },
        { id: 'reset', kind: 'signal', name: 'Fault reset', terminal: 'DI2', signal: { type: 'DI' } },
        { id: 'speedRef', kind: 'signal', name: 'Speed reference', terminal: 'AI1', signal: { type: 'AI', range: [4, 20], unit: 'mA' } },
        { id: 'speed', kind: 'signal', name: 'Actual speed', terminal: 'AO1', signal: { type: 'AO', range: [4, 20], unit: 'mA' } },
        { id: 'fault', kind: 'signal', name: 'Fault relay', terminal: 'RO1', signal: { type: 'DO' } },
        { id: 'eth', kind: 'network', terminal: 'X1', network: ETHERNET },
      ],
      variables: [
        { name: 'ACTUAL_SPEED', dataType: 'float32', unit: 'rpm' },
        { name: 'OUTPUT_FREQUENCY', dataType: 'float32', unit: 'Hz' },
        { name: 'OUTPUT_CURRENT', dataType: 'float32', unit: 'A' },
        { name: 'RUNNING', dataType: 'bool' },
        { name: 'FAULT', dataType: 'bool' },
      ],
      // Keypad below the label plate.
      extra: [{ shape: 'box', role: 'plate', center: [0, size.height * 0.7, size.depth / 2 + 0.004], size: [size.width * 0.45, size.height * 0.12, 0.008] }],
    };
  }),
);

/** A foot-mounted motor along x: finned body, terminal box on top, shaft out of the +x end. */
const motor = parametric(
  {
    type: 'sdk.motor',
    version: '1',
    category: 'electrical',
    label: 'AC Induction Motor',
    parameters: { ratedPowerKw: RATED_POWER, voltage: { label: 'Voltage', choices: VOLTAGES, default: '400' } },
  },
  ({ ratedPowerKw, voltage }) => {
    const f = frame(Number(ratedPowerKw));
    const r = 0.08 + 0.17 * f, length = 0.25 + 0.5 * f, foot = 0.04 + 0.04 * f;
    const shaftLength = 0.05 + 0.07 * f, shaftRadius = r * 0.2;
    const axisY = foot + r;
    const box = { width: r * 0.9, height: r * 0.5, depth: r * 0.9 };
    const boxTop = axisY + r + box.height;
    const fins = Array.from({ length: 5 }, (_, i): GeometryPart => ({ shape: 'ring', role: 'shell', center: [-length / 2 + ((i + 1) * length) / 6, axisY, 0], axis: 'x', radius: r, tube: r * 0.04 }));
    return {
      parts: [
        { shape: 'cylinder', role: 'shell', center: [0, axisY, 0], axis: 'x', radius: r, length },
        ...fins,
        { shape: 'box', role: 'shell', center: [0, foot / 2, 0], size: [length * 0.8, foot, r * 1.6] },
        { shape: 'box', role: 'shell', center: [0, axisY + r + box.height / 2, 0], size: [box.width, box.height, box.depth] },
        { shape: 'cylinder', role: 'shell', center: [length / 2 + shaftLength / 2, axisY, 0], axis: 'x', radius: shaftRadius, length: shaftLength },
      ],
      bounds: { min: [-length / 2, 0, -r * 1.05], max: [length / 2 + shaftLength, boxTop, r * 1.05] },
      ports: [
        { id: 'terminals', kind: 'power', name: 'Motor terminals', terminal: 'U V W', flow: 'in', power: threePhase(Number(voltage)), position: [0, boxTop, 0], direction: UP },
        { id: 'PE', kind: 'power', name: 'Protective earth', power: { kind: 'PE' }, position: [0, axisY + r + box.height / 2, box.depth / 2], direction: FRONT },
        { id: 'shaft', kind: 'mechanical', name: 'Drive shaft', position: [length / 2 + shaftLength, axisY, 0], direction: [1, 0, 0] },
      ],
    };
  },
);

/** A small field instrument: process stem, round head with a name plate, terminals under the head. */
function fieldDevice(head: Omit<ComponentTypeDefinition, 'ports' | 'parts' | 'bounds' | 'variables' | 'build'>, shape: (values: Values) => { label: string; out: Unplaced; variables: VariableTemplate[] }) {
  // Instruments belong on the process diagram as well as the wiring (ADR-0026).
  return parametric({ ...head, views: ['process', 'electrical'] }, (values) => {
    const s = shape(values);
    const stem = 0.1, headRadius = 0.045, headLength = 0.06;
    const centre = stem + headRadius;
    return {
      parts: [
        { shape: 'cylinder', role: 'shell', center: [0, stem / 2, 0], axis: 'y', radius: 0.012, length: stem },
        { shape: 'cylinder', role: 'shell', center: [0, centre, 0], axis: 'z', radius: headRadius, length: headLength },
        { shape: 'box', role: 'plate', center: [0, centre, headLength / 2 + 0.002], size: [headRadius * 1.2, headRadius * 0.6, 0.004], text: s.label },
      ],
      bounds: { min: [-headRadius, 0, -headLength / 2], max: [headRadius, stem + 2 * headRadius, headLength / 2 + 0.004] },
      ports: [
        { ...s.out, position: [-headRadius / 2, centre - headRadius / 2, headLength / 2], direction: FRONT },
        { ...supply24(), position: [headRadius / 2, centre - headRadius / 2, headLength / 2], direction: FRONT },
      ],
      variables: s.variables,
    };
  });
}

/** Measured quantity → the unit of its process value. */
const MEASURES: Record<string, string> = { pressure: 'bar', temperature: '°C', level: '%', flow: 'm³/h' };

const transmitter = fieldDevice(
  { type: 'sdk.transmitter', version: '1', category: 'instrument', label: 'Analog Transmitter', parameters: { measures: { label: 'Measures', choices: Object.keys(MEASURES), default: 'pressure' } } },
  ({ measures }) => ({
    label: 'TX',
    out: { id: 'out', kind: 'signal', name: '4–20 mA output', terminal: '+/−', signal: { type: 'AO', range: [4, 20], unit: 'mA' } },
    variables: [{ name: 'PV', dataType: 'float32', unit: MEASURES[measures as string] }],
  }),
);

const digitalSensor = fieldDevice({ type: 'sdk.switch', version: '1', category: 'instrument', label: 'Digital Sensor (Switch)' }, () => ({
  label: 'SW',
  out: { id: 'out', kind: 'signal', name: 'Switched output', terminal: 'Q', signal: { type: 'DO' } },
  variables: [{ name: 'STATE', dataType: 'bool' }],
}));

/** A floor-standing cabinet: mains entry on the roof, earth bar along the bottom front. */
const panel = parametric(
  {
    type: 'sdk.panel',
    version: '1',
    category: 'enclosure',
    label: 'Control Cabinet',
    parameters: {
      width: { label: 'Width', unit: 'm', default: 0.8, min: 0.3, max: 2.4, step: 0.05 },
      height: { label: 'Height', unit: 'm', default: 1.2, min: 0.3, max: 2.4, step: 0.05 },
      depth: { label: 'Depth', unit: 'm', default: 0.4, min: 0.15, max: 0.8, step: 0.05 },
    },
  },
  ({ width, height, depth }) => {
    const size = { width: Number(width), height: Number(height), depth: Number(depth) };
    return {
      parts: housing(size, 'PANEL'),
      bounds: bounds(size),
      ports: [
        { id: 'PE', kind: 'power', name: 'Earth bar', terminal: 'PE', power: { kind: 'PE' }, maxConnections: 32, position: [0, 0.05, size.depth / 2], direction: FRONT },
        { id: 'mains', kind: 'power', name: 'Mains in', flow: 'in', power: { kind: 'AC' }, position: [0, size.height, 0], direction: UP },
      ],
    };
  },
);

const definitions: ComponentTypeDefinition[] = [
  plcCpu,
  digitalModule('sdk.plc.di', 'DI'),
  digitalModule('sdk.plc.do', 'DO'),
  analogModule('sdk.plc.ai', 'AI', ['4', '8']),
  analogModule('sdk.plc.ao', 'AO', ['2', '4']),
  dcsController,
  networkSwitch,
  powerSupply,
  vfd,
  motor,
  transmitter,
  digitalSensor,
  panel,
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
