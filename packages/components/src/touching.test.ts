import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { connectTouchingPorts, findTouchingPorts, parseScene, routeScene } from '@scada3d/core';
import { catalogResolvers } from './index';

// A real plant layout exported from the playground with every part placed port-to-port but no connections.
const text = readFileSync(new URL('./fixtures/unconnected-plant.json', import.meta.url), 'utf8');

describe('connecting a placed but unconnected plant', () => {
  const loaded = parseScene(text, catalogResolvers);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));

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
