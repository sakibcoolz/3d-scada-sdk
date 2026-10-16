import { describe, expect, it } from 'vitest';
import { BoxGeometry, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { cutBelow } from './liquidCut.js';

/** Signed volume of a closed triangle mesh (divergence theorem). */
function volumeOf(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

describe('cutBelow', () => {
  it('keeps the part of a convex mesh below a level and caps it flat', () => {
    const cut = cutBelow(new BoxGeometry(2, 2, 2), 0.5)!;
    cut.computeBoundingBox();
    expect(cut.boundingBox!.max.y).toBeCloseTo(0.5, 9);
    expect(cut.boundingBox!.min.y).toBeCloseTo(-1, 9);
    expect(volumeOf(cut)).toBeCloseTo(2 * 2 * 1.5, 9);
  });

  it('cuts a sphere at its equator into a closed half', () => {
    const sphere = new SphereGeometry(1, 48, 32);
    expect(volumeOf(cutBelow(sphere, 0)!) / volumeOf(cutBelow(sphere, 2)!)).toBeCloseTo(0.5, 3);
  });

  it('is empty below the mesh and whole above it', () => {
    expect(cutBelow(new BoxGeometry(1, 1, 1), -0.6)).toBeUndefined();
    expect(volumeOf(cutBelow(new BoxGeometry(1, 1, 1), 0.6)!)).toBeCloseTo(1, 9);
  });
});
