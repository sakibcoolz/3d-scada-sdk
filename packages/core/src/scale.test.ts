import { describe, expect, it } from 'vitest';
import { componentStatus, connectedGroups, defaultSceneLimits, parseScene, projectAcquisition, resolveTelemetry, resolveVariableValues, routeScene, sceneDigest, serializeScene, validateScene } from './index.js';
import { limitsAlarms, limitsObservations, limitsScene, scaleOptions, SCALE_NOW } from './fixtures/scale.js';

// Scale at the validator limits (T-095). The document is at every count limit that matters for size,
// must survive save and load under the default parse cap, and each operation must stay within a
// coarse budget: several times the time measured in PERFORMANCE.md, so only an order-of-magnitude
// regression fails here. The precise numbers come from `pnpm bench` (scale.bench.ts).

const scene = limitsScene();
const observations = limitsObservations(scene);
const telemetryOptions = { now: SCALE_NOW, resolveBindable: scaleOptions.resolveBindable };

/** Best of `runs`, in ms. */
function time(run: () => unknown, runs = 3): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

describe('a document at the limits', () => {
  it('is at the default limits and valid', () => {
    expect(scene.components).toHaveLength(defaultSceneLimits.maxComponents);
    expect(scene.connections.length).toBeGreaterThan(defaultSceneLimits.maxConnections - 3);
    expect(scene.runtimeVariables).toHaveLength(defaultSceneLimits.maxVariables);
    expect(scene.tagBindings!.length).toBeGreaterThan(defaultSceneLimits.maxBindings - 2);
    const r = validateScene(scene, scaleOptions);
    expect(r.ok ? [] : r.errors.slice(0, 3)).toEqual([]);
  });

  it('refuses one component more', () => {
    const over = { ...scene, components: [...scene.components, { ...scene.components[0], id: 'extra' }] };
    const r = validateScene(over, scaleOptions);
    expect(r.ok ? [] : r.errors.map((e) => [e.code, e.path])).toEqual([['LIMIT_EXCEEDED', 'components']]);
  });

  it('saves and loads again under the default parse cap', () => {
    // At 10 MB this failed: the saved document is about 16 MB.
    const text = serializeScene(scene);
    const loaded = parseScene(text, scaleOptions);
    expect(loaded.ok ? 'ok' : loaded.errors[0].message).toBe('ok');
    if (loaded.ok) expect(serializeScene(loaded.scene)).toBe(text);
  });
});

describe('coarse budgets at the limits (ms, best of 3)', () => {
  const telemetry = resolveTelemetry(scene, observations, telemetryOptions);
  const alarms = limitsAlarms(scene);
  const text = serializeScene(scene);
  const budgets: [string, number, () => unknown, number?][] = [
    ['validateScene', 800, () => validateScene(scene, scaleOptions)],
    ['parseScene', 1500, () => parseScene(text, scaleOptions)],
    ['serializeScene', 600, () => serializeScene(scene)],
    ['sceneDigest', 3000, () => sceneDigest(scene), 2],
    ['projectAcquisition', 150, () => projectAcquisition(scene)],
    ['resolveTelemetry', 150, () => resolveTelemetry(scene, observations, telemetryOptions)],
    ['resolveVariableValues', 150, () => resolveVariableValues(scene, observations, { now: SCALE_NOW })],
    ['componentStatus', 300, () => componentStatus(scene, telemetry, alarms)],
    ['connectedGroups', 100, () => connectedGroups(scene)],
    ['routeScene', 4000, () => routeScene(scene, scaleOptions), 2],
  ];
  for (const [name, budget, run, runs] of budgets) {
    it(`${name} within ${budget} ms`, { timeout: budget * 4 + 5000 }, () => {
      expect(time(run, runs)).toBeLessThan(budget);
    });
  }
});
