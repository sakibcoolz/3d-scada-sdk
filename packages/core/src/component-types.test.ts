import { describe, expect, it } from 'vitest';
import { isBuiltInKind, isNamespacedType, validateScene, type ComponentType, type ConnectionPort, type SceneValidationOptions } from './index.js';

// Component types (ADR-0022): built-in kinds always; namespaced host types only when the host
// says it knows them; bare unknown names never.

const fluid = (id: string, x: number, dx: number): ConnectionPort => ({ id, kind: 'fluid', position: [x, 0, 0], direction: [dx, 0, 0], nominalSize: 0.15 });
const ports: Record<string, ConnectionPort[]> = { valve: [fluid('in', -0.1, -1), fluid('out', 0.1, 1)], 'com.example.press': [fluid('in', -0.5, -1), fluid('out', 0.5, 1)] };
const resolvePorts = (t: ComponentType) => ports[t];
const known = new Set(['com.example.press']);
const withRegistry: SceneValidationOptions = { resolvePorts, resolveType: (t) => isBuiltInKind(t) || known.has(t) };
const part = (id: string, type: string, x: number) => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const doc = (components: unknown[], connections: unknown[] = []) => ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components, connections });
const codes = (input: unknown, options: SceneValidationOptions) => {
  const r = validateScene(input, options);
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};

describe('type names', () => {
  it.each(['com.example.press', 'vendor.vfd', 'org.plant-7.line-2.pump', 'A1.b2'])('%s is namespaced', (t) => expect(isNamespacedType(t)).toBe(true));
  it.each(['press', '', '.press', 'com.', 'com..press', 'com.-press', 'com.press-', 'com.pr ess', 'x'.repeat(126) + '.yz', 7])('%p is not', (t) => expect(isNamespacedType(t)).toBe(false));
  it('knows the built-ins', () => {
    expect(isBuiltInKind('valve')).toBe(true);
    expect(isBuiltInKind('com.example.press')).toBe(false);
  });
});

describe('validateScene with host types', () => {
  it('accepts only built-ins without a resolveType option, as before', () => {
    expect(codes(doc([part('v', 'valve', 0)]), { resolvePorts })).toEqual([]);
    expect(codes(doc([part('p', 'com.example.press', 0)]), { resolvePorts })).toEqual([['UNKNOWN_COMPONENT_KIND', 'components[0].type']]);
  });

  it('accepts a registered namespaced type and connects it through its ports', () => {
    const scene = doc([part('p', 'com.example.press', 0), part('v', 'valve', 0.6)], [{ id: 'c', from: { instanceId: 'p', portId: 'out' }, to: { instanceId: 'v', portId: 'in' } }]);
    expect(codes(scene, withRegistry)).toEqual([]);
    const wrongPort = doc([part('p', 'com.example.press', 0), part('v', 'valve', 0.6)], [{ id: 'c', from: { instanceId: 'p', portId: 'drain' }, to: { instanceId: 'v', portId: 'in' } }]);
    expect(codes(wrongPort, withRegistry)).toEqual([['UNKNOWN_PORT', 'connections[0].from.portId']]);
  });

  it('rejects an unregistered namespaced type, and a bare name even when the host claims it', () => {
    expect(codes(doc([part('x', 'com.example.robot', 0)]), withRegistry)).toEqual([['UNKNOWN_COMPONENT_KIND', 'components[0].type']]);
    const claimsAll: SceneValidationOptions = { resolvePorts, resolveType: () => true };
    const r = validateScene(doc([part('r', 'robot', 0)]), claimsAll);
    expect(r.ok ? [] : r.errors.map((e) => e.message)).toEqual(['Unknown component type "robot"; custom types are namespaced, such as "com.example.part".']);
  });

  it('applies the same rules to version 1 `kind` fields', () => {
    const v1 = { version: 1, components: [{ id: 'p', kind: 'com.example.press', position: [0, 0, 0], rotation: [0, 0, 0], properties: {} }], connections: [] };
    expect(codes(v1, withRegistry)).toEqual([]);
    expect(codes(v1, { resolvePorts })).toEqual([['UNKNOWN_COMPONENT_KIND', 'components[0].kind']]);
  });
});
