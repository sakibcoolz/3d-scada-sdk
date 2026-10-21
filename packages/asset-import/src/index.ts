// Public API of @sakibcoolz/asset-import (ADR-0012). See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { defaultSvgLimits, sanitizeSvg, toSvgMarkup } from './svg.js';
export type { SanitizedSvg, SanitizeResult, SvgError, SvgErrorCode, SvgLimits, SvgMatrix, SvgNote, SvgShape } from './svg.js';
