import type { ComponentKind, ConnectionPort, Vector3Tuple } from '@scada3d/core';
import type { IndustrialComponentDefinition } from './geometry';

/** Nominal bore of every MVP fluid port, metres (DN150). */
export const nominalBore = 0.15;
/** Outer radius of pipes and nozzles at the nominal bore, metres (DN150 OD ≈ 168 mm). */
export const pipeOuterRadius = 0.084;

const r = pipeOuterRadius;
const elbowBendRadius = 2 * nominalBore;

function fluidPort(id: string, position: Vector3Tuple, direction: Vector3Tuple): ConnectionPort {
  return { id, kind: 'fluid', position, direction, nominalSize: nominalBore };
}

function size(bounds: IndustrialComponentDefinition['bounds']): Vector3Tuple {
  return [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
}

function define(definition: Omit<IndustrialComponentDefinition, 'defaultSize'>): IndustrialComponentDefinition {
  return { ...definition, defaultSize: size(definition.bounds) };
}

/** Straight pipe length, stored as `properties.length` in metres. */
export const PIPE_LENGTH = { label: 'Length', unit: 'm', default: 2, min: 0.2, max: 20, step: 0.1 } as const;

/** A straight pipe of `length` metres, centred on its origin along local X, ports at both ends. */
export function pipeDefinition(length: number): IndustrialComponentDefinition {
  const h = length / 2;
  return define({
    type: 'pipe',
    label: 'Straight Pipe',
    ports: [fluidPort('in', [-h, 0, 0], [-1, 0, 0]), fluidPort('out', [h, 0, 0], [1, 0, 0])],
    bounds: { min: [-h, -r, -r], max: [h, r, r] },
    parts: [{ shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length }],
    parameters: { length: { ...PIPE_LENGTH } },
  });
}

export const componentCatalog: Record<ComponentKind, IndustrialComponentDefinition> = {
  // Vertical tank: radius 1 m, shell height 3 m, side nozzles 0.2 m long.
  tank: define({
    type: 'tank',
    label: 'Vertical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [-1.2, 0.8, 0], [-1, 0, 0]), fluidPort('outlet', [1.2, -0.9, 0], [1, 0, 0])],
    bounds: { min: [-1.2, -1.535, -1], max: [1.2, 1.535, 1] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'y', radius: 1, length: 3, openEnded: true },
      { shape: 'cylinder', role: 'shell', center: [0, -1.5, 0], axis: 'y', radius: 1, length: 0.07 },
      { shape: 'cylinder', role: 'shell', center: [0, 1.5, 0], axis: 'y', radius: 1, length: 0.07 },
      { shape: 'cylinder', role: 'shell', center: [-1.1, 0.8, 0], axis: 'x', radius: r, length: 0.2 },
      { shape: 'cylinder', role: 'shell', center: [1.1, -0.9, 0], axis: 'x', radius: r, length: 0.2 },
      { shape: 'cylinder', role: 'liquid', center: [0, 0, 0], axis: 'y', radius: 0.94, length: 2.93 },
    ],
  }),
  pipe: pipeDefinition(PIPE_LENGTH.default),
  // 90° elbow, bend radius 2 × bore. Local origin is where the two pipe axes intersect.
  elbow: define({
    type: 'elbow',
    label: '90° Elbow',
    ports: [fluidPort('in', [-elbowBendRadius, 0, 0], [-1, 0, 0]), fluidPort('out', [0, elbowBendRadius, 0], [0, 1, 0])],
    bounds: { min: [-elbowBendRadius, -r, -r], max: [r, elbowBendRadius, r] },
    parts: [
      {
        shape: 'bend',
        role: 'shell',
        center: [-elbowBendRadius, elbowBendRadius, 0],
        bendRadius: elbowBendRadius,
        tubeRadius: r,
        startAngle: -Math.PI / 2,
      },
    ],
  }),
  tee: define({
    type: 'tee',
    label: 'T-Junction',
    ports: [
      fluidPort('left', [-1, 0, 0], [-1, 0, 0]),
      fluidPort('right', [1, 0, 0], [1, 0, 0]),
      fluidPort('branch', [0, 1, 0], [0, 1, 0]),
    ],
    bounds: { min: [-1, -r, -r], max: [1, 1, r] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: 2 },
      { shape: 'cylinder', role: 'shell', center: [0, 0.5, 0], axis: 'y', radius: r, length: 1 },
    ],
  }),
  valve: define({
    type: 'valve',
    label: 'Ball Valve',
    bindable: { open: 'boolean' },
    ports: [fluidPort('in', [-0.6, 0, 0], [-1, 0, 0]), fluidPort('out', [0.6, 0, 0], [1, 0, 0])],
    bounds: { min: [-0.6, -0.2, -0.2], max: [0.6, 0.495, 0.2] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: 1.2 },
      { shape: 'sphere', role: 'valve-ball', center: [0, 0, 0], radius: 0.2 },
      { shape: 'cylinder', role: 'shell', center: [0, 0.32, 0], axis: 'y', radius: 0.025, length: 0.25 },
      { shape: 'box', role: 'valve-handle', center: [0, 0.47, 0], size: [0.6, 0.05, 0.08] },
    ],
  }),
  // End-suction centrifugal pump placeholder: suction on -X, discharge on top.
  pump: define({
    type: 'pump',
    label: 'Centrifugal Pump',
    ports: [fluidPort('suction', [-0.6, 0, 0], [-1, 0, 0]), fluidPort('discharge', [0.3, 0.6, 0], [0, 1, 0])],
    bounds: { min: [-0.6, -0.4, -0.175], max: [0.4, 0.6, 0.175] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'z', radius: 0.4, length: 0.35 },
      { shape: 'cylinder', role: 'shell', center: [-0.475, 0, 0], axis: 'x', radius: r, length: 0.25 },
      { shape: 'cylinder', role: 'shell', center: [0.3, 0.4, 0], axis: 'y', radius: r, length: 0.4 },
    ],
  }),
  // Placeholders without ports until mechanical and signal connections are designed.
  sensor: define({
    type: 'sensor',
    label: 'Sensor',
    ports: [],
    bounds: { min: [-0.15, -0.3, -0.15], max: [0.15, 0.3, 0.15] },
    parts: [{ shape: 'box', role: 'shell', center: [0, 0, 0], size: [0.3, 0.6, 0.3] }],
  }),
  motor: define({
    type: 'motor',
    label: 'Motor',
    ports: [],
    bounds: { min: [-0.5, -0.38, -0.38], max: [0.7, 0.38, 0.38] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: 0.38, length: 1 },
      { shape: 'cylinder', role: 'shell', center: [0.6, 0, 0], axis: 'x', radius: 0.04, length: 0.2 },
    ],
  }),
};
