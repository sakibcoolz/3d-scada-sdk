import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ScadaScene, SceneConnection } from '@scada3d/core';
import { describeAttach, describeLock, describeNewConnections, describeOpenJoint, describeOpenJoints, describeSeat, formatDistance } from './connectionNotice.js';

const part = (id: string, type: ComponentInstance['type'], parentId?: string): ComponentInstance => ({
  id,
  type,
  ...(parentId ? { parentId } : {}),
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  properties: {},
});
const joint = (id: string, a: string, ap: string, b: string, bp: string): SceneConnection => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });
const scene = (components: ComponentInstance[], connections: SceneConnection[] = []): ScadaScene => ({ schemaVersion: 3, units: 'm', components, connections });

describe('describeNewConnections', () => {
  it('says nothing when no connection was added', () => {
    const s = scene([part('t', 'tank'), part('v', 'valve')], [joint('c', 't', 'outlet', 'v', 'in')]);
    expect(describeNewConnections(s, s)).toEqual([]);
  });

  it('names both components and ports of a new connection', () => {
    const before = scene([part('t', 'tank'), part('v', 'valve')]);
    const after = { ...before, connections: [joint('c', 't', 'outlet', 'v', 'in')] };
    expect(describeNewConnections(before, after)).toEqual(['Vertical Tank 1 "outlet" connected to Ball Valve 1 "in".']);
  });

  it('says when a loose component connects to an assembly it is not locked to', () => {
    const before = scene([part('t', 'tank'), part('v', 'valve', 't'), part('p', 'pipe')], [joint('a', 't', 'outlet', 'v', 'in')]);
    const after = { ...before, connections: [...before.connections, joint('b', 'v', 'out', 'p', 'in')] };
    expect(describeNewConnections(before, after)).toEqual([
      'Ball Valve 1 "out" connected to Straight Pipe 1 "in". Straight Pipe 1 is not locked to the Vertical Tank 1 assembly yet; use "Lock connected as children" on Vertical Tank 1 to move them together.',
    ]);
  });

  it('says when two separate assemblies are joined', () => {
    const before = scene([part('t', 'tank'), part('v', 'valve', 't'), part('e', 'tee'), part('w', 'valve', 'e')]);
    const after = { ...before, connections: [joint('j', 'v', 'out', 'e', 'left')] };
    expect(describeNewConnections(before, after)).toEqual([
      'Ball Valve 1 "out" connected to T-Junction 1 "left". This joins the Vertical Tank 1 and T-Junction 1 assemblies; they still move separately until locked into one.',
    ]);
  });

  it('adds nothing extra when both sides already belong to the same assembly', () => {
    const before = scene([part('t', 'tank'), part('v', 'valve', 't'), part('w', 'valve', 't')]);
    const after = { ...before, connections: [joint('j', 'v', 'out', 'w', 'in')] };
    expect(describeNewConnections(before, after)).toEqual(['Ball Valve 1 "out" connected to Ball Valve 2 "in".']);
  });

  it('lists at most five connections, then a count of the rest', () => {
    const parts = Array.from({ length: 8 }, (_, i) => part(`p${i}`, 'pipe'));
    const before = scene(parts);
    const after = { ...before, connections: parts.slice(0, 7).map((p, i) => joint(`c${i}`, p.id, 'out', `p${i + 1}`, 'in')) };
    const lines = describeNewConnections(before, after);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('…and 2 more connections.');
  });
});

describe('describeLock', () => {
  it('names the parent and how many children now move with it', () => {
    const after = scene([part('t', 'tank'), part('v', 'valve', 't'), part('p', 'pipe', 't')]);
    expect(describeLock(after, 't')).toBe('Vertical Tank 1 is now the parent of 2 components; moving any of them moves the whole assembly.');
  });

  it('uses the singular for one child', () => {
    const after = scene([part('t', 'tank'), part('v', 'valve', 't')]);
    expect(describeLock(after, 't')).toBe('Vertical Tank 1 is now the parent of 1 component; moving any of them moves the whole assembly.');
  });
});

describe('open joint wording', () => {
  const names = new Map([['a', 'Straight Pipe 1'], ['b', 'Ball Valve 1']]);
  const open = (distance: number, angle: number, problem: 'unroutable' | 'too-short' = 'unroutable') => ({
    connectionId: 'j', from: { instanceId: 'a', portId: 'out' }, to: { instanceId: 'b', portId: 'in' }, distance, angle, problem,
  });

  it('gives millimetres below a metre and metres above', () => {
    expect(formatDistance(0.015)).toBe('15 mm');
    expect(formatDistance(0.0004)).toBe('0 mm');
    expect(formatDistance(2)).toBe('2.00 m');
  });

  it('says why each joint is open', () => {
    expect(describeOpenJoint(open(0.015, 0), names)).toBe('Straight Pipe 1 "out" → Ball Valve 1 "in": 15 mm apart, no pipe can be drawn');
    expect(describeOpenJoint(open(0.05, 0, 'too-short'), names)).toBe('Straight Pipe 1 "out" → Ball Valve 1 "in": 50 mm apart, too short for a pipe');
    expect(describeOpenJoint(open(2, Math.PI), names)).toBe('Straight Pipe 1 "out" → Ball Valve 1 "in": ports face the wrong way (2.00 m apart)');
    expect(describeOpenJoint(open(0.3, Math.PI / 2), names)).toBe('Straight Pipe 1 "out" → Ball Valve 1 "in": ports do not face each other (300 mm apart)');
  });

  it('lists at most five, then a count', () => {
    const lines = describeOpenJoints(Array.from({ length: 7 }, () => open(0.015, 0)), names);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('…and 2 more');
  });

  it('describes a seat from the moved part', () => {
    const s = scene([part('t', 'tee'), part('v', 'valve')], [joint('c', 't', 'branch', 'v', 'in')]);
    expect(describeSeat(s, 'c', 'v', 0.015)).toBe('Seated Ball Valve 1 "in" on T-Junction 1 "branch" (moved 15 mm).');
  });
});

describe('describeAttach', () => {
  it('names the moved part first, then the part it was attached to', () => {
    const s = scene([part('t', 'tank'), part('v', 'valve')], [joint('c', 'v', 'in', 't', 'outlet')]);
    expect(describeAttach(s, s.connections[0], 2.345)).toBe('Attached Ball Valve 1 "in" to Vertical Tank 1 "outlet" (moved 2.35 m).');
  });
});
