import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { connectTouchingPorts, findTouchingPorts, parseScene, routeScene, upgradeDimensions } from '@scada3d/core';
import { catalogResolvers, legacyCatalogResolvers } from './index.js';

// A real plant layout exported from the playground with every part placed port-to-port but no
// connections. It predates ASME fittings (ADR-0014), so it is upgraded first, as on load.
const text = readFileSync(new URL('./fixtures/unconnected-plant.json', import.meta.url), 'utf8');

describe('connecting a placed but unconnected plant', () => {
  const parsed = parseScene(text, catalogResolvers);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const upgraded = upgradeDimensions(parsed.scene, { ...catalogResolvers, ...legacyCatalogResolvers });
  const loaded = { ...parsed, scene: upgraded.scene };

  it('re-seats the older layout so its touching parts still meet with ASME fitting sizes', () => {
    expect(upgraded.reseated).toBeGreaterThan(0);
    expect(findTouchingPorts(parsed.scene, catalogResolvers).matches.length).toBeLessThan(11);
  });

  it('finds the 11 port pairs that meet exactly, and nothing doubtful', () => {
    const result = findTouchingPorts(loaded.scene, catalogResolvers);
    expect(result.matches).toHaveLength(11);
    expect(result.rejected).toEqual([]);
  });

  it('connects them into a valid scene whose routes are all direct', () => {
    let n = 0;
    const result = connectTouchingPorts(loaded.scene, { ...catalogResolvers, createId: () => `c${++n}` });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.added).toBe(11);
    expect(routeScene(result.scene, catalogResolvers).map((r) => (r.status === 'ok' ? r.kind : r.reason))).toEqual(Array(11).fill('direct'));
  });
});
