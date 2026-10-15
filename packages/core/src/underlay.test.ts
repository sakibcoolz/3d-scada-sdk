import { describe, expect, it } from 'vitest';
import { parseScene, serializeScene, validateScene, defaultSceneLimits } from './index.js';

const resolvePorts = () => [];
const markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0L10 10"/></svg>';
const base = { schemaVersion: 3, units: 'm', components: [], connections: [] };
const withUnderlay = (underlay: unknown) => ({ ...base, underlay });
const good = { svg: markup, position: { x: 2, z: -3 }, width: 40, rotation: 90, opacity: 0.5 };

describe('scene underlay (ADR-0012)', () => {
  it('round-trips through the canonical file format', () => {
    const validated = validateScene(withUnderlay(good), { resolvePorts });
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    const text = serializeScene(validated.scene);
    const back = parseScene(text, { resolvePorts });
    expect(back.ok && back.scene.underlay).toEqual(good);
    expect(text.indexOf('"underlay"')).toBeGreaterThan(text.indexOf('"connections"'));
  });

  it('is absent from scenes without one', () => {
    const r = validateScene(base, { resolvePorts });
    expect(r.ok && 'underlay' in r.scene).toBe(false);
    expect(serializeScene(createScene())).not.toContain('underlay');
  });

  it.each([
    ['svg is not text', { ...good, svg: 5 }, 'underlay.svg', 'INVALID_FIELD'],
    ['position is missing z', { ...good, position: { x: 1 } }, 'underlay.position.z', 'INVALID_FIELD'],
    ['width is zero', { ...good, width: 0 }, 'underlay.width', 'INVALID_FIELD'],
    ['width is over 1 km', { ...good, width: 1001 }, 'underlay.width', 'INVALID_FIELD'],
    ['opacity is above 1', { ...good, opacity: 1.5 }, 'underlay.opacity', 'INVALID_FIELD'],
    ['rotation is not finite', { ...good, rotation: Number.NaN }, 'underlay.rotation', 'INVALID_FIELD'],
    ['an unknown field', { ...good, href: 'x' }, 'underlay.href', 'UNKNOWN_FIELD'],
    ['not an object', 'svg', 'underlay', 'INVALID_FIELD'],
  ])('rejects an underlay where %s', (_, underlay, path, code) => {
    const r = validateScene(withUnderlay(underlay), { resolvePorts });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ path, code });
  });

  it('limits the markup size', () => {
    const big = { ...good, svg: markup + ' '.repeat(defaultSceneLimits.maxUnderlayBytes) };
    const r = validateScene(withUnderlay(big), { resolvePorts });
    expect(!r.ok && r.errors[0]).toMatchObject({ path: 'underlay.svg', code: 'LIMIT_EXCEEDED' });
  });

  it('lets the host reject unsafe content through validateUnderlay', () => {
    const r = validateScene(withUnderlay(good), { resolvePorts, validateUnderlay: (svg) => (svg.includes('M0 0') ? 'contains a forbidden thing' : undefined) });
    expect(!r.ok && r.errors[0]).toMatchObject({ path: 'underlay.svg', code: 'INVALID_UNDERLAY', message: 'contains a forbidden thing' });
    expect(validateScene(withUnderlay(good), { resolvePorts, validateUnderlay: () => undefined }).ok).toBe(true);
  });

  it('is not part of older schema versions', () => {
    const r = validateScene({ schemaVersion: 2, units: 'm', components: [], connections: [], underlay: good }, { resolvePorts });
    expect(!r.ok && r.errors[0]).toMatchObject({ path: 'underlay', code: 'UNKNOWN_FIELD' });
  });
});

function createScene() {
  return { schemaVersion: 3 as const, units: 'm' as const, components: [], connections: [] };
}
