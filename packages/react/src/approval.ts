import { parseScene, sceneDigest, validateScene, type ScadaScene, type SceneValidationError, type SceneValidationOptions } from '@sakibcoolz/core';

// The runtime's gate (ADR-0028): a document is shown only when it is valid and matches what the host
// approved: its `project.revision` and the digest of its canonical form. Pure; no rendering.

/** What a host approved: either or both may be given. */
export interface ApprovalRecord {
  revision?: string;
  /** `sceneDigest(scene)` as recorded at approval: SHA-256 of the canonical form, lower-case hex. */
  digest?: string;
}

export type RuntimeRefusal =
  | { code: 'INVALID'; message: string; errors: SceneValidationError[] }
  | { code: 'REVISION_MISMATCH'; message: string; expected: string; actual?: string }
  | { code: 'DIGEST_MISMATCH'; message: string; expected: string; actual: string };

export type ApprovalResult = { ok: true; scene: ScadaScene; digest: string } | { ok: false; refusal: RuntimeRefusal };

/**
 * Validates `document` (scene text or parsed JSON) and checks it against `expected`. The revision is
 * compared exactly; the digest case-insensitively. Nothing is repaired or migrated silently: an older
 * schema version is upgraded by validation as usual, and the digest is of the upgraded canonical form.
 */
export function checkApproval(document: string | object, expected: ApprovalRecord | undefined, options: SceneValidationOptions): ApprovalResult {
  const result = typeof document === 'string' ? parseScene(document, options) : validateScene(document, options);
  if (!result.ok) {
    const first = result.errors[0];
    return { ok: false, refusal: { code: 'INVALID', message: `The document is not valid: ${first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'unknown error'}`, errors: result.errors } };
  }
  const scene = result.scene;
  const actualRevision = scene.project?.revision;
  if (expected?.revision !== undefined && actualRevision !== expected.revision) {
    return {
      ok: false,
      refusal: {
        code: 'REVISION_MISMATCH',
        message: actualRevision === undefined ? `Revision ${expected.revision} was approved, but the document has no revision.` : `Revision ${expected.revision} was approved, but the document is revision ${actualRevision}.`,
        expected: expected.revision,
        ...(actualRevision !== undefined ? { actual: actualRevision } : {}),
      },
    };
  }
  const digest = sceneDigest(scene);
  if (expected?.digest !== undefined && digest !== expected.digest.trim().toLowerCase()) {
    return { ok: false, refusal: { code: 'DIGEST_MISMATCH', message: 'The document differs from the approved one: its SHA-256 digest does not match.', expected: expected.digest, actual: digest } };
  }
  return { ok: true, scene, digest };
}
