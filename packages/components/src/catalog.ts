import type { ComponentKind, ConnectionPort, Vector3Tuple } from '@scada3d/core';
import type { GeometryPart, IndustrialComponentDefinition } from './geometry.js';
import { DEFAULT_SIZE, outerRadiusFor, pipeSizes, SIZE_PARAMETER, type PipeSize } from './sizes.js';

/** Nominal bore of every MVP fluid port, metres (DN150). */
export const nominalBore = 0.15;
/** Outer radius of pipes and nozzles at the nominal bore, metres (DN150 OD ≈ 168 mm). */
export const pipeOuterRadius = 0.084;

const r = pipeOuterRadius;
/** Elbow centreline bend radius, 2 × the DN150 bore, used at every size. */
const elbowBendRadius = 2 * nominalBore;

function fluidPort(id: string, position: Vector3Tuple, direction: Vector3Tuple, size: PipeSize = DEFAULT_SIZE): ConnectionPort {
  return { id, kind: 'fluid', position, direction, nominalSize: pipeSizes[size].bore };
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
export function pipeDefinition(length: number, size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const h = length / 2;
  const r = outerRadiusFor(size);
  return define({
    type: 'pipe',
    label: 'Straight Pipe',
    ports: [fluidPort('in', [-h, 0, 0], [-1, 0, 0], size), fluidPort('out', [h, 0, 0], [1, 0, 0], size)],
    bounds: { min: [-h, -r, -r], max: [h, r, r] },
    parts: [{ shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length }],
    parameters: { length: { ...PIPE_LENGTH }, size: SIZE_PARAMETER },
  });
}

/** 90° elbow, bend radius 0.3 m at every size. Local origin is where the two pipe axes intersect. */
export function elbowDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  return define({
    type: 'elbow',
    label: '90° Elbow',
    ports: [fluidPort('in', [-elbowBendRadius, 0, 0], [-1, 0, 0], size), fluidPort('out', [0, elbowBendRadius, 0], [0, 1, 0], size)],
    bounds: { min: [-elbowBendRadius, -r, -r], max: [r, elbowBendRadius, r] },
    parts: [{ shape: 'bend', role: 'shell', center: [-elbowBendRadius, elbowBendRadius, 0], bendRadius: elbowBendRadius, tubeRadius: r, startAngle: -Math.PI / 2 }],
    parameters: { size: SIZE_PARAMETER },
  });
}

/** Equal tee: 2 m run along X, 1 m branch up Y, the same size on all three ports. */
export function teeDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  return define({
    type: 'tee',
    label: 'T-Junction',
    ports: [fluidPort('left', [-1, 0, 0], [-1, 0, 0], size), fluidPort('right', [1, 0, 0], [1, 0, 0], size), fluidPort('branch', [0, 1, 0], [0, 1, 0], size)],
    bounds: { min: [-1, -r, -r], max: [1, 1, r] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: 2 },
      { shape: 'cylinder', role: 'shell', center: [0, 0.5, 0], axis: 'y', radius: r, length: 1 },
    ],
    parameters: { size: SIZE_PARAMETER },
  });
}

/** Ball valve, 1.2 m body; ball, stem and handle scale with the pipe diameter. */
export function valveDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  const k = r / pipeOuterRadius;
  return define({
    type: 'valve',
    label: 'Ball Valve',
    bindable: { open: 'boolean' },
    ports: [fluidPort('in', [-0.6, 0, 0], [-1, 0, 0], size), fluidPort('out', [0.6, 0, 0], [1, 0, 0], size)],
    bounds: { min: [-0.6, -0.2 * k, -0.2 * k], max: [0.6, 0.495 * k, 0.2 * k] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: 1.2 },
      { shape: 'sphere', role: 'valve-ball', center: [0, 0, 0], radius: 0.2 * k },
      { shape: 'cylinder', role: 'shell', center: [0, 0.32 * k, 0], axis: 'y', radius: 0.025 * k, length: 0.25 * k },
      { shape: 'box', role: 'valve-handle', center: [0, 0.47 * k, 0], size: [0.6 * k, 0.05 * k, 0.08 * k] },
    ],
    parameters: { size: SIZE_PARAMETER },
  });
}

/** Default outlet of a new reducer: one step down from DN150. */
export const REDUCER_OUTLET: PipeSize = 'DN100';

/** Concentric reducer, 0.3 m: `size` inlet stub, 0.2 m cone, `outletSize` outlet stub (ADR-0009). */
export function reducerDefinition(size: PipeSize = DEFAULT_SIZE, outletSize: PipeSize = REDUCER_OUTLET): IndustrialComponentDefinition {
  const [rin, rout] = [outerRadiusFor(size), outerRadiusFor(outletSize)];
  const m = Math.max(rin, rout);
  return define({
    type: 'reducer',
    label: 'Reducer',
    ports: [fluidPort('in', [-0.15, 0, 0], [-1, 0, 0], size), fluidPort('out', [0.15, 0, 0], [1, 0, 0], outletSize)],
    bounds: { min: [-0.15, -m, -m], max: [0.15, m, m] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [-0.125, 0, 0], axis: 'x', radius: rin, length: 0.05 },
      { shape: 'cone', role: 'shell', center: [0, 0, 0], axis: 'x', radiusStart: rin, radiusEnd: rout, length: 0.2 },
      { shape: 'cylinder', role: 'shell', center: [0.125, 0, 0], axis: 'x', radius: rout, length: 0.05 },
    ],
    parameters: { size: SIZE_PARAMETER, outletSize: { label: 'Outlet size', choices: SIZE_PARAMETER.choices, default: REDUCER_OUTLET } },
  });
}

/** Coupler length, stored as `properties.length` in metres. */
export const COUPLER_LENGTH = { label: 'Length', unit: 'm', default: 0.1, min: 0.05, max: 0.2, step: 0.01 } as const;

/** Short straight coupling between two equal ends: a pipe-sized bore with a wider sleeve band. */
export function couplerDefinition(size: PipeSize = DEFAULT_SIZE, length: number = COUPLER_LENGTH.default): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  const h = length / 2;
  const sleeve = r * 1.18;
  return define({
    type: 'coupler',
    label: 'Coupler',
    ports: [fluidPort('in', [-h, 0, 0], [-1, 0, 0], size), fluidPort('out', [h, 0, 0], [1, 0, 0], size)],
    bounds: { min: [-h, -sleeve, -sleeve], max: [h, sleeve, sleeve] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length },
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: sleeve, length: length * 0.6 },
    ],
    parameters: { size: SIZE_PARAMETER, length: { ...COUPLER_LENGTH } },
  });
}

/**
 * Front sight gauge shared by the tanks: a glass tube 1.08 m in front of the axis (+Z), a liquid
 * column inside it that follows the level, ticks every 10 % on its right (longer at 0/50/100 %)
 * and a blank name plate across it at `plateY`.
 */
function levelGauge(centreY: number, columnLength: number, plateY: number): GeometryPart[] {
  const centre: Vector3Tuple = [0, centreY, 1.08];
  const bottom = centreY - columnLength / 2;
  const ticks: GeometryPart[] = Array.from({ length: 11 }, (_, i) => {
    const major = i % 5 === 0;
    const length = major ? 0.08 : 0.045;
    return { shape: 'box', role: 'scale', center: [0.05 + length / 2, Math.round((bottom + (i / 10) * columnLength) * 1e9) / 1e9, 1.08], size: [length, major ? 0.008 : 0.005, 0.01] };
  });
  return [
    { shape: 'cylinder', role: 'gauge', center: centre, axis: 'y', radius: 0.04, length: columnLength + 0.04 },
    { shape: 'cylinder', role: 'liquid', center: centre, axis: 'y', radius: 0.025, length: columnLength },
    ...ticks,
    { shape: 'box', role: 'plate', center: [0, plateY, 1.135], size: [0.5, 0.16, 0.02] },
  ];
}

/** Stand under the vertical tank, metres; absent in older files means no stand (ADR-0013). */
export const TANK_STAND = { label: 'Stand height', unit: 'm', default: 0, min: 0, max: 3, step: 0.1, initial: 0.8, keepsBottom: true } as const;

/**
 * Flat-bottomed vertical tank: radius 1 m, 3 m shell, side nozzles, front sight gauge. On a
 * stand of `standHeight` m it stands on four legs with feet; its ports never move.
 */
export function tankDefinition(standHeight = 0): IndustrialComponentDefinition {
  const bottom = -1.535;
  const floor = bottom - standHeight;
  const legAt = (deg: number): [number, number] => [Math.round(0.75 * Math.cos((deg * Math.PI) / 180) * 1e9) / 1e9, Math.round(0.75 * Math.sin((deg * Math.PI) / 180) * 1e9) / 1e9];
  const stand: GeometryPart[] = standHeight > 0
    ? [45, 135, 225, 315].flatMap((deg): GeometryPart[] => {
        const [x, z] = legAt(deg);
        return [
          { shape: 'cylinder', role: 'shell', center: [x, bottom - standHeight / 2, z], axis: 'y', radius: 0.05, length: standHeight },
          { shape: 'box', role: 'shell', center: [x, floor + 0.01, z], size: [0.16, 0.02, 0.16] },
        ];
      })
    : [];
  return define({
    type: 'tank',
    label: 'Vertical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [-1.2, 0.8, 0], [-1, 0, 0]), fluidPort('outlet', [1.2, -0.9, 0], [1, 0, 0])],
    bounds: { min: [-1.2, standHeight > 0 ? floor : bottom, -1], max: [1.2, 1.535, 1.145] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'y', radius: 1, length: 3, openEnded: true },
      { shape: 'cylinder', role: 'shell', center: [0, -1.5, 0], axis: 'y', radius: 1, length: 0.07 },
      { shape: 'cylinder', role: 'shell', center: [0, 1.5, 0], axis: 'y', radius: 1, length: 0.07 },
      { shape: 'cylinder', role: 'shell', center: [-1.1, 0.8, 0], axis: 'x', radius: r, length: 0.2 },
      { shape: 'cylinder', role: 'shell', center: [1.1, -0.9, 0], axis: 'x', radius: r, length: 0.2 },
      { shape: 'cylinder', role: 'liquid', center: [0, 0, 0], axis: 'y', radius: 0.94, length: 2.93 },
      ...levelGauge(0, 2.76, 0.4),
      ...stand,
    ],
    parameters: { standHeight: { ...TANK_STAND } },
  });
}

/**
 * Conical-bottom tank on three legs: 2 m cylindrical body (radius 1 m) over a 1 m cone. Inlet on
 * top; the outlet leaves the cone tip, bends and runs out horizontally to +X, 0.4 m above the
 * ground. The front (+Z) carries the shared sight gauge, scale and name plate (`levelGauge`).
 */
function conicalTankDefinition(): IndustrialComponentDefinition {
  const legAt = (deg: number): [number, number, number] => [0.9 * Math.cos((deg * Math.PI) / 180), -1.5, 0.9 * Math.sin((deg * Math.PI) / 180)];
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const coneRadiusAt = (y: number) => r + (1 - r) * (y + 1.5);
  return define({
    type: 'conicalTank',
    label: 'Conical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [0, 1.7, 0], [0, 1, 0]), fluidPort('outlet', [1.1, -2.1, 0], [1, 0, 0])],
    bounds: { min: [-1, -2.5, -1], max: [1.1, 1.7, 1.145] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0.5, 0], axis: 'y', radius: 1, length: 2, openEnded: true },
      { shape: 'cylinder', role: 'shell', center: [0, 1.5, 0], axis: 'y', radius: 1, length: 0.07 },
      { shape: 'cylinder', role: 'shell', center: [0, 1.6175, 0], axis: 'y', radius: r, length: 0.165 },
      { shape: 'cone', role: 'shell', center: [0, -1, 0], axis: 'y', radiusStart: r, radiusEnd: 1, length: 1, openEnded: true },
      { shape: 'cylinder', role: 'shell', center: [0, -1.65, 0], axis: 'y', radius: r, length: 0.3 },
      { shape: 'bend', role: 'shell', center: [0.3, -1.8, 0], bendRadius: 0.3, tubeRadius: r, startAngle: Math.PI },
      { shape: 'cylinder', role: 'shell', center: [0.7, -2.1, 0], axis: 'x', radius: r, length: 0.8 },
      ...[90, 210, 330].map((deg) => ({ shape: 'cylinder' as const, role: 'shell' as const, center: legAt(deg).map(round) as [number, number, number], axis: 'y' as const, radius: 0.05, length: 2 })),
      ...levelGauge(0.5, 1.86, 0.9),
      // Liquid 4 cm inside the walls, from just above the cone tip to just below the cap.
      { shape: 'lathe', role: 'liquid', center: [0, 0, 0], points: [[round(coneRadiusAt(-1.46) - 0.04), -1.46], [0.96, -0.5], [0.96, 1.46]] },
    ],
  });
}

export const componentCatalog: Record<ComponentKind, IndustrialComponentDefinition> = {
  // Vertical tank: radius 1 m, shell height 3 m, side nozzles 0.2 m long.
  tank: tankDefinition(),
  conicalTank: conicalTankDefinition(),
  pipe: pipeDefinition(PIPE_LENGTH.default),
  elbow: elbowDefinition(),
  tee: teeDefinition(),
  valve: valveDefinition(),
  reducer: reducerDefinition(),
  coupler: couplerDefinition(),
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
