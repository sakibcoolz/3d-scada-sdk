import { describe, expect, it } from 'vitest';
import { componentKinds, connect, findCollisions, parseScene, routeScene, serializeScene, validateScene, type ComponentInstance, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, catalogResolvers, componentCatalog, createComponentRegistry, unknownTypeDefinition, type ComponentTypeDefinition } from './index.js';
import { pipeSizes } from './sizes.js';

// Open component registry (ADR-0022): host types next to the built-in kinds, with no SDK change.

const DN150 = pipeSizes.DN150.bore;
/** A press with a fluid inlet and outlet; its width is a parameter that moves the outlet. */
const press = (): ComponentTypeDefinition => ({
  type: 'com.example.press',
  version: '1',
  category: 'machine',
  label: 'Example Press',
  ports: [
    { id: 'in', kind: 'fluid', position: [-0.6, 0.5, 0], direction: [-1, 0, 0], nominalSize: DN150 },
    { id: 'out', kind: 'fluid', position: [0.6, 0.5, 0], direction: [1, 0, 0], nominalSize: DN150 },
  ],
  bounds: { min: [-0.6, 0, -0.4], max: [0.6, 1.2, 0.4] },
  parts: [{ shape: 'box', role: 'shell', center: [0, 0.6, 0], size: [1.2, 1.2, 0.8] }],
  parameters: { width: { label: 'Width', unit: 'm', default: 1.2, min: 0.8, max: 3, step: 0.1 } },
  bindable: { running: 'boolean' },
  build: ({ width }) => {
    const half = (width as number) / 2;
    return {
      ports: [
        { id: 'in', kind: 'fluid', position: [-half, 0.5, 0], direction: [-1, 0, 0], nominalSize: DN150 },
        { id: 'out', kind: 'fluid', position: [half, 0.5, 0], direction: [1, 0, 0], nominalSize: DN150 },
      ],
      bounds: { min: [-half, 0, -0.4], max: [half, 1.2, 0.4] },
      parts: [{ shape: 'box', role: 'shell', center: [0, 0.6, 0], size: [width as number, 1.2, 0.8] }],
    };
  },
});
const I = { x: 0, y: 0, z: 0, w: 1 };
const S = { x: 1, y: 1, z: 1 };
const at = (id: string, type: string, x: number, y: number, properties: ComponentInstance['properties'] = {}): ComponentInstance =>
  ({ id, type, position: { x, y, z: 0 }, rotation: I, scale: S, properties });
const scene = (components: ComponentInstance[], connections: ScadaScene['connections'] = []): ScadaScene =>
  ({ schemaVersion: 4, documentType: 'industrial.scene', units: 'm', components, connections });

describe('builtInRegistry', () => {
  it('resolves exactly like catalogResolvers for every built-in kind, and knows nothing else', () => {
    for (const kind of componentKinds) {
      expect(builtInRegistry.resolvers.resolvePorts(kind, {})).toEqual(catalogResolvers.resolvePorts(kind, {}));
      expect(builtInRegistry.resolvers.resolveBounds(kind, {})).toEqual(catalogResolvers.resolveBounds(kind, {}));
      expect(builtInRegistry.resolvers.resolveBindable(kind)).toEqual(catalogResolvers.resolveBindable(kind));
      expect(builtInRegistry.get(kind)).toBe(componentCatalog[kind]);
    }
    expect(builtInRegistry.list().map((d) => d.type)).toEqual(Object.keys(componentCatalog));
    expect(builtInRegistry.has('com.example.press')).toBe(false);
    expect(catalogResolvers.resolveType('com.example.press')).toBe(false);
    expect(catalogResolvers.resolvePorts('com.example.press', {})).toBeUndefined();
  });
});

describe('createComponentRegistry', () => {
  const registry = createComponentRegistry(press());

  it('adds the host type after the built-ins, with its base and parametric definitions', () => {
    expect(registry.has('com.example.press')).toBe(true);
    expect(registry.list().map((d) => d.type).slice(-1)).toEqual(['com.example.press']);
    expect(registry.list()).toHaveLength(componentKinds.length + 1);
    const base = registry.definitionFor('com.example.press');
    expect(base.label).toBe('Example Press');
    expect(base.defaultSize).toEqual([1.2, 1.2, 0.8]);
    const wide = registry.definitionFor('com.example.press', { width: 2 });
    expect(wide.ports.find((p) => p.id === 'out')?.position).toEqual([1, 0.5, 0]);
    expect(registry.definitionFor('com.example.press', { width: 2 })).toBe(wide);
    // Invalid values fall back to the base shape; validation reports them.
    expect(registry.definitionFor('com.example.press', { width: 9 })).toBe(base);
    expect(registry.validateProperties('com.example.press', { width: 9 })).toEqual([{ property: 'width', message: 'must be between 0.8 and 3 m' }]);
    expect(registry.resolvers.resolveBindable('com.example.press')).toEqual({ running: 'boolean' });
  });

  it('keeps the built-ins unchanged and resolves size parameters for both', () => {
    expect(registry.resolvers.resolvePorts('valve', { size: 'DN80' })).toEqual(catalogResolvers.resolvePorts('valve', { size: 'DN80' }));
    expect(registry.sizeParameterFor('reducer', 'out')).toBe('outletSize');
    expect(registry.sizeParameterFor('com.example.press', 'in')).toBeUndefined();
  });

  it('draws unknown types as a labelled port-less placeholder, while core still rejects them', () => {
    const placeholder = registry.definitionFor('com.other.thing');
    expect(placeholder).toBe(unknownTypeDefinition('com.other.thing'));
    expect(placeholder.ports).toEqual([]);
    expect(placeholder.label).toBe('com.other.thing');
    expect(registry.resolvers.resolvePorts('com.other.thing', {})).toBeUndefined();
    expect(registry.resolvers.resolveType('com.other.thing')).toBe(false);
  });

  it('copies definitions, so later changes to the input do not leak in', () => {
    const input = press();
    const own = createComponentRegistry(input);
    input.label = 'Changed';
    expect(own.definitionFor('com.example.press').label).toBe('Example Press');
  });

  it('refuses bad definitions and lists every problem', () => {
    const bad = (patch: Partial<ComponentTypeDefinition>) => () => createComponentRegistry({ ...press(), ...patch });
    expect(bad({ type: 'press' })).toThrow('"press" must be namespaced, such as "com.example.part"');
    expect(bad({ type: 'valve' })).toThrow('"valve" is a built-in kind');
    expect(() => createComponentRegistry(press(), press())).toThrow('"com.example.press" is registered twice');
    expect(bad({ ports: [{ id: 'in', kind: 'fluid', position: [0, 0, 0], direction: [1, 1, 0] }] })).toThrow('port "in" needs a unit direction');
    expect(bad({ ports: [{ id: 'a', kind: 'fluid', position: [0, 0, 0], direction: [1, 0, 0] }, { id: 'a', kind: 'fluid', position: [0, 0, 0], direction: [-1, 0, 0] }] })).toThrow('has two ports "a"');
    expect(bad({ bounds: { min: [1, 0, 0], max: [0, 1, 1] } })).toThrow('needs finite bounds with min ≤ max');
    expect(bad({ parameters: { width: { label: 'Width', unit: 'm', default: 9, min: 0.8, max: 3, step: 0.1 } } })).toThrow('parameter "width" has a default outside its range or choices');
    expect(bad({ label: '' })).toThrow('needs a label');
  });

  it('registers power, signal and network ports with their details (ADR-0023)', () => {
    const vfd = createComponentRegistry({
      ...press(),
      type: 'com.example.vfd',
      build: undefined,
      ports: [
        { id: 'L1-L3', kind: 'power', position: [0, 1, -0.4], direction: [0, 0, -1], flow: 'in', terminal: 'X1:1-3', power: { kind: 'AC', voltage: 400, phases: 3 } },
        { id: 'run', kind: 'signal', position: [0.1, 1, -0.4], direction: [0, 0, -1], name: 'Run command', signal: { type: 'DI' } },
        { id: 'speed', kind: 'signal', position: [0.2, 1, -0.4], direction: [0, 0, -1], signal: { type: 'AI', range: [4, 20], unit: 'mA' } },
        { id: 'eth', kind: 'network', position: [0.3, 1, -0.4], direction: [0, 0, -1], network: { medium: 'ethernet', protocols: ['modbus-tcp'] }, maxConnections: 2 },
        { id: 'PE', kind: 'power', position: [0.4, 1, -0.4], direction: [0, 0, -1], power: { kind: 'PE' }, maxConnections: 4 },
      ],
    });
    expect(vfd.resolvers.resolvePorts('com.example.vfd', {})?.map((p) => p.id)).toEqual(['L1-L3', 'run', 'speed', 'eth', 'PE']);
  });

  it('registers variable templates and resolves them for suggestVariables (ADR-0024)', () => {
    const input = { ...press(), variables: [{ name: 'RUNNING', dataType: 'bool' as const, property: 'running' }, { name: 'CYCLES', dataType: 'uint32' as const }] };
    const own = createComponentRegistry(input);
    expect(own.resolvers.resolveVariables('com.example.press')).toEqual(input.variables);
    expect(own.resolvers.resolveVariables('com.other.thing')).toBeUndefined();
    expect(catalogResolvers.resolveVariables('tank')).toBeUndefined();
    input.variables[0].name = 'CHANGED';
    expect(own.resolvers.resolveVariables('com.example.press')?.[0].name).toBe('RUNNING');
  });

  it('refuses bad variable templates', () => {
    const withVariables = (variables: unknown) => () => createComponentRegistry({ ...press(), variables } as ComponentTypeDefinition);
    expect(withVariables({})).toThrow('needs variables as an array');
    expect(withVariables([{ name: 'a b', dataType: 'bool' }])).toThrow('variable "a b" needs a name of letters, digits');
    expect(withVariables([{ name: 'A', dataType: 'bool' }, { name: 'A', dataType: 'bool' }])).toThrow('has two variables "A"');
    expect(withVariables([{ name: 'A', dataType: 'double' }])).toThrow('variable "A" has an unknown data type');
    expect(withVariables([{ name: 'A', dataType: 'bool', unit: 'x'.repeat(33) }])).toThrow('needs a unit of at most 32 characters');
    expect(withVariables([{ name: 'A', dataType: 'bool', property: 'speed' }])).toThrow('variable "A" drives "speed", which is not bindable');
  });

  it('refuses port details that do not fit the port', () => {
    const withPort = (extra: object) => () => createComponentRegistry({ ...press(), build: undefined, ports: [{ id: 'p', kind: 'signal', position: [0, 0, 0], direction: [1, 0, 0], ...extra } as ComponentTypeDefinition['ports'][number]] });
    expect(withPort({ kind: 'logical' })).toThrow('port "p" has an unknown kind');
    expect(withPort({ power: { kind: 'AC' } })).toThrow('port "p" has power details but is a signal port');
    expect(withPort({ signal: { type: 'XX' } })).toThrow('port "p" has an unknown signal type');
    expect(withPort({ signal: { type: 'AI', range: [20, 4] } })).toThrow('port "p" needs a signal range with min < max');
    expect(withPort({ kind: 'power', power: { kind: 'AC', voltage: -1, phases: 2 } })).toThrow('port "p" needs a positive voltage; "com.example.press" port "p" needs 1 or 3 phases');
    expect(withPort({ kind: 'network', network: { medium: '' } })).toThrow('port "p" needs a network medium');
    expect(withPort({ flow: 'sideways' })).toThrow('port "p" has an unknown flow');
    expect(withPort({ maxConnections: 0 })).toThrow('needs maxConnections as a whole number of at least 1');
    expect(withPort({ kind: 'fluid', maxConnections: 2 })).toThrow('port "p" is a fluid port, which takes exactly one connection');
  });
});

describe('a host type in a scene, through core', () => {
  const registry = createComponentRegistry(press());
  const plant = scene([at('P-1', 'com.example.press', 0, 0), at('pipe', 'pipe', 1.6, 0.5, { length: 2 })]);

  it('validates only with a registry that knows it, and round-trips byte-stable', () => {
    expect(validateScene(plant, catalogResolvers)).toEqual({ ok: false, errors: [expect.objectContaining({ code: 'UNKNOWN_COMPONENT_KIND', path: 'components[0].type' })] });
    const result = validateScene(plant, registry.resolvers);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = serializeScene(result.scene);
    expect(parseScene(text, registry.resolvers)).toEqual({ ok: true, scene: result.scene });
  });

  it('connects to a built-in pipe, routes and collides like any part', () => {
    const joined = connect(plant, { id: 'c1', from: { instanceId: 'P-1', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } }, registry.resolvers);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const routes = routeScene(joined.scene, registry.resolvers);
    expect(routes).toHaveLength(1);
    expect(routes[0].status).toBe('ok');
    const overlapping = scene([at('P-1', 'com.example.press', 0, 0), at('P-2', 'com.example.press', 0.5, 0)]);
    expect(findCollisions(overlapping, registry.resolvers).pairs).toEqual([{ a: 'P-1', b: 'P-2' }]);
  });

  it('refuses a fluid connection of the wrong size, as for built-ins', () => {
    const small = scene([at('P-1', 'com.example.press', 0, 0), at('pipe', 'pipe', 1.6, 0.5, { length: 2, size: 'DN80' })]);
    const joined = connect(small, { id: 'c1', from: { instanceId: 'P-1', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } }, registry.resolvers);
    expect(joined.ok ? undefined : joined.error.code).toBe('INCOMPATIBLE_PORTS');
  });
});
