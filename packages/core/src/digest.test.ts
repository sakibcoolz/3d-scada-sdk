import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEmptyScene, parseScene, sceneDigest, serializeScene, sha256Hex } from './index.js';

// SHA-256 (ADR-0028): the FIPS 180-4 test vectors, UTF-8, every padding boundary, and agreement with
// Node's own implementation; and the scene digest over the canonical form.

describe('sha256Hex', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('hashes UTF-8 bytes and agrees with Node at every length around the 64-byte block', () => {
    expect(sha256Hex('m³/h °C — ✓')).toBe(createHash('sha256').update('m³/h °C — ✓', 'utf8').digest('hex'));
    for (let n = 0; n <= 130; n++) {
      const text = 'x'.repeat(n);
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
    }
  });
});

describe('sceneDigest', () => {
  it('is the hash of the canonical form, so formatting of the stored file does not matter', () => {
    const scene = createEmptyScene();
    expect(sceneDigest(scene)).toBe(sha256Hex(serializeScene(scene)));
    const compact = JSON.stringify(JSON.parse(serializeScene(scene)));
    const reparsed = parseScene(compact, { resolvePorts: () => [] });
    expect(reparsed.ok && sceneDigest(reparsed.scene)).toBe(sceneDigest(scene));
    expect(sceneDigest({ ...scene, project: { revision: '2' } })).not.toBe(sceneDigest(scene));
  });
});
