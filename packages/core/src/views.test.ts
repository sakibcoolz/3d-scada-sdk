import { describe, expect, it } from 'vitest';
import { disconnect, parseScene, removeAssociation, removeComponent, serializeScene, validateScene, type ScadaScene, type SceneValidationOptions } from './index.js';

// 2D view layouts in the document (ADR-0026, T-083): layout only, keyed by component and edge ids,
// validated, canonical, and cleaned up when what they place is removed.

const options: SceneValidationOptions = {
  resolvePorts: (t) =>
    t === 'tank' ? [{ id: 'outlet', kind: 'fluid', position: [1, 0, 0], direction: [1, 0, 0] }]
    : t === 'valve' ? [{ id: 'in', kind: 'fluid', position: [-0.5, 0, 0], direction: [-1, 0, 0] }, { id: 'out', kind: 'fluid', position: [0.5, 0, 0], direction: [1, 0, 0] }]
    : undefined,
};
const part = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const doc = (views: unknown) => ({
  schemaVersion: 4,
  documentType: 'industrial.scene',
  units: 'm',
  components: [part('T1', 'tank'), part('V1', 'valve')],
  connections: [{ id: 'c1', from: { instanceId: 'T1', portId: 'outlet' }, to: { instanceId: 'V1', portId: 'in' } }],
  associations: [{ id: 'a1', relationship: 'controls', from: 'V1', to: 'T1' }],
  views,
});
const errors = (views: unknown, limits?: SceneValidationOptions['limits']) => {
  const r = validateScene(doc(views), { ...options, limits });
  return r.ok ? [] : r.errors.map((e) => [e.code, e.path]);
};
const valid = (views: unknown): ScadaScene => {
  const r = validateScene(doc(views), options);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.scene;
};
const layouts = {
  process: { symbols: { V1: { x: 160, y: 120, rotation: 90 }, T1: { x: 40, y: 120 } }, routes: { c1: { points: [[60, 120], [150, 120]] } } },
  electrical: { symbols: { V1: { x: 0, y: 0, hidden: true } }, routes: { a1: { points: [[0, 0], [10, 0]] } } },
};

describe('views in the scene document', () => {
  it('accepts symbol placements and routes for connections and associations, and writes them canonically', () => {
    const scene = valid({ electrical: layouts.electrical, process: layouts.process });
    expect(scene.views).toEqual(layouts);
    const text = serializeScene(scene);
    // Fixed view order, sorted ids, fixed field order.
    expect(text.indexOf('"process"')).toBeLessThan(text.indexOf('"electrical"'));
    expect(text.indexOf('"T1": {')).toBeLessThan(text.indexOf('"V1": {'));
    expect(JSON.parse(text).views.process.symbols.V1).toEqual({ x: 160, y: 120, rotation: 90 });
    const again = parseScene(text, options);
    expect(again.ok && serializeScene(again.scene)).toBe(text);
  });

  it('leaves files without views unchanged', () => {
    const r = validateScene({ ...doc(undefined), views: undefined }, options);
    expect(r.ok && 'views' in r.scene).toBe(false);
  });

  it('refuses references to components and edges that do not exist', () => {
    expect(errors({ process: { symbols: { P9: { x: 0, y: 0 } }, routes: { c9: { points: [[0, 0], [1, 1]] } } } })).toEqual([
      ['UNKNOWN_VIEW_REFERENCE', 'views.process.symbols.P9'],
      ['UNKNOWN_VIEW_REFERENCE', 'views.process.routes.c9'],
    ]);
  });

  it('refuses malformed layouts', () => {
    expect(errors({ pid: {} })).toEqual([['UNKNOWN_FIELD', 'views.pid']]);
    expect(errors({ process: { symbols: { T1: { x: 0, y: 0, rotation: 45 } } } })).toEqual([['INVALID_FIELD', 'views.process.symbols.T1.rotation']]);
    expect(errors({ process: { symbols: { T1: { x: 0, y: 0, hidden: false } } } })).toEqual([['INVALID_FIELD', 'views.process.symbols.T1.hidden']]);
    expect(errors({ process: { symbols: { T1: { x: 2e6, y: 0 } } } })).toEqual([['INVALID_FIELD', 'views.process.symbols.T1.x']]);
    expect(errors({ process: { symbols: { T1: { x: 0, y: 0, z: 1 } } } })).toEqual([['UNKNOWN_FIELD', 'views.process.symbols.T1.z']]);
    expect(errors({ process: { routes: { c1: { points: [[0, 0]] } } } })).toEqual([['INVALID_FIELD', 'views.process.routes.c1.points']]);
    expect(errors({ process: { routes: { c1: { points: [[0, 0], [1, 'x']] } } } })).toEqual([['INVALID_FIELD', 'views.process.routes.c1.points[1][1]']]);
    expect(errors({ process: { symbols: [] } })).toEqual([['INVALID_FIELD', 'views.process.symbols']]);
    expect(errors({ process: { symbols: { T1: { x: 0, y: 0 }, V1: { x: 0, y: 0 } } } }, { maxComponents: 1 })[0][0]).toBe('LIMIT_EXCEEDED');
  });

  it('keeps a "__proto__" id as plain data and refuses it as an unknown component', () => {
    const r = validateScene(JSON.parse('{"schemaVersion":4,"documentType":"industrial.scene","units":"m","components":[],"connections":[],"views":{"process":{"symbols":{"__proto__":{"x":1,"y":2}}}}}'), options);
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toEqual(['UNKNOWN_VIEW_REFERENCE']);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('removing what a view places', () => {
  it('removeComponent drops its symbol from every view and the routes of its edges', () => {
    const r = removeComponent(valid(layouts), 'V1');
    expect(r.ok && r.scene.views).toEqual({ process: { symbols: { T1: { x: 40, y: 120 } } } });
    const both = r.ok ? removeComponent(r.scene, 'T1') : r;
    expect(both.ok && 'views' in both.scene).toBe(false);
  });

  it('disconnect and removeAssociation drop their routes', () => {
    const d = disconnect(valid(layouts), 'c1');
    expect(d.ok && d.scene.views?.process).toEqual({ symbols: layouts.process.symbols });
    const a = removeAssociation(valid(layouts), 'a1');
    expect(a.ok && a.scene.views?.electrical).toEqual({ symbols: layouts.electrical.symbols });
  });

  it('returns the views untouched when nothing they place is removed', () => {
    const scene = valid({ process: { symbols: { T1: { x: 0, y: 0 } } } });
    const r = disconnect(scene, 'c1');
    expect(r.ok && r.scene.views).toBe(scene.views);
  });
});
