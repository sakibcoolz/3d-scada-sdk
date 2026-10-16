import { describe, expect, it } from 'vitest';
import { asme, definitionFor, outerRadiusFor, pipeSizes } from './index.js';

// Values as published in common ASME B36.10M / B16.9 tables (to be verified against the standard).
describe('ASME dimension table', () => {
  it('covers every catalog size with its NPS', () => {
    expect(Object.keys(asme)).toEqual(Object.keys(pipeSizes));
    expect(Object.values(asme).map((d) => d.nps)).toEqual(['2', '3', '4', '6', '8']);
  });

  it.each([
    ['DN50', 60.3, 3.91, 76, 64, 76],
    ['DN80', 88.9, 5.49, 114, 86, 89],
    ['DN100', 114.3, 6.02, 152, 105, 102],
    ['DN150', 168.3, 7.11, 229, 143, 140],
    ['DN200', 219.1, 8.18, 305, 178, 152],
  ] as const)('%s: OD %p mm, Sch 40 wall %p mm, LR elbow %p mm, tee %p mm, reducer %p mm', (size, od, wall, elbow, tee, reducer) => {
    const d = asme[size];
    const got = [d.outsideDiameter, d.wallSch40, d.elbowLR90, d.teeCenterToEnd, d.reducerLength];
    [od, wall, elbow, tee, reducer].forEach((mm, i) => expect(got[i]).toBeCloseTo(mm / 1000, 12));
  });

  it('draws pipe at the ASME outside diameter, DN150 included', () => {
    for (const size of Object.keys(asme) as (keyof typeof asme)[]) expect(outerRadiusFor(size)).toBeCloseTo(asme[size].outsideDiameter / 2, 12);
  });

  it('makes long-radius elbows 1.5 × NPS (within table rounding)', () => {
    for (const d of Object.values(asme)) expect(d.elbowLR90 / (Number(d.nps) * 0.0254)).toBeCloseTo(1.5, 1);
  });
});

describe('fittings built to ASME B16.9', () => {
  const sizes = Object.keys(asme) as (keyof typeof asme)[];

  it.each(sizes)('%s long-radius elbow: ports at the centre-to-end distance, bend radius the same', (size) => {
    const a = asme[size].elbowLR90;
    const d = definitionFor('elbow', size === 'DN150' ? {} : { size });
    expect(d.ports.map((p) => [p.id, p.position, p.direction])).toEqual([
      ['in', [-a, 0, 0], [-1, 0, 0]],
      ['out', [0, a, 0], [0, 1, 0]],
    ]);
    const bend = d.parts.find((p) => p.shape === 'bend')!;
    expect(bend.shape === 'bend' && bend.bendRadius).toBe(a);
  });

  it.each(sizes)('%s equal tee: run and branch ends at the centre-to-end distance', (size) => {
    const c = asme[size].teeCenterToEnd;
    const d = definitionFor('tee', size === 'DN150' ? {} : { size });
    expect(d.ports.map((p) => [p.id, p.position])).toEqual([
      ['left', [-c, 0, 0]],
      ['right', [c, 0, 0]],
      ['branch', [0, c, 0]],
    ]);
  });

  it.each([
    ['DN150', 'DN100', 0.14],
    ['DN100', 'DN150', 0.14],
    ['DN200', 'DN50', 0.152],
    ['DN80', 'DN50', 0.089],
  ] as const)('%s × %s concentric reducer is %p m end to end (by the larger end)', (size, outletSize, h) => {
    const d = definitionFor('reducer', { size, outletSize });
    expect(d.ports.map((p) => p.position[0])).toEqual([-h / 2, h / 2]);
  });
});
