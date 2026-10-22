import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseScene, serializeScene, validateScene } from './index.js';
import { baseV4, mutate, options, rng, type Json } from './fixtures/fuzz.js';

// The published JSON Schema for scene version 4 (T-069, ADR-0021) must agree with validateScene:
// everything the validator accepts or writes passes the schema, and every structural error the
// schema can express is rejected by both. `ajv` is a test-only dependency (owner decision D3).

const schemaDir = new URL('../schema/', import.meta.url);
const schema = JSON.parse(readFileSync(new URL('industrial-scene.v4.schema.json', schemaDir), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const conforms = ajv.compile(schema);

const read = (folder: string, file: string) => readFileSync(new URL(`fixtures/${folder}/${file}`, schemaDir), 'utf8');
const scenes = (folder: string) => readdirSync(new URL(`fixtures/${folder}/`, schemaDir)).filter((f) => f.endsWith('.scene.json')).sort();
const expectations = (folder: string): Record<string, { code: string; path: string }> => JSON.parse(read(folder, 'expected.json'));

describe('industrial scene JSON Schema (version 4)', () => {
  it('is a strict, compilable draft 2020-12 schema for version 4 documents', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties.schemaVersion).toEqual({ const: 4 });
    expect(schema.properties.documentType).toEqual({ const: 'industrial.scene' });
  });

  it.each(scenes('valid'))('valid fixture %s passes both, and is already in canonical form', (file) => {
    const text = read('valid', file);
    expect(conforms(JSON.parse(text)), JSON.stringify(conforms.errors)).toBe(true);
    const result = parseScene(text, options);
    expect(result.ok).toBe(true);
    if (result.ok) expect(serializeScene(result.scene)).toBe(text);
  });

  it.each(scenes('invalid'))('invalid fixture %s is rejected by both, with the expected error', (file) => {
    const text = read('invalid', file);
    expect(conforms(JSON.parse(text))).toBe(false);
    const result = parseScene(text, options);
    expect(result.ok ? [] : result.errors.map((e) => ({ code: e.code, path: e.path }))).toContainEqual(expectations('invalid')[file]);
  });

  it.each(scenes('validator-only'))('validator-only fixture %s passes the schema but validateScene rejects it', (file) => {
    const text = read('validator-only', file);
    expect(conforms(JSON.parse(text)), JSON.stringify(conforms.errors)).toBe(true);
    const result = parseScene(text, options);
    expect(result.ok ? [] : result.errors.map((e) => ({ code: e.code, path: e.path }))).toContainEqual(expectations('validator-only')[file]);
  });

  it('lists an expected error for every invalid and validator-only fixture, and nothing else', () => {
    for (const folder of ['invalid', 'validator-only']) expect(Object.keys(expectations(folder)).sort()).toEqual(scenes(folder));
  });

  it('is never stricter than validateScene: 1500 seeded mutations of a version 4 document', () => {
    const next = rng(20261023);
    let accepted = 0;
    for (let i = 0; i < 1500; i++) {
      const doc = baseV4() as unknown as Json;
      const mutations = 1 + Math.floor(next() * 3);
      for (let m = 0; m < mutations; m++) mutate(doc, next);
      const result = validateScene(doc, options);
      if (!result.ok) continue;
      accepted++;
      // As JSON would carry it (undefined members dropped), and as the SDK writes it.
      const asJson = JSON.parse(JSON.stringify(doc));
      expect(conforms(asJson), `iteration ${i}: ${JSON.stringify(conforms.errors)}`).toBe(true);
      expect(conforms(JSON.parse(serializeScene(result.scene))), `iteration ${i} (serialized)`).toBe(true);
    }
    // The mutations must leave enough accepted documents for the comparison to mean something.
    expect(accepted).toBeGreaterThan(100);
  });
});
