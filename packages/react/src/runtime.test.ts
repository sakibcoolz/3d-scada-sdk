import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyScene, sceneDigest, serializeScene } from '@sakibcoolz/core';
import { builtInRegistry } from '@sakibcoolz/components';
import { checkApproval } from './approval.js';

// The locked runtime (ADR-0028): the approval gate, and the promise that no edit path is reachable.

const options = builtInRegistry.resolvers;
const approved = { ...createEmptyScene(), project: { name: 'Line 1', revision: '7' } };
const text = serializeScene(approved);
const digest = sceneDigest(approved);

describe('checkApproval', () => {
  it('accepts the approved revision and digest, from text or parsed JSON, whatever the formatting', () => {
    expect(checkApproval(text, { revision: '7', digest }, options)).toMatchObject({ ok: true, digest });
    expect(checkApproval(JSON.parse(text), { revision: '7', digest: digest.toUpperCase() }, options).ok).toBe(true);
    expect(checkApproval(JSON.stringify(JSON.parse(text)), { digest }, options).ok).toBe(true);
    expect(checkApproval(text, undefined, options).ok).toBe(true);
  });

  it('refuses another revision, a missing revision, a changed document, and an invalid one', () => {
    expect(checkApproval(text, { revision: '8' }, options)).toEqual({ ok: false, refusal: { code: 'REVISION_MISMATCH', message: 'Revision 8 was approved, but the document is revision 7.', expected: '8', actual: '7' } });
    expect(checkApproval(serializeScene(createEmptyScene()), { revision: '7' }, options)).toMatchObject({ ok: false, refusal: { code: 'REVISION_MISMATCH', message: 'Revision 7 was approved, but the document has no revision.' } });
    const edited = serializeScene({ ...approved, project: { ...approved.project, name: 'Line 1 (edited)' } });
    expect(checkApproval(edited, { revision: '7', digest }, options)).toMatchObject({ ok: false, refusal: { code: 'DIGEST_MISMATCH', expected: digest } });
    const invalid = checkApproval('{"schemaVersion":4}', { revision: '7' }, options);
    expect(invalid.ok ? '' : invalid.refusal.code).toBe('INVALID');
    expect(invalid.ok ? '' : invalid.refusal.message).toMatch(/^The document is not valid: /);
  });
});

describe('the runtime module', () => {
  /** Every module of this package that `entry` reaches through relative imports. */
  function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      // Type-only imports are erased at build, so they cannot bring code in.
      for (const [, path] of source.matchAll(/^import (?!type )[^;]*from '\.\/([\w.-]+)\.js'/gm)) {
        const next = ['tsx', 'ts'].map((ext) => `./${path}.${ext}`).find((f) => { try { readFileSync(new URL(f, import.meta.url)); return true; } catch { return false; } });
        if (next) visit(next);
      }
    };
    visit(entry);
    return seen;
  }

  it('cannot reach any module that changes a scene: the editor, its history, the tag editor, keyboard moves or the workspace', () => {
    const modules = reachable('./runtime.tsx');
    // The shared Ports and Related sections (inspector.tsx) are reachable; they offer editing only through
    // callbacks the editor passes and the runtime never does. Their wiring.ts helper is pure: it lists
    // candidates and parses values, and cannot change a scene.
    for (const editing of ['./editor.tsx', './history.ts', './drop.ts', './tagEditor.tsx', './tagForms.ts', './keyboard.ts', './workspace.tsx', './sceneFile.ts']) {
      expect(modules.has(editing), editing).toBe(false);
    }
    expect(modules.has('./viewer.tsx')).toBe(true);
  });
});
