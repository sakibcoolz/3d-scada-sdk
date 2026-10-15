import { describe, expect, it } from 'vitest';
import type { ComponentInstance } from '@scada3d/core';
import { INSTANCE_CHUNK, spatialChunks } from './instancing.js';

const valve = (i: number, x: number, z: number): ComponentInstance => ({ id: `v${i}`, type: 'valve', position: { x, y: 0.2, z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
// The benchmark layout: 20 columns 3 m apart, rows 4 m apart.
const grid = (n: number) => Array.from({ length: n }, (_, i) => valve(i, (i % 20) * 3, Math.floor(i / 20) * 4));

describe('spatialChunks', () => {
  it('keeps every member exactly once, in chunks of at most the chunk size', () => {
    const members = grid(1000);
    const chunks = spatialChunks(members);
    expect(chunks.every((c) => c.length > 0 && c.length <= INSTANCE_CHUNK)).toBe(true);
    expect(chunks.flat().map((c) => c.id).sort()).toEqual(members.map((c) => c.id).sort());
  });

  it('makes compact chunks, not long strips', () => {
    const extent = (chunk: ComponentInstance[], a: 'x' | 'z') => Math.max(...chunk.map((c) => c.position[a])) - Math.min(...chunk.map((c) => c.position[a]));
    for (const chunk of spatialChunks(grid(5000))) {
      // The whole layout is 57 m × 996 m; a strip would span one of them entirely.
      expect(extent(chunk, 'z')).toBeLessThan(60);
      expect(extent(chunk, 'x') * extent(chunk, 'z')).toBeLessThan(57 * 60);
    }
  });

  it('is stable for the same input and leaves small sets whole', () => {
    expect(spatialChunks(grid(300)).map((c) => c.map((x) => x.id))).toEqual(spatialChunks(grid(300)).map((c) => c.map((x) => x.id)));
    expect(spatialChunks(grid(10))).toHaveLength(1);
    expect(spatialChunks([])).toEqual([]);
  });
});
