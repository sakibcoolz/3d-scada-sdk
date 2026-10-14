import { parseScene, type ComponentKind, type ScadaScene, type SceneValidationError } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

/** Largest scene file the editor will read (bytes for files, characters for pasted text). */
export const MAX_SCENE_FILE_BYTES = 10_000_000;
const MAX_LISTED_ERRORS = 20;

const resolvePorts = (type: ComponentKind) => componentCatalog[type].ports;

export type SceneImport = { ok: true; scene: ScadaScene; message: string } | { ok: false; errors: string[] };

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** One readable line per error, path first; long lists are capped. */
export function formatSceneErrors(errors: readonly SceneValidationError[]): string[] {
  const lines = errors.slice(0, MAX_LISTED_ERRORS).map((e) => (e.path ? `${e.path}: ${e.message}` : e.message));
  if (errors.length > MAX_LISTED_ERRORS) lines.push(`…and ${count(errors.length - MAX_LISTED_ERRORS, 'more error')}.`);
  return lines;
}

/** Parses, validates and (for version 1) migrates scene text against the built-in catalog. */
export function importSceneText(text: string): SceneImport {
  const result = parseScene(text, { resolvePorts, maxLength: MAX_SCENE_FILE_BYTES });
  if (!result.ok) return { ok: false, errors: formatSceneErrors(result.errors) };
  const { components, connections } = result.scene;
  const migrated = result.migratedFrom ? ` (migrated from version ${result.migratedFrom})` : '';
  return {
    ok: true,
    scene: result.scene,
    message: `Loaded ${count(components.length, 'component')} and ${count(connections.length, 'connection')}${migrated}.`,
  };
}
