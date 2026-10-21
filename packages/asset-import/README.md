# @sakibcoolz/asset-import

**Allow-list SVG sanitizer** for the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk): turns an untrusted SVG drawing (for example a P&ID or floor plan) into a safe shape model and clean markup, used for reference underlays under a 3D plant. No DOM required — runs in Node.js, browsers and workers.

```sh
npm install @sakibcoolz/asset-import
```
ESM only · Node.js 20+ · TypeScript types included · MIT

## Quick start

```js
import { sanitizeSvg } from '@sakibcoolz/asset-import';

const result = sanitizeSvg(untrustedSvgText);
if (result.ok) {
  result.svg;      // shape model: viewBox and shapes (paths, transforms, fills, strokes)
  result.markup;   // clean SVG markup rebuilt from the model only
  result.notes;    // what was dropped (text, metadata, unknown elements…)
} else {
  result.errors;   // e.g. [{ code: 'FORBIDDEN_ELEMENT', … }] for a <script>
}
```

In [`@sakibcoolz/react`](https://www.npmjs.com/package/@sakibcoolz/react) the editor's **Underlay** section uses this to import an `.svg` and lay it flat under the scene.

## What it does
- **Keeps:** shapes, paths, groups, transforms and presentation styles (fill, stroke, opacity…).
- **Drops, with notes:** text, metadata, unknown elements and attributes.
- **Rejects:** scripts and event handlers, `href`/links, `url()`/`data:`/`javascript:` values, `image`/`use`/`foreignObject`, DOCTYPE and entities, malformed XML or paths, and anything over the limits.
- **Limits** (`defaultSvgLimits`, adjustable): 512 KiB, 5,000 elements, depth 32, 20,000 path commands.

## API
- `sanitizeSvg(text, limits?)` → `{ ok: true, svg, markup, notes }` or `{ ok: false, errors }`.
- `toSvgMarkup(model)` — markup from a sanitized model.
- `defaultSvgLimits`.
- Types: `SanitizedSvg`, `SvgShape`, `SvgMatrix`, `SanitizeResult`, `SvgError`, `SvgErrorCode`, `SvgNote`, `SvgLimits`.

Licence: MIT
