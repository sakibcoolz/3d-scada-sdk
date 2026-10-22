import { describe, expect, it } from 'vitest';
import type { ComponentInstance, ScadaScene } from '@sakibcoolz/core';
import { createComponentRegistry, type ComponentTypeDefinition } from '@sakibcoolz/components';
import { wireColors, wireSegments } from './wires.js';

// Wired connections drawn as straight lines (ADR-0023, T-074).

const box = (type: string, ports: ComponentTypeDefinition['ports']): ComponentTypeDefinition => ({
  type,
  label: type,
  ports,
  bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  parts: [{ shape: 'box', role: 'shell', center: [0, 0.5, 0], size: [1, 1, 1] }],
});
const registry = createComponentRegistry(
  box('com.example.plc', [
    { id: 'do0', kind: 'signal', position: [0.5, 0.5, 0], direction: [1, 0, 0], signal: { type: 'DO' } },
    { id: 'eth', kind: 'network', position: [0, 1, 0], direction: [0, 1, 0], network: { medium: 'ethernet' } },
  ]),
  box('com.example.vfd', [
    { id: 'run', kind: 'signal', position: [-0.5, 0.5, 0], direction: [-1, 0, 0], signal: { type: 'DI' } },
    { id: 'eth', kind: 'network', position: [0, 1, 0], direction: [0, 1, 0], network: { medium: 'ethernet' } },
  ]),
);
const at = (id: string, type: string, x: number): ComponentInstance => ({ id, type, position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} });
const edge = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { instanceId: a, portId: ap }, to: { instanceId: b, portId: bp } });

describe('wireSegments', () => {
  it('draws each wired connection terminal to terminal, in world space', () => {
    const scene: ScadaScene = {
      schemaVersion: 4,
      documentType: 'industrial.scene',
      units: 'm',
      components: [at('PLC', 'com.example.plc', 0), at('VFD', 'com.example.vfd', 4), at('T', 'tank', -5), at('P', 'pipe', -3)],
      connections: [edge('c1', 'PLC', 'do0', 'VFD', 'run'), edge('c2', 'PLC', 'eth', 'VFD', 'eth'), edge('pipe', 'T', 'outlet', 'P', 'in'), edge('lost', 'PLC', 'nope', 'VFD', 'run')],
    };
    expect(wireSegments(scene, registry)).toEqual([
      { connectionId: 'c1', domain: 'signal', from: [0.5, 0.5, 0], to: [3.5, 0.5, 0] },
      { connectionId: 'c2', domain: 'network', from: [0, 1, 0], to: [4, 1, 0] },
    ]);
  });

  it('gives each wired domain its own colour', () => {
    expect(new Set([wireColors.power, wireColors.signal, wireColors.network]).size).toBe(3);
  });
});
