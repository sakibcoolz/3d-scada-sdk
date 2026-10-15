import type { ScadaScene } from './scene';
import { validateScene, type SceneValidationOptions, type SceneValidationResult } from './validation';

export interface ParseSceneOptions extends SceneValidationOptions {
  /** Largest accepted text length in characters, checked before parsing. Default 10,000,000. */
  maxLength?: number;
}

/**
 * Canonical JSON for a scene: current schema version (3), vectors as named objects in x, y, z(, w)
 * order, fixed key order, property keys sorted,
 * two-space indent and a trailing newline. Only authored fields are written, so the same scene
 * always produces the same bytes. Array order (components, connections) is preserved.
 */
export function serializeScene(scene: ScadaScene): string {
  const document = {
    schemaVersion: 3,
    units: 'm',
    components: scene.components.map((c) => ({
      id: c.id,
      type: c.type,
      ...(c.parentId !== undefined ? { parentId: c.parentId } : {}),
      position: { x: c.position.x, y: c.position.y, z: c.position.z },
      rotation: { x: c.rotation.x, y: c.rotation.y, z: c.rotation.z, w: c.rotation.w },
      scale: { x: c.scale.x, y: c.scale.y, z: c.scale.z },
      properties: Object.fromEntries(Object.entries(c.properties).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    })),
    connections: scene.connections.map((c) => ({
      id: c.id,
      from: { instanceId: c.from.instanceId, portId: c.from.portId },
      to: { instanceId: c.to.instanceId, portId: c.to.portId },
    })),
    ...(scene.tagBindings
      ? {
          tagBindings: scene.tagBindings.map((b) => ({
            id: b.id,
            tagId: b.tagId,
            kind: b.kind,
            ...(b.kind === 'property' ? { instanceId: b.instanceId, property: b.property } : { connectionId: b.connectionId }),
            ...(b.unit !== undefined ? { unit: b.unit } : {}),
          })),
        }
      : {}),
  };
  // JSON.stringify already writes -0 as 0.
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Parses scene JSON text: size check, JSON parse, then `validateScene` (which migrates version 1). */
export function parseScene(text: string, options: ParseSceneOptions): SceneValidationResult {
  const maxLength = options.maxLength ?? 10_000_000;
  if (text.length > maxLength) {
    return { ok: false, errors: [{ code: 'LIMIT_EXCEEDED', path: '', message: `Scene text is longer than ${maxLength} characters.` }] };
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [{ code: 'INVALID_JSON', path: '', message: `Not valid JSON: ${(error as Error).message}` }] };
  }
  return validateScene(input, options);
}
