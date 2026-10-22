import type { ComponentInstance, ComponentType, Quantity, RuntimeVariable, ScadaScene, TagBinding, VariableTemplate } from './scene.js';
import { validateScene, type SceneValidationError, type SceneValidationOptions } from './validation.js';

type Resolvers = {
  /** Bindable properties per type, as for `validateScene`. */
  resolveBindable?: (type: ComponentType) => Readonly<Record<string, Quantity>> | undefined;
};

export interface SuggestOptions extends Resolvers {
  /** Variable templates per type; a registry's `resolvers.resolveVariables`. */
  resolveVariables: (type: ComponentType, properties?: ComponentInstance['properties']) => readonly VariableTemplate[] | undefined;
}

/** Proposed tags and bindings. Nothing is applied: a host or the editor applies the ones the user confirms. */
export interface TagSuggestions {
  variables: RuntimeVariable[];
  bindings: TagBinding[];
}

/**
 * Proposes runtime variables and bindings from the component definitions' variable templates
 * (ADR-0024): tag id `<componentId>.<name>`, read-only, no source (the host assigns addresses).
 * Never guesses from names. Tags that already exist, and properties that are already bound, are
 * left alone, so suggesting twice proposes nothing new.
 */
export function suggestVariables(scene: ScadaScene, options: SuggestOptions): TagSuggestions {
  const existing = new Set((scene.runtimeVariables ?? []).map((v) => v.id));
  const bindingIds = new Set((scene.tagBindings ?? []).map((b) => b.id));
  const bound = new Set((scene.tagBindings ?? []).flatMap((b) => (b.kind === 'property' ? [`${b.instanceId}\u0000${b.property}`] : [])));
  const variables: RuntimeVariable[] = [];
  const bindings: TagBinding[] = [];
  for (const c of scene.components) {
    const bindable = options.resolveBindable?.(c.type);
    for (const t of options.resolveVariables(c.type, c.properties) ?? []) {
      const id = `${c.id}.${t.name}`;
      if (existing.has(id)) continue;
      existing.add(id);
      variables.push({ id, componentId: c.id, dataType: t.dataType, ...(t.unit !== undefined ? { unit: t.unit } : {}), access: 'read' });
      const target = t.property !== undefined ? `${c.id}\u0000${t.property}` : undefined;
      const bindingId = `bind:${id}`;
      if (!target || !bindable?.[t.property!] || bound.has(target) || bindingIds.has(bindingId)) continue;
      bound.add(target);
      bindingIds.add(bindingId);
      bindings.push({ id: bindingId, tagId: id, kind: 'property', instanceId: c.id, property: t.property! });
    }
  }
  return { variables, bindings };
}

export type ApplyResult = { ok: true; scene: ScadaScene } | { ok: false; errors: SceneValidationError[] };

/**
 * Adds the confirmed suggestions to the scene and validates the result, so a confirmed proposal can
 * never leave an invalid document. The input is not changed.
 */
export function applyTagSuggestions(scene: ScadaScene, picked: TagSuggestions, options: SceneValidationOptions): ApplyResult {
  const candidate: ScadaScene = {
    ...scene,
    ...(picked.variables.length > 0 || scene.runtimeVariables ? { runtimeVariables: [...(scene.runtimeVariables ?? []), ...picked.variables] } : {}),
    ...(picked.bindings.length > 0 || scene.tagBindings ? { tagBindings: [...(scene.tagBindings ?? []), ...picked.bindings] } : {}),
  };
  const result = validateScene(candidate, options);
  return result.ok ? { ok: true, scene: result.scene } : { ok: false, errors: result.errors };
}

export type TagFindingCode = 'UNBOUND_COMPONENT' | 'UNUSED_VARIABLE' | 'UNDESCRIBED_TAG' | 'OVERLAPPING_REGISTERS';

/** Something worth a look; never an error. `path` points into the scene, as validation errors do. */
export interface TagFinding {
  code: TagFindingCode;
  path: string;
  message: string;
}

const REGISTERS: Partial<Record<RuntimeVariable['dataType'], number>> = { bool: 1, int16: 1, uint16: 1, int32: 2, uint32: 2, float32: 2, float64: 4 };

/**
 * Reviews a validated scene's tags (ADR-0024) and returns findings, in this order:
 * - components with bindable properties and no binding (needs `resolveBindable`);
 * - runtime variables no binding uses;
 * - bindings to tags with no runtime variable, when the scene defines any;
 * - variables on one Modbus source and unit whose register spans overlap (bits of one register may share it).
 * Advisory only: `validateScene` stays the rule for what a document may contain.
 */
export function reviewTags(scene: ScadaScene, options: Resolvers = {}): TagFinding[] {
  const findings: TagFinding[] = [];
  const bindings = scene.tagBindings ?? [];
  const variables = scene.runtimeVariables ?? [];
  const boundComponents = new Set(bindings.flatMap((b) => (b.kind === 'property' ? [b.instanceId] : [])));
  if (options.resolveBindable) {
    scene.components.forEach((c, i) => {
      const names = Object.keys(options.resolveBindable!(c.type) ?? {});
      if (names.length > 0 && !boundComponents.has(c.id)) {
        findings.push({ code: 'UNBOUND_COMPONENT', path: `components[${i}]`, message: `"${c.id}" has bindable ${names.join(', ')} but no tag drives it.` });
      }
    });
  }
  const usedTags = new Set(bindings.map((b) => b.tagId));
  variables.forEach((v, i) => {
    if (!usedTags.has(v.id)) findings.push({ code: 'UNUSED_VARIABLE', path: `runtimeVariables[${i}]`, message: `No binding uses tag "${v.id}".` });
  });
  if (variables.length > 0) {
    const described = new Set(variables.map((v) => v.id));
    bindings.forEach((b, i) => {
      if (!described.has(b.tagId)) findings.push({ code: 'UNDESCRIBED_TAG', path: `tagBindings[${i}].tagId`, message: `Tag "${b.tagId}" has no runtime variable.` });
    });
  }
  const protocols = new Map((scene.dataSources ?? []).map((s) => [s.id, s.protocol]));
  type Span = { index: number; id: string; key: string; from: number; to: number; bit?: number };
  const spans: Span[] = [];
  variables.forEach((v, index) => {
    const protocol = v.source && protocols.get(v.source.dataSourceId);
    const a = v.source?.address as { area?: string; address?: number; unitId?: number; bit?: number } | undefined;
    if ((protocol !== 'modbus-tcp' && protocol !== 'modbus-rtu') || !a || typeof a.address !== 'number') return;
    const count = REGISTERS[v.dataType] ?? 1;
    spans.push({ index, id: v.id, key: JSON.stringify([v.source!.dataSourceId, a.unitId, a.area]), from: a.address, to: a.address + count - 1, ...(a.bit !== undefined ? { bit: a.bit } : {}) });
  });
  for (let i = 0; i < spans.length; i++) {
    for (let j = 0; j < i; j++) {
      const [a, b] = [spans[j], spans[i]];
      if (a.key !== b.key || a.to < b.from || b.to < a.from) continue;
      if (a.bit !== undefined && b.bit !== undefined && a.bit !== b.bit) continue;
      findings.push({ code: 'OVERLAPPING_REGISTERS', path: `runtimeVariables[${b.index}].source.address`, message: `Tag "${b.id}" overlaps tag "${a.id}" on the same Modbus source, unit and area.` });
      break;
    }
  }
  return findings;
}

