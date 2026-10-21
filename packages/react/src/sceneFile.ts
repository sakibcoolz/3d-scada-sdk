import { parseScene, upgradeDimensions, type ScadaScene, type SceneValidationError } from '@sakibcoolz/core';
import { catalogResolvers, legacyCatalogResolvers } from '@sakibcoolz/components';
import { sanitizeSvg } from '@sakibcoolz/asset-import';

/** Largest scene file the editor will read (bytes for files, characters for pasted text). */
export const MAX_SCENE_FILE_BYTES = 10_000_000;
const MAX_LISTED_ERRORS = 20;


export type SceneImport = { ok: true; scene: ScadaScene; message: string } | { ok: false; errors: string[] };

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** One readable line per error, path first; long lists are capped. */
export function formatSceneErrors(errors: readonly SceneValidationError[]): string[] {
  const lines = errors.slice(0, MAX_LISTED_ERRORS).map((e) => (e.path ? `${e.path}: ${e.message}` : e.message));
  if (errors.length > MAX_LISTED_ERRORS) lines.push(`…and ${count(errors.length - MAX_LISTED_ERRORS, 'more error')}.`);
  return lines;
}

/** Rejects an underlay that the SVG sanitizer would not accept (ADR-0012). */
export function underlayProblem(svg: string): string | undefined {
  const r = sanitizeSvg(svg);
  return r.ok ? undefined : `Unsafe or unreadable SVG: ${r.errors[0].message}`;
}

/** Parses, validates and (for version 1) migrates scene text against the built-in catalog. */
export function importSceneText(text: string): SceneImport {
  const result = parseScene(text, { ...catalogResolvers, validateUnderlay: underlayProblem, maxLength: MAX_SCENE_FILE_BYTES });
  if (!result.ok) return { ok: false, errors: formatSceneErrors(result.errors) };
  // Files from before ASME fittings (ADR-0014): re-seat joints that met under the old sizes.
  const upgraded = upgradeDimensions(result.scene, { ...catalogResolvers, ...legacyCatalogResolvers });
  const { components, connections } = upgraded.scene;
  const migrated = result.migratedFrom ? ` (migrated from version ${result.migratedFrom})` : '';
  const reseated = upgraded.reseated ? ` Updated ${count(upgraded.reseated, 'part')} to ASME dimensions.` : '';
  return {
    ok: true,
    scene: upgraded.scene,
    message: `Loaded ${count(components.length, 'component')} and ${count(connections.length, 'connection')}${migrated}.${reseated}`,
  };
}
