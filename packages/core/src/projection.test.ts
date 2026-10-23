import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { options } from './fixtures/fuzz.js';
import { componentStatus, projectAcquisition, resolveTelemetry, validateScene, type AcquisitionPlan, type Observation, type ScadaScene } from './index.js';

// Host and edge contracts (ADR-0029, T-092): the projection's shape is pinned by golden files, and a
// gateway that reads only the plan can feed the scene end to end.

const fixtures = new URL('../schema/fixtures/', import.meta.url);
const scene = (name: string): ScadaScene => {
  const r = validateScene(JSON.parse(readFileSync(new URL(`valid/${name}.scene.json`, fixtures), 'utf8')), options);
  if (!r.ok) throw new Error(`${name}: ${r.errors[0].message}`);
  return r.scene;
};

describe('projectAcquisition golden files', () => {
  for (const name of ['acquisition', 'control-line']) {
    it(`${name}: matches schema/fixtures/projection/${name}.plan.json byte for byte`, () => {
      const plan = projectAcquisition(scene(name));
      expect(`${JSON.stringify(plan, null, 2)}\n`).toBe(readFileSync(new URL(`projection/${name}.plan.json`, fixtures), 'utf8'));
      // Nothing a gateway does not need: no geometry, views, bindings or labels.
      for (const key of ['components', 'connections', 'position', 'views', 'tagBindings', 'underlay', 'componentId', '"name": "Tank level"']) expect(JSON.stringify(plan, null, 2)).not.toContain(key);
    });
  }
});

/**
 * A stand-in gateway that knows only the plan: it reads raw values per tag, applies the plan's linear
 * scaling, reports the plan's data type and unit, and marks every tag of a source that is down as
 * DISCONNECTED. This is host-side work; it lives here only to prove the contract.
 */
function fakeGateway(plan: AcquisitionPlan, raw: Record<string, number | boolean | string>, down: ReadonlySet<string>, at: string): Observation[] {
  return plan.variables.flatMap((v): Observation[] => {
    if (!(v.tagId in raw)) return [];
    if (down.has(v.dataSourceId)) return [{ tagId: v.tagId, value: 0, dataType: v.dataType, quality: 'DISCONNECTED' as const, sourceTimestamp: at }];
    const value = raw[v.tagId];
    const scaled = v.scaling && typeof value === 'number' ? v.scaling.min + ((value - v.scaling.rawMin) * (v.scaling.max - v.scaling.min)) / (v.scaling.rawMax - v.scaling.rawMin) : value;
    return [{ tagId: v.tagId, value: scaled, dataType: v.dataType, ...(v.unit !== undefined ? { unit: v.unit } : {}), quality: 'GOOD' as const, sourceTimestamp: at }];
  });
}

describe('a mock gateway driven only by the plan', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  const at = new Date(now - 200).toISOString();
  const line = scene('control-line');
  // The gateway receives the plan as JSON, the way a host would deploy it.
  const plan = JSON.parse(JSON.stringify(projectAcquisition(line))) as AcquisitionPlan;
  const raw = { 'LT-201.PV': 13824, 'P-201.RUNNING': true, 'P-201.SPEED': 1450, 'XV-201.OPEN': false, 'TK-201.BATCH': 'B-0042' };

  it('feeds scaled, typed observations that resolve to trusted values and an ok status', () => {
    const observations = fakeGateway(plan, raw, new Set(), at);
    expect(observations.map((o) => o.tagId)).toEqual(['LT-201.PV', 'P-201.RUNNING', 'P-201.SPEED', 'XV-201.OPEN', 'TK-201.BATCH']);
    const resolution = resolveTelemetry(line, observations, { now, resolveBindable: options.resolveBindable });
    expect(resolution.properties).toMatchObject([{ instanceId: 'TK-201', property: 'level', status: 'ok', value: 50, quality: 'GOOD' }]);
    expect(resolution.unmatchedTagIds).toEqual(['P-201.RUNNING', 'P-201.SPEED', 'XV-201.OPEN', 'TK-201.BATCH']);
    expect(componentStatus(line, resolution).byComponent.get('TK-201')!.status).toBe('ok');
  });

  it('a source that goes down makes its tags unknown and the equipment needs attention', () => {
    const resolution = resolveTelemetry(line, fakeGateway(plan, raw, new Set(['ds-plc']), at), { now, resolveBindable: options.resolveBindable });
    expect(resolution.properties).toMatchObject([{ status: 'unknown', reason: 'DISCONNECTED' }]);
    expect(componentStatus(line, resolution).attention.map((s) => s.componentId)).toEqual(['TK-201']);
  });

  it('a gateway that reports the wrong type is caught, not trusted', () => {
    const wrong = fakeGateway(plan, raw, new Set(), at).map((o) => (o.tagId === 'LT-201.PV' ? { ...o, dataType: 'float64' as const } : o));
    expect(resolveTelemetry(line, wrong, { now }).properties).toMatchObject([{ status: 'unknown', reason: 'TYPE_MISMATCH' }]);
  });
});
