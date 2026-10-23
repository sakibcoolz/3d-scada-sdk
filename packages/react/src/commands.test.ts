import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyScene, valueFitsDataType, type RuntimeVariable, type ScadaScene, type VariableState } from '@sakibcoolz/core';
import { checkCommandValue, commandAvailability, createCommandRequest, formatCommandValue, hostCommandStatus, recheckCommand, requestIds, writableVariables } from './commands.js';

// The command-request boundary (ADR-0029 §3): what may be requested, refusals, and the request itself.

const sp: RuntimeVariable = { id: 'SP', name: 'Speed setpoint', componentId: 'VFD', dataType: 'float32', unit: 'rpm', access: 'readWrite', source: { dataSourceId: 'd' }, command: { min: 0, max: 1500, step: 10 } };
const run: RuntimeVariable = { id: 'RUN', dataType: 'bool', access: 'readWrite', source: { dataSourceId: 'd' }, command: {} };
const count: RuntimeVariable = { id: 'N', componentId: 'VFD', dataType: 'int16', access: 'readWrite', source: { dataSourceId: 'd' }, command: { min: -5, max: 5 } };
const ok = (value: number | boolean): VariableState => ({ tagId: 'SP', status: 'ok', value, quality: 'GOOD', source: 'MEASURED', sourceTimestamp: '2026-10-23T12:00:00.000Z', uncertain: false });

describe('writableVariables', () => {
  it('lists a component’s own writable variables and those bound to it, in scene order', () => {
    const scene: ScadaScene = {
      ...createEmptyScene(),
      runtimeVariables: [sp, run, count, { id: 'PV', componentId: 'VFD', dataType: 'float32', access: 'read' }],
      tagBindings: [{ id: 'b', tagId: 'RUN', kind: 'property', instanceId: 'P', property: 'running' }],
    };
    expect(writableVariables(scene, 'VFD').map((v) => v.id)).toEqual(['SP', 'N']);
    expect(writableVariables(scene, 'P').map((v) => v.id)).toEqual(['RUN']);
    expect(writableVariables(scene, 'X')).toEqual([]);
  });
});

describe('commandAvailability', () => {
  it('refuses an unknown reading and simulated values, with the reason', () => {
    expect(commandAvailability(ok(1200), 'MEASURED')).toEqual({ ok: true });
    expect(commandAvailability(ok(1200), undefined)).toEqual({ ok: true });
    expect(commandAvailability({ tagId: 'SP', status: 'unknown', reason: 'DISCONNECTED' }, 'MEASURED')).toEqual({ ok: false, reason: 'Not available: the current reading is disconnected.' });
    expect(commandAvailability(undefined, 'MEASURED')).toEqual({ ok: false, reason: 'Not available: the current reading is missing.' });
    expect(commandAvailability(ok(1200), 'SIMULATED')).toMatchObject({ ok: false, reason: expect.stringMatching(/^Not available while values are simulated/) });
  });
});

describe('checkCommandValue', () => {
  it('accepts values within limits and on the step', () => {
    expect(checkCommandValue(sp, ' 1200 ')).toEqual({ ok: true, value: 1200 });
    expect(checkCommandValue(sp, '0')).toEqual({ ok: true, value: 0 });
    expect(checkCommandValue(sp, '1500')).toEqual({ ok: true, value: 1500 });
    expect(checkCommandValue({ ...sp, command: { min: 0.1, max: 1, step: 0.1 } }, '0.7')).toEqual({ ok: true, value: 0.7 });
    expect(checkCommandValue(run, true)).toEqual({ ok: true, value: true });
    expect(checkCommandValue(run, false)).toEqual({ ok: true, value: false });
  });

  it('refuses empty, non-numeric, out-of-range, off-step and mistyped values', () => {
    expect(checkCommandValue(sp, '')).toEqual({ ok: false, message: 'Enter a value.' });
    expect(checkCommandValue(sp, '12x')).toEqual({ ok: false, message: 'Enter a number.' });
    expect(checkCommandValue(sp, 'Infinity')).toEqual({ ok: false, message: 'Enter a number.' });
    expect(checkCommandValue(sp, '1510')).toEqual({ ok: false, message: 'Enter a value from 0 to 1500.' });
    expect(checkCommandValue(sp, '-10')).toEqual({ ok: false, message: 'Enter a value from 0 to 1500.' });
    expect(checkCommandValue(sp, '1205')).toEqual({ ok: false, message: 'Enter a value in steps of 10 from 0.' });
    expect(checkCommandValue(count, '1.5')).toEqual({ ok: false, message: '1.5 does not fit int16.' });
    expect(checkCommandValue(run, 'true')).toEqual({ ok: false, message: 'Choose on or off.' });
    expect(checkCommandValue({ ...sp, command: {} }, '1')).toMatchObject({ ok: false });
  });
});

describe('hostile input (T-096)', () => {
  it('takes plain decimal numbers only', () => {
    for (const input of ['0x10', '0b11', '0o7', '1_000', 'Infinity', '10rpm', '1,5', '٣', '+', '.', 'e3']) expect(checkCommandValue(sp, input), input).toEqual({ ok: false, message: 'Enter a number.' });
    for (const [input, value] of [[' 20 ', 20], ['+30', 30], ['1.5e2', 150], ['.0', 0], ['40.', 40]] as const) expect(checkCommandValue(sp, input), input).toEqual({ ok: true, value });
  });

  it('accepts only values inside the limits, on a step and of the type, whatever is typed', () => {
    const alphabet = '0123456789+-.eE xob_,';
    let seed = 96;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 5000; i++) {
      const input = Array.from({ length: 1 + Math.floor(next() * 8) }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
      for (const v of [sp, count]) {
        const r = checkCommandValue(v, input);
        if (!r.ok) continue;
        const value = r.value as number;
        const { min, max, step } = v.command!;
        expect(/^\s*[+-]?[\d.]+([eE][+-]?\d+)?\s*$/.test(input), input).toBe(true);
        expect(value >= min! && value <= max! && valueFitsDataType(value, v.dataType), input).toBe(true);
        if (step) expect(Math.abs((value - min!) / step - Math.round((value - min!) / step)) < 1e-6, input).toBe(true);
      }
    }
  });

  it('shows a host answer only with a known state, and its message only as text', () => {
    expect(hostCommandStatus({ state: 'accepted', message: 'queued' })).toEqual({ state: 'accepted', message: 'queued' });
    expect(hostCommandStatus({ state: 'done' })).toBeUndefined();
    expect(hostCommandStatus({ state: { toString: 'x' } })).toBeUndefined();
    expect(hostCommandStatus('accepted')).toBeUndefined();
    expect(hostCommandStatus(null)).toBeUndefined();
    expect(hostCommandStatus({ state: 'failed', message: { $$typeof: Symbol.for('react.element') } })).toEqual({ state: 'failed' });
  });
});

describe('findings of the T-096 review', () => {
  const doc = (variables: RuntimeVariable[]): ScadaScene => ({ ...createEmptyScene(), runtimeVariables: variables });
  it('checks the value again at Send against the document as it is then', () => {
    expect(recheckCommand(doc([sp]), 'VFD', 'SP', '1200', 1200)).toEqual({ ok: true, variable: sp });
    const tighter = { ...sp, command: { min: 0, max: 1000, step: 10 } };
    expect(recheckCommand(doc([tighter]), 'VFD', 'SP', '1200', 1200)).toEqual({ ok: false, message: 'Enter a value from 0 to 1000.', variable: tighter });
    expect(recheckCommand(doc([{ ...sp, access: 'read', command: undefined }]), 'VFD', 'SP', '1200', 1200)).toEqual({ ok: false, message: 'This variable can no longer be requested.' });
    expect(recheckCommand(doc([]), 'VFD', 'SP', '1200', 1200).ok).toBe(false);
  });

  it('keeps to the step however far from min', () => {
    const wide: RuntimeVariable = { ...sp, dataType: 'float64', command: { min: 0, max: 1e12, step: 1 } };
    expect(checkCommandValue(wide, '600000000.5')).toEqual({ ok: false, message: 'Enter a value in steps of 1 from 0.' });
    expect(checkCommandValue(wide, '600000000')).toEqual({ ok: true, value: 600000000 });
  });
});

describe('the request', () => {
  it('names the tag, value, current reading, approved revision and digest', () => {
    const request = createCommandRequest({ requestId: 'cmd-x-1', variable: sp, value: 1200, current: ok(900), revision: '1', digest: 'ab'.repeat(32), at: new Date('2026-10-23T12:00:01Z') });
    expect(request).toEqual({ requestId: 'cmd-x-1', tagId: 'SP', componentId: 'VFD', dataType: 'float32', value: 1200, unit: 'rpm', current: { value: 900, quality: 'GOOD', sourceTimestamp: '2026-10-23T12:00:00.000Z' }, sceneRevision: '1', sceneDigest: 'ab'.repeat(32), requestedAt: '2026-10-23T12:00:01.000Z' });
    expect(formatCommandValue(sp, 1200)).toBe('1200 rpm');
    expect(formatCommandValue(run, true)).toBe('on');
  });

  it('numbers requests uniquely within a session, without crypto.randomUUID', () => {
    const next = requestIds();
    const ids = [next(), next(), next()];
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toMatch(/^cmd-[0-9a-z]{8}-1$/);
    expect(requestIds()()).not.toBe(ids[0]);
  });
});

describe('the command modules', () => {
  it('contain no way to reach a device: no network calls, sockets or writes', () => {
    for (const file of ['./commands.ts', './commandPanel.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\bfetch\(|WebSocket|XMLHttpRequest|EventSource|sendBeacon|setTagValues/);
    }
  });
});
