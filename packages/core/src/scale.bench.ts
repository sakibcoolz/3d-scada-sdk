import { bench, describe } from 'vitest';
import { componentStatus, connectedGroups, parseScene, projectAcquisition, resolveTelemetry, resolveVariableValues, routeScene, sceneDigest, serializeScene, validateScene } from './index.js';
import { limitsAlarms, limitsObservations, limitsScene, scaleOptions, SCALE_NOW } from './fixtures/scale.js';

// Scale at the validator limits (T-095, PERFORMANCE.md): "limits-10000" is 10,000 components,
// 19,998 connections, 20,000 variables and 19,999 bindings. Budgets are guarded in scale.test.ts.
const scene = limitsScene();
const text = serializeScene(scene);
const observations = limitsObservations(scene);
const alarms = limitsAlarms(scene);
const telemetry = resolveTelemetry(scene, observations, { now: SCALE_NOW, resolveBindable: scaleOptions.resolveBindable });

describe(`limits-10000 (${scene.components.length} components, ${scene.connections.length} connections, ${scene.runtimeVariables!.length} variables, ${scene.tagBindings!.length} bindings, ${(text.length / 1e6).toFixed(1)} MB)`, () => {
  bench('validateScene', () => void validateScene(scene, scaleOptions));
  bench('parseScene (parse + validate)', () => void parseScene(text, scaleOptions));
  bench('serializeScene', () => void serializeScene(scene));
  bench('sceneDigest', () => void sceneDigest(scene));
  bench('projectAcquisition', () => void projectAcquisition(scene));
  bench('resolveTelemetry', () => void resolveTelemetry(scene, observations, { now: SCALE_NOW, resolveBindable: scaleOptions.resolveBindable }));
  bench('resolveVariableValues', () => void resolveVariableValues(scene, observations, { now: SCALE_NOW }));
  bench('componentStatus (1,000 alarms)', () => void componentStatus(scene, telemetry, alarms));
  bench('connectedGroups', () => void connectedGroups(scene));
  bench('routeScene', () => void routeScene(scene, scaleOptions), { iterations: 5 });
});
