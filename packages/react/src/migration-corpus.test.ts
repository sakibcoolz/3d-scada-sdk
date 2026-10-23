import { readdirSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { findOpenJoints, serializeScene } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';
import { importSceneText } from './sceneFile.js';

// Migration corpus (T-095): documents written by earlier releases, loaded the way the editor loads a
// file (`importSceneText`: parse, migrate, re-seat to ASME sizes). Each must come out as its golden
// version 4 file, that file must be schema-valid, and loading it again must change nothing.
// Provenance of every input: schema/fixtures/migration/README.md.

const dir = new URL('../../core/schema/fixtures/migration/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), 'utf8');
const inputs = readdirSync(dir).filter((f) => f.endsWith('.scene.json')).sort();
const schema = JSON.parse(readFileSync(new URL('../../core/schema/industrial-scene.v4.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

// Open joints after loading. The demos and generated lines were working scenes; the plants are the
// owner's files kept for their open joints (see components joints.test.ts).
const expectedOpen: Record<string, string[]> = {
  'v3-open-joints-plant.scene.json': ['pipe-tee', 'tee-a', 'tee-b'],
};

describe('migration corpus', () => {
  it('covers every earlier schema version', () => {
    expect(new Set(inputs.map((f) => f.slice(0, 2)))).toEqual(new Set(['v1', 'v2', 'v3']));
  });

  for (const name of inputs) {
    describe(name, () => {
      const loaded = importSceneText(read(name));
      if (!loaded.ok) throw new Error(`${name}: ${loaded.errors.join('; ')}`);
      const written = serializeScene(loaded.scene);

      it('migrates from its own version to the golden version 4 file', () => {
        expect(loaded.message).toContain(`(migrated from version ${name[1]})`);
        expect(written).toBe(read(name.replace('.scene.json', '.v4.json')));
      });

      it('writes a document the JSON Schema accepts', () => {
        expect(validate(JSON.parse(written)), JSON.stringify(validate.errors)).toBe(true);
      });

      it('loads its own output unchanged: no migration and no re-seating', () => {
        const again = importSceneText(written);
        if (!again.ok) throw new Error(again.errors.join('; '));
        expect(again.message).not.toMatch(/migrated|ASME/);
        expect(serializeScene(again.scene)).toBe(written);
      });

      it('keeps its joints', () => {
        expect(findOpenJoints(loaded.scene, catalogResolvers).map((o) => o.connectionId)).toEqual(expectedOpen[name] ?? []);
      });
    });
  }
});
