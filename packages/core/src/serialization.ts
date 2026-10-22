import { SCENE_DOCUMENT_TYPE, type JsonValue, type ScadaScene } from './scene.js';
import { validateScene, type SceneValidationOptions, type SceneValidationResult } from './validation.js';

export interface ParseSceneOptions extends SceneValidationOptions {
  /** Largest accepted text length in characters, checked before parsing. Default 10,000,000. */
  maxLength?: number;
}

const byKey = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);
/** An object with its keys sorted, as plain data (keys such as "__proto__" stay data). */
function sortedObject<T>(record: Record<string, T>, map: (value: T) => unknown = (v) => v): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record).sort(byKey)) {
    Object.defineProperty(out, key, { value: map(value), enumerable: true, writable: true, configurable: true });
  }
  return out;
}
/** Extension JSON with object keys sorted at every level; arrays keep their order. */
function canonicalJson(value: JsonValue): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === 'object') return sortedObject(value, canonicalJson);
  return value;
}

/**
 * Canonical JSON for a scene: current schema version (4, ADR-0021), vectors as named objects in
 * x, y, z(, w) order, fixed key order, keys of properties, labels and extensions sorted, two-space
 * indent and a trailing newline. Only authored fields are written, so the same scene always
 * produces the same bytes. Array order (components, connections) is preserved.
 */
export function serializeScene(scene: ScadaScene): string {
  const p = scene.project;
  const document = {
    schemaVersion: 4,
    documentType: SCENE_DOCUMENT_TYPE,
    units: 'm',
    ...(p
      ? {
          project: {
            ...(p.id !== undefined ? { id: p.id } : {}),
            ...(p.name !== undefined ? { name: p.name } : {}),
            ...(p.revision !== undefined ? { revision: p.revision } : {}),
            ...(p.description !== undefined ? { description: p.description } : {}),
          },
        }
      : {}),
    components: scene.components.map((c) => ({
      id: c.id,
      ...(c.name !== undefined ? { name: c.name } : {}),
      type: c.type,
      ...(c.typeVersion !== undefined ? { typeVersion: c.typeVersion } : {}),
      ...(c.manufacturer !== undefined ? { manufacturer: c.manufacturer } : {}),
      ...(c.model !== undefined ? { model: c.model } : {}),
      ...(c.parentId !== undefined ? { parentId: c.parentId } : {}),
      position: { x: c.position.x, y: c.position.y, z: c.position.z },
      rotation: { x: c.rotation.x, y: c.rotation.y, z: c.rotation.z, w: c.rotation.w },
      scale: { x: c.scale.x, y: c.scale.y, z: c.scale.z },
      properties: sortedObject(c.properties),
      ...(c.labels !== undefined ? { labels: sortedObject(c.labels) } : {}),
      ...(c.extensions !== undefined ? { extensions: sortedObject(c.extensions, canonicalJson) } : {}),
    })),
    connections: scene.connections.map((c) => ({
      id: c.id,
      ...(c.domain !== undefined ? { domain: c.domain } : {}),
      ...(c.relationship !== undefined ? { relationship: c.relationship } : {}),
      from: { instanceId: c.from.instanceId, portId: c.from.portId },
      to: { instanceId: c.to.instanceId, portId: c.to.portId },
      ...(c.properties !== undefined ? { properties: sortedObject(c.properties) } : {}),
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
    ...(scene.underlay
      ? {
          underlay: {
            svg: scene.underlay.svg,
            position: { x: scene.underlay.position.x, z: scene.underlay.position.z },
            width: scene.underlay.width,
            rotation: scene.underlay.rotation,
            opacity: scene.underlay.opacity,
          },
        }
      : {}),
    ...(scene.extensions !== undefined ? { extensions: sortedObject(scene.extensions, canonicalJson) } : {}),
  };
  // JSON.stringify already writes -0 as 0.
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Parses scene JSON text: size check, JSON parse, then `validateScene` (which migrates versions 1–3). */
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
