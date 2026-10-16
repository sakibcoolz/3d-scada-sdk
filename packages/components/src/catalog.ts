import type { ComponentKind, ConnectionPort, Vector3Tuple } from '@scada3d/core';
import type { GeometryPart, IndustrialComponentDefinition } from './geometry.js';
import { DEFAULT_SIZE, outerRadiusFor, pipeSizes, SIZE_PARAMETER, type PipeSize } from './sizes.js';
import { asme } from './asme.js';
import { CAPACITY_UNITS, capacityOf, formatCapacity, type CapacityUnit } from './vessel.js';

/** Nominal bore of every MVP fluid port, metres (DN150). */
export const nominalBore = 0.15;
/** Outer radius of DN150 pipes and nozzles, metres: ASME B36.10M OD 168.3 mm (ADR-0014). */
export const pipeOuterRadius = 0.08415;

const r = pipeOuterRadius;
/** Bend radius of the conical tank's built-in outlet bend, metres. */
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

/** ASME B16.9 long-radius 90° elbow: bend radius = centre-to-end A. Origin where the pipe axes meet. */
export function elbowDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  const a = asme[size].elbowLR90;
  return define({
    type: 'elbow',
    label: '90° Elbow',
    ports: [fluidPort('in', [-a, 0, 0], [-1, 0, 0], size), fluidPort('out', [0, a, 0], [0, 1, 0], size)],
    bounds: { min: [-a, -r, -r], max: [r, a, r] },
    parts: [{ shape: 'bend', role: 'shell', center: [-a, a, 0], bendRadius: a, tubeRadius: r, startAngle: -Math.PI / 2 }],
    parameters: { size: SIZE_PARAMETER },
  });
}

/** ASME B16.9 equal tee: run ends and branch end at centre-to-end C, the same size on all three ports. */
export function teeDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  const c = asme[size].teeCenterToEnd;
  return define({
    type: 'tee',
    label: 'T-Junction',
    ports: [fluidPort('left', [-c, 0, 0], [-1, 0, 0], size), fluidPort('right', [c, 0, 0], [1, 0, 0], size), fluidPort('branch', [0, c, 0], [0, 1, 0], size)],
    bounds: { min: [-c, -r, -r], max: [c, c, r] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: 2 * c },
      { shape: 'cylinder', role: 'shell', center: [0, c / 2, 0], axis: 'y', radius: r, length: c },
    ],
    parameters: { size: SIZE_PARAMETER },
  });
}

/**
 * Flanged ball valve, ASME B16.10 Class 150 short pattern: ports at the raised faces, F apart. The
 * ball body, stem and lever (0.9 F) fit within F; the lever lies along the pipe when open (ADR-0016).
 */
export function valveDefinition(size: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const r = outerRadiusFor(size);
  const f = asme[size].valveFaceToFace;
  const h = f / 2;
  const ball = Math.min(0.45 * f, 1.6 * r);
  const stem = { bottom: 0.9 * ball, length: 0.3 * f, radius: 0.15 * r };
  const lever: Vector3Tuple = [0.9 * f, 0.2 * r, 0.35 * r];
  const leverY = stem.bottom + stem.length + lever[1] / 2;
  return define({
    type: 'valve',
    label: 'Ball Valve',
    bindable: { open: 'boolean' },
    ports: [fluidPort('in', [-h, 0, 0], [-1, 0, 0], size), fluidPort('out', [h, 0, 0], [1, 0, 0], size)],
    bounds: { min: [-h, -ball, -ball], max: [h, leverY + lever[1] / 2, ball] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: r, length: f },
      { shape: 'sphere', role: 'valve-ball', center: [0, 0, 0], radius: ball },
      { shape: 'cylinder', role: 'shell', center: [0, stem.bottom + stem.length / 2, 0], axis: 'y', radius: stem.radius, length: stem.length },
      { shape: 'box', role: 'valve-handle', center: [0, leverY, 0], size: lever },
    ],
    parameters: { size: SIZE_PARAMETER },
  });
}

/** Default outlet of a new reducer: one step down from DN150. */
export const REDUCER_OUTLET: PipeSize = 'DN100';

/**
 * ASME B16.9 concentric reducer: length H by the larger end; 20 % straight at each end around a
 * 60 % cone. `size` is the inlet, `outletSize` the outlet (ADR-0009, ADR-0014).
 */
export function reducerDefinition(size: PipeSize = DEFAULT_SIZE, outletSize: PipeSize = REDUCER_OUTLET): IndustrialComponentDefinition {
  const [rin, rout] = [outerRadiusFor(size), outerRadiusFor(outletSize)];
  const m = Math.max(rin, rout);
  const larger = pipeSizes[size].bore >= pipeSizes[outletSize].bore ? size : outletSize;
  const h = asme[larger].reducerLength;
  const stub = 0.2 * h;
  return define({
    type: 'reducer',
    label: 'Reducer',
    ports: [fluidPort('in', [-h / 2, 0, 0], [-1, 0, 0], size), fluidPort('out', [h / 2, 0, 0], [1, 0, 0], outletSize)],
    bounds: { min: [-h / 2, -m, -m], max: [h / 2, m, m] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [-h / 2 + stub / 2, 0, 0], axis: 'x', radius: rin, length: stub },
      { shape: 'cone', role: 'shell', center: [0, 0, 0], axis: 'x', radiusStart: rin, radiusEnd: rout, length: h - 2 * stub },
      { shape: 'cylinder', role: 'shell', center: [h / 2 - stub / 2, 0, 0], axis: 'x', radius: rout, length: stub },
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
 * Front sight gauge shared by the tanks: a glass tube `z` in front of the axis (+Z), a liquid
 * column inside it that follows the level, ticks every 10 % on its right (longer at 0/50/100 %)
 * and a name plate across it at `plateY` showing `plateText` (the capacity).
 */
function levelGauge(centreY: number, columnLength: number, plateY: number, z: number, plateText: string, x = 0): GeometryPart[] {
  const centre: Vector3Tuple = [x, centreY, z];
  const bottom = centreY - columnLength / 2;
  const ticks: GeometryPart[] = Array.from({ length: 11 }, (_, i) => {
    const major = i % 5 === 0;
    const length = major ? 0.08 : 0.045;
    return { shape: 'box', role: 'scale', center: [Math.round((x + 0.05 + length / 2) * 1e9) / 1e9, Math.round((bottom + (i / 10) * columnLength) * 1e9) / 1e9, z], size: [length, major ? 0.008 : 0.005, 0.01] };
  });
  return [
    { shape: 'cylinder', role: 'gauge', center: centre, axis: 'y', radius: 0.04, length: columnLength + 0.04 },
    { shape: 'cylinder', role: 'liquid', center: centre, axis: 'y', radius: 0.025, length: columnLength },
    ...ticks,
    { shape: 'box', role: 'plate', center: [x, plateY, Math.round((z + 0.055) * 1e9) / 1e9], size: [0.5, 0.16, 0.02], text: plateText },
  ];
}

/**
 * An X brace between each pair of neighbouring legs (`legs` as [x, z], in order round the stand,
 * `closed` joining the last to the first): from the top of one to the foot of the next and back.
 */
function crossBraces(legs: readonly [number, number][], top: number, bottom: number, radius: number, closed = true): GeometryPart[] {
  const pairs = legs.slice(0, closed ? legs.length : legs.length - 1).map((a, i) => [a, legs[(i + 1) % legs.length]] as const);
  return pairs.flatMap(([[ax, az], [bx, bz]]): GeometryPart[] => [
    { shape: 'strut', role: 'shell', from: [ax, top, az], to: [bx, bottom, bz], radius },
    { shape: 'strut', role: 'shell', from: [bx, top, bz], to: [ax, bottom, az], radius },
  ]);
}

/** A leg from `top` down to `floor` with a square foot, both scaled by `k`. */
function legWithFoot(x: number, z: number, top: number, floor: number, k: number): GeometryPart[] {
  return [
    { shape: 'cylinder', role: 'shell', center: [x, round9((top + floor) / 2), z], axis: 'y', radius: round9(0.05 * k), length: round9(top - floor) },
    { shape: 'box', role: 'shell', center: [x, round9(floor + 0.01), z], size: [round9(0.16 * k), 0.02, round9(0.16 * k)] },
  ];
}

/** Capacity unit on a tank's name plate. */
const CAPACITY_UNIT = { label: 'Capacity unit', choices: CAPACITY_UNITS, default: 'm³' } as const;

/** Stand under the vertical tank, metres; absent in older files means no stand (ADR-0013). */
export const TANK_STAND = { label: 'Stand height', unit: 'm', default: 0, min: 0, max: 3, step: 0.1, initial: 0.8, keepsBottom: true } as const;
/** Vertical tank shell diameter and straight height, metres (ADR-0017); defaults are the original tank. */
export const TANK_DIAMETER = { label: 'Diameter', unit: 'm', default: 2, min: 0.6, max: 12, step: 0.1, keepsBottom: true } as const;
export const TANK_HEIGHT = { label: 'Shell height', unit: 'm', default: 3, min: 0.8, max: 20, step: 0.1, keepsBottom: true } as const;
/** Top of the vertical tank: flat plate or 2:1 semi-ellipsoidal (dished) head. */
export const TANK_HEAD = { label: 'Top head', choices: ['flat', 'dished'], default: 'flat' } as const;

/** Size of a vessel's or pump's flanged nozzles; ports keep their place at every size (ADR-0016). */
const nozzleParameter = (label: string) => ({ ...SIZE_PARAMETER, label });

export interface TankShape {
  standHeight?: number;
  nozzleSize?: PipeSize;
  diameter?: number;
  height?: number;
  head?: 'flat' | 'dished';
  capacityUnit?: CapacityUnit;
}

const round9 = (n: number) => Math.round(n * 1e9) / 1e9;
/** Quarter of a 2:1 ellipse from the rim (radius `a`, at y0) to the crown (depth `b`), 24 steps. */
const ellipseHead = (a: number, b: number, y0: number): [number, number][] =>
  Array.from({ length: 25 }, (_, k) => {
    const t = (k / 24) * (Math.PI / 2);
    return [round9(a * Math.cos(t)), round9(y0 + b * Math.sin(t))];
  });

/**
 * Flat-bottomed vertical tank, `diameter` across with a `height` straight shell (default 2 × 3 m),
 * a flat or dished (2:1 semi-ellipsoidal) top, side nozzles 0.2 m long and a front sight gauge
 * whose plate shows the capacity. On a stand of `standHeight` m it stands on four legs with feet.
 * Nozzles are `nozzleSize`; nozzle size never moves the ports.
 */
export function tankDefinition(shape: TankShape = {}): IndustrialComponentDefinition {
  const { standHeight = 0, nozzleSize = DEFAULT_SIZE, diameter = TANK_DIAMETER.default, height = TANK_HEIGHT.default, head = 'flat', capacityUnit = 'm³' } = shape;
  const r = outerRadiusFor(nozzleSize);
  const R = diameter / 2;
  const h = height / 2;
  const bottom = -h - 0.035;
  const floor = bottom - standHeight;
  const top = head === 'dished' ? h + R / 2 : h + 0.035;
  const leg = Math.max(1, R);
  const legAt = (deg: number): [number, number] => [round9(0.75 * R * Math.cos((deg * Math.PI) / 180)), round9(0.75 * R * Math.sin((deg * Math.PI) / 180))];
  const stand: GeometryPart[] = standHeight > 0
    ? [45, 135, 225, 315].flatMap((deg): GeometryPart[] => {
        const [x, z] = legAt(deg);
        return [
          { shape: 'cylinder', role: 'shell', center: [x, bottom - standHeight / 2, z], axis: 'y', radius: 0.05 * leg, length: standHeight },
          { shape: 'box', role: 'shell', center: [x, floor + 0.01, z], size: [0.16 * leg, 0.02, 0.16 * leg] },
        ];
      })
    : [];
  // Stands of 0.3 m and more are braced with an X on each side (ADR-0018).
  const braces = standHeight >= 0.3 ? crossBraces([45, 135, 225, 315].map(legAt), round9(bottom - 0.1 * standHeight), round9(floor + 0.1 * standHeight), round9(0.025 * leg)) : [];
  const walls: GeometryPart[] = [
    { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'y', radius: R, length: height, openEnded: true },
    { shape: 'cylinder', role: 'shell', center: [0, -h, 0], axis: 'y', radius: R, length: 0.07 },
    head === 'dished'
      ? { shape: 'lathe', role: 'shell', center: [0, 0, 0], points: ellipseHead(R, R / 2, h) }
      : { shape: 'cylinder', role: 'shell', center: [0, h, 0], axis: 'y', radius: R, length: 0.07 },
  ];
  // Liquid 6 cm inside the wall; a dished tank fills up into its head.
  const liquid: GeometryPart = head === 'dished'
    ? { shape: 'lathe', role: 'liquid', center: [0, 0, 0], points: [[round9(R - 0.06), round9(-h + 0.035)], ...ellipseHead(R - 0.06, R / 2 - 0.04, h)] }
    : { shape: 'cylinder', role: 'liquid', center: [0, 0, 0], axis: 'y', radius: round9(R - 0.06), length: round9(height - 0.07) };
  const [inletY, outletY] = [round9(h - Math.min(0.7, 0.25 * height)), round9(-h + Math.min(0.6, 0.2 * height))];
  const x = round9(R + 0.2);
  return define({
    type: 'tank',
    label: 'Vertical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [-x, inletY, 0], [-1, 0, 0], nozzleSize), fluidPort('outlet', [x, outletY, 0], [1, 0, 0], nozzleSize)],
    bounds: { min: [-x, standHeight > 0 ? floor : bottom, -R], max: [x, round9(top), round9(R + 0.145)] },
    parts: [
      ...walls,
      { shape: 'cylinder', role: 'shell', center: [-round9(R + 0.1), inletY, 0], axis: 'x', radius: r, length: 0.2 },
      { shape: 'cylinder', role: 'shell', center: [round9(R + 0.1), outletY, 0], axis: 'x', radius: r, length: 0.2 },
      liquid,
      ...levelGauge(0, round9(height - 0.24), round9((0.4 * height) / 3), round9(R + 0.08), formatCapacity(capacityOf(walls), capacityUnit)),
      ...stand,
      ...braces,
    ],
    parameters: { diameter: { ...TANK_DIAMETER }, height: { ...TANK_HEIGHT }, head: TANK_HEAD, standHeight: { ...TANK_STAND }, nozzleSize: nozzleParameter('Nozzle size'), capacityUnit: CAPACITY_UNIT },
  });
}

/**
 * Conical-bottom tank on three legs: 2 m cylindrical body (radius 1 m) over a 1 m cone. Inlet on
 * top; the outlet leaves the cone tip, bends and runs out horizontally to +X, 0.4 m above the
 * ground. The front (+Z) carries the shared sight gauge, scale and name plate (`levelGauge`).
 */
export function conicalTankDefinition(nozzleSize: PipeSize = DEFAULT_SIZE, capacityUnit: CapacityUnit = 'm³'): IndustrialComponentDefinition {
  const r = outerRadiusFor(nozzleSize);
  const legAt = (deg: number): [number, number, number] => [0.9 * Math.cos((deg * Math.PI) / 180), -1.5, 0.9 * Math.sin((deg * Math.PI) / 180)];
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const coneRadiusAt = (y: number) => r + (1 - r) * (y + 1.5);
  return define({
    type: 'conicalTank',
    label: 'Conical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [0, 1.7, 0], [0, 1, 0], nozzleSize), fluidPort('outlet', [1.1, -2.1, 0], [1, 0, 0], nozzleSize)],
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
      ...levelGauge(0.5, 1.86, 0.9, 1.08, formatCapacity(Math.PI * 2 + (Math.PI / 3) * (1 + r + r * r), capacityUnit)),
      // Liquid 4 cm inside the walls, from just above the cone tip to just below the cap.
      { shape: 'lathe', role: 'liquid', center: [0, 0, 0], points: [[round(coneRadiusAt(-1.46) - 0.04), -1.46], [0.96, -0.5], [0.96, 1.46]] },
    ],
    parameters: { nozzleSize: nozzleParameter('Nozzle size'), capacityUnit: CAPACITY_UNIT },
  });
}

/** End-suction centrifugal pump placeholder: suction on -X, discharge on top, each nozzle sized. */
export function pumpDefinition(suctionSize: PipeSize = DEFAULT_SIZE, dischargeSize: PipeSize = DEFAULT_SIZE): IndustrialComponentDefinition {
  const [rs, rd] = [outerRadiusFor(suctionSize), outerRadiusFor(dischargeSize)];
  return define({
    type: 'pump',
    label: 'Centrifugal Pump',
    ports: [fluidPort('suction', [-0.6, 0, 0], [-1, 0, 0], suctionSize), fluidPort('discharge', [0.3, 0.6, 0], [0, 1, 0], dischargeSize)],
    bounds: { min: [-0.6, -0.4, -0.175], max: [0.4, 0.6, 0.175] },
    parts: [
      { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'z', radius: 0.4, length: 0.35 },
      { shape: 'cylinder', role: 'shell', center: [-0.475, 0, 0], axis: 'x', radius: rs, length: 0.25 },
      { shape: 'cylinder', role: 'shell', center: [0.3, 0.4, 0], axis: 'y', radius: rd, length: 0.4 },
    ],
    parameters: { suctionSize: nozzleParameter('Suction size'), dischargeSize: nozzleParameter('Discharge size') },
  });
}

/** Horizontal tank: shell diameter and straight length, metres; legs below (ADR-0018). */
export const HORIZONTAL_DIAMETER = { label: 'Diameter', unit: 'm', default: 2, min: 0.6, max: 6, step: 0.1, keepsBottom: true } as const;
export const HORIZONTAL_LENGTH = { label: 'Shell length', unit: 'm', default: 3, min: 1, max: 20, step: 0.1, keepsBottom: true } as const;
export const HORIZONTAL_STAND = { label: 'Stand height', unit: 'm', default: 0.6, min: 0.3, max: 3, step: 0.1, keepsBottom: true } as const;

/**
 * Horizontal tank along X: a `length` straight shell, `diameter` across, with 2:1 dished ends
 * (depth D/4), on four cross-braced legs `standHeight` below it. Inlet on top a quarter along,
 * outlet out of the +X head below the axis. Origin on the axis, mid-length (ADR-0018).
 */
export function horizontalTankDefinition(diameter: number = HORIZONTAL_DIAMETER.default, length: number = HORIZONTAL_LENGTH.default, standHeight: number = HORIZONTAL_STAND.default, nozzleSize: PipeSize = DEFAULT_SIZE, capacityUnit: CapacityUnit = 'm³'): IndustrialComponentDefinition {
  const r = outerRadiusFor(nozzleSize);
  const R = diameter / 2;
  const h = length / 2;
  // Profile along x: crown of the −X head, rim, straight shell, rim, crown of the +X head.
  const profile = (rim: number, depth: number): [number, number][] => [
    ...Array.from({ length: 13 }, (_, k): [number, number] => { const t = (k / 12) * (Math.PI / 2); return [round9(rim * Math.sin(t)), round9(-h - depth * Math.cos(t))]; }),
    ...Array.from({ length: 13 }, (_, k): [number, number] => { const t = ((12 - k) / 12) * (Math.PI / 2); return [round9(rim * Math.sin(t)), round9(h + depth * Math.cos(t))]; }),
  ];
  const shell: GeometryPart = { shape: 'lathe', role: 'shell', center: [0, 0, 0], axis: 'x', points: profile(R, R / 2), holds: true };
  const floor = round9(-R - standHeight);
  const legX = round9(Math.min(0.35 * length, h));
  const legZ = round9(0.6 * R);
  const k = Math.max(1, R);
  const legTop = round9(-0.8 * R + 0.02);
  const legs: [number, number][] = [[-legX, legZ], [legX, legZ], [legX, -legZ], [-legX, -legZ]];
  const outletY = round9(-0.5 * R);
  const headAt = round9(h + (R / 2) * Math.sqrt(1 - 0.25) - 0.03);
  const outletX = round9(h + R / 2 + 0.2);
  const inletX = round9(-length / 4);
  return define({
    type: 'horizontalTank',
    label: 'Horizontal Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [inletX, round9(R + 0.2), 0], [0, 1, 0], nozzleSize), fluidPort('outlet', [outletX, outletY, 0], [1, 0, 0], nozzleSize)],
    bounds: { min: [round9(-h - R / 2), floor, -R], max: [outletX, round9(R + 0.2), round9(R + 0.145)] },
    parts: [
      shell,
      { shape: 'cylinder', role: 'shell', center: [inletX, round9(R + 0.075), 0], axis: 'y', radius: r, length: 0.25 },
      { shape: 'cylinder', role: 'shell', center: [round9((headAt + outletX) / 2), outletY, 0], axis: 'x', radius: r, length: round9(outletX - headAt) },
      { shape: 'lathe', role: 'liquid', center: [0, 0, 0], axis: 'x', points: profile(round9(R - 0.05), round9(R / 2 - 0.04)) },
      ...levelGauge(0, round9(2 * R - 0.4), round9(0.3 * R), round9(R + 0.08), formatCapacity(capacityOf([shell]), capacityUnit), round9(Math.max(0, h - 0.35))),
      ...legs.flatMap(([x, z]) => legWithFoot(x, z, legTop, floor, k)),
      // Braced along both long sides.
      ...crossBraces([legs[0], legs[1]], round9(-R), round9(floor + 0.05), round9(0.025 * k), false),
      ...crossBraces([legs[3], legs[2]], round9(-R), round9(floor + 0.05), round9(0.025 * k), false),
    ],
    parameters: { diameter: { ...HORIZONTAL_DIAMETER }, length: { ...HORIZONTAL_LENGTH }, standHeight: { ...HORIZONTAL_STAND }, nozzleSize: nozzleParameter('Nozzle size'), capacityUnit: CAPACITY_UNIT },
  });
}

/** Spherical tank: diameter, and how far its legs reach below the sphere, metres (ADR-0018). */
export const SPHERE_DIAMETER = { label: 'Diameter', unit: 'm', default: 2.4, min: 1, max: 10, step: 0.1, keepsBottom: true } as const;
export const SPHERE_STAND = { label: 'Stand height', unit: 'm', default: 0.5, min: 0.2, max: 3, step: 0.1, keepsBottom: true } as const;

/**
 * Spherical tank: a sphere `diameter` across on four legs that meet it at the equator and reach
 * `standHeight` below it. Inlet on top, outlet out to +X at 0.7 R below the equator.
 */
export function sphericalTankDefinition(diameter: number = SPHERE_DIAMETER.default, standHeight: number = SPHERE_STAND.default, nozzleSize: PipeSize = DEFAULT_SIZE, capacityUnit: CapacityUnit = 'm³'): IndustrialComponentDefinition {
  const r = outerRadiusFor(nozzleSize);
  const R = diameter / 2;
  const shell: GeometryPart = { shape: 'sphere', role: 'shell', center: [0, 0, 0], radius: R, holds: true };
  const floor = round9(-R - standHeight);
  const outletY = round9(-0.7 * R);
  const surface = round9(R * Math.sqrt(1 - 0.49) - 0.03);
  const outletX = round9(R + 0.2);
  const legAt = (deg: number): [number, number] => [round9((R + 0.06) * Math.cos((deg * Math.PI) / 180)), round9((R + 0.06) * Math.sin((deg * Math.PI) / 180))];
  return define({
    type: 'sphericalTank',
    label: 'Spherical Tank',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [0, round9(R + 0.2), 0], [0, 1, 0], nozzleSize), fluidPort('outlet', [outletX, outletY, 0], [1, 0, 0], nozzleSize)],
    bounds: { min: [-R, floor, -R], max: [outletX, round9(R + 0.2), round9(R + 0.145)] },
    parts: [
      shell,
      { shape: 'cylinder', role: 'shell', center: [0, round9(R + 0.075), 0], axis: 'y', radius: r, length: 0.25 },
      { shape: 'cylinder', role: 'shell', center: [round9((surface + outletX) / 2), outletY, 0], axis: 'x', radius: r, length: round9(outletX - surface) },
      { shape: 'sphere', role: 'liquid', center: [0, 0, 0], radius: round9(R - 0.04) },
      ...levelGauge(0, round9(1.6 * R), round9(0.25 * R), round9(R + 0.08), formatCapacity(capacityOf([shell]), capacityUnit)),
      ...[45, 135, 225, 315].flatMap((deg) => {
        const [x, z] = legAt(deg);
        return [
          { shape: 'cylinder' as const, role: 'shell' as const, center: [x, round9(floor / 2), z] as Vector3Tuple, axis: 'y' as const, radius: 0.06, length: round9(-floor) },
          { shape: 'box' as const, role: 'shell' as const, center: [x, round9(floor + 0.01), z] as Vector3Tuple, size: [0.18, 0.02, 0.18] as Vector3Tuple },
        ];
      }),
    ],
    parameters: { diameter: { ...SPHERE_DIAMETER }, standHeight: { ...SPHERE_STAND }, nozzleSize: nozzleParameter('Nozzle size'), capacityUnit: CAPACITY_UNIT },
  });
}

/** Pool (open basin) outside length and width and depth, metres; walls and floor 0.15 m (ADR-0018). */
export const POOL_LENGTH = { label: 'Length', unit: 'm', default: 6, min: 2, max: 50, step: 0.1, keepsBottom: true } as const;
export const POOL_WIDTH = { label: 'Width', unit: 'm', default: 3, min: 1, max: 30, step: 0.1, keepsBottom: true } as const;
export const POOL_DEPTH = { label: 'Depth', unit: 'm', default: 1.2, min: 0.5, max: 5, step: 0.1, keepsBottom: true } as const;

/**
 * Open rectangular basin standing on its floor (origin at ground level, centre): 0.15 m walls
 * and floor, the inside holding the liquid. Inlet through the −X wall 0.25 m below the rim,
 * outlet through the +X wall 0.3 m above the floor; the capacity plate is on the front wall.
 */
export function poolDefinition(length: number = POOL_LENGTH.default, width: number = POOL_WIDTH.default, depth: number = POOL_DEPTH.default, nozzleSize: PipeSize = DEFAULT_SIZE, capacityUnit: CapacityUnit = 'm³'): IndustrialComponentDefinition {
  const r = outerRadiusFor(nozzleSize);
  const t = 0.15;
  const [x, z] = [length / 2, width / 2];
  const inside: GeometryPart = { shape: 'box', role: 'liquid', center: [0, round9(t + (depth - t) / 2), 0], size: [round9(length - 2 * t), round9(depth - t), round9(width - 2 * t)], holds: true };
  const [inletY, outletY] = [round9(depth - 0.25), round9(t + 0.3)];
  const portX = round9(x + 0.2);
  return define({
    type: 'pool',
    label: 'Pool',
    bindable: { level: 'percent', temperature: 'temperature' },
    ports: [fluidPort('inlet', [-portX, inletY, 0], [-1, 0, 0], nozzleSize), fluidPort('outlet', [portX, outletY, 0], [1, 0, 0], nozzleSize)],
    bounds: { min: [-portX, 0, -z], max: [portX, depth, round9(z + 0.01)] },
    parts: [
      { shape: 'box', role: 'shell', center: [0, t / 2, 0], size: [length, t, width] },
      { shape: 'box', role: 'shell', center: [round9(-x + t / 2), round9(depth / 2), 0], size: [t, depth, width] },
      { shape: 'box', role: 'shell', center: [round9(x - t / 2), round9(depth / 2), 0], size: [t, depth, width] },
      { shape: 'box', role: 'shell', center: [0, round9(depth / 2), round9(-z + t / 2)], size: [round9(length - 2 * t), depth, t] },
      { shape: 'box', role: 'shell', center: [0, round9(depth / 2), round9(z - t / 2)], size: [round9(length - 2 * t), depth, t] },
      { shape: 'cylinder', role: 'shell', center: [round9(-x - 0.025), inletY, 0], axis: 'x', radius: r, length: 0.35 },
      { shape: 'cylinder', role: 'shell', center: [round9(x + 0.025), outletY, 0], axis: 'x', radius: r, length: 0.35 },
      inside,
      { shape: 'box', role: 'plate', center: [0, round9(0.6 * depth), round9(z + 0.005)], size: [0.5, 0.16, 0.01], text: formatCapacity(capacityOf([inside]), capacityUnit) },
    ],
    parameters: { length: { ...POOL_LENGTH }, width: { ...POOL_WIDTH }, depth: { ...POOL_DEPTH }, nozzleSize: nozzleParameter('Nozzle size'), capacityUnit: CAPACITY_UNIT },
  });
}

export const componentCatalog: Record<ComponentKind, IndustrialComponentDefinition> = {
  // Vertical tank: radius 1 m, shell height 3 m, side nozzles 0.2 m long.
  tank: tankDefinition(),
  conicalTank: conicalTankDefinition(),
  horizontalTank: horizontalTankDefinition(),
  sphericalTank: sphericalTankDefinition(),
  pool: poolDefinition(),
  pipe: pipeDefinition(PIPE_LENGTH.default),
  elbow: elbowDefinition(),
  tee: teeDefinition(),
  valve: valveDefinition(),
  reducer: reducerDefinition(),
  coupler: couplerDefinition(),
  pump: pumpDefinition(),
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
