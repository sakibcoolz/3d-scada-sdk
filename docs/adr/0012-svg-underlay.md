# ADR-0012: Sanitized SVG underlays (asset-import, part a)

Status: Accepted (owner, 2026-10-16); implemented in T-019a

## Context
Drawings such as P&IDs and floor plans often exist as SVG, and users want to place equipment over them. The requirements limit SVG to **reference input** (FR-11, ARCHITECTURE §5), and require that scripts, remote references and malformed files are rejected (IMPLEMENTATION_ACCEPTANCE "SVG import"). SVG is an active format (scripts, event handlers, external resources, entity expansion), so it must never reach a renderer unsanitized.

## Owner decisions
- Split T-019: **(a) an underlay now**; (b) extrusion into custom parts next.
- A **new optional package `@scada3d/asset-import`**, with no DOM dependency.
- The underlay is **saved in the scene** as sanitized SVG, size-limited.
- **Shapes and paths only.**

## Decision
- **`@scada3d/asset-import`** (depends on nothing). `sanitizeSvg(text, limits?)` is a strict allow-list:
  - **Parser:** a small XML tokenizer; no DOM, no entity expansion.
  - **Kept:** `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`.
  - **Kept attributes:** geometry attributes; `transform`; `fill`, `stroke`, `stroke-width`, `opacity`, `fill-opacity`, `stroke-opacity`, `fill-rule`, and the same properties inside `style`. Colours are validated.
  - **Dropped, with a note:** `title`, `desc`, `metadata`, `text`/`tspan`, `defs`, `style` elements, unknown elements and unknown attributes.
  - **Rejected:**
    - `script`, `foreignObject`, `image`, `use`, `iframe`, `object`, `embed`, and animation elements;
    - any `on*` attribute, `href`/`xlink:href`, or a value containing `url(` or `javascript:`;
    - `<!DOCTYPE`, `<!ENTITY` and processing instructions other than the XML declaration;
    - CDATA;
    - malformed XML or path data.
  - **Limits** (defaults): 512 KiB, 5,000 elements, nesting depth 32, 20,000 path commands.
  - **Output:** a normalised model (`viewBox`, flattened shapes with composed transforms and styles), plus `toSvgMarkup(model)`, which writes clean markup from the model only. Sanitizing that markup again gives the same model.
- **Scene schema v3, additive** (like ADR-0006/0008): an optional `underlay: { svg, position: { x, z }, width, rotation, opacity }`.
  - `svg` is sanitized markup (≤ 512 KiB);
  - `width` is the drawing's width in metres (0 < w ≤ 1000), with height following the viewBox aspect;
  - `rotation` is in degrees about +Y;
  - `opacity` is 0–1.

  Core validates the structure and size. `SceneValidationOptions.validateUnderlay?(svg)` lets a host reject unsafe content (`INVALID_UNDERLAY`); the React import path passes `sanitizeSvg`. Files without `underlay` are unchanged.
- **Rendering:** the viewer sanitizes again, then draws the markup through an `<img>` (which never runs scripts or loads external resources) onto a canvas texture, on a plane at ground level. It cannot be picked or collide; it is display only.
- **Editor:** an "Underlay" section to import an `.svg`, set width, position, rotation and opacity, or remove it. Each change is one undo step. Notes list what was dropped.

## Alternatives rejected
- Sanitizing with DOMParser or DOMPurify: needs a DOM (Node consumers) or a new dependency; an allow-list over our own model is smaller to audit.
- Storing the original file: unsafe to re-render, and larger.
- Converting to three.js line geometry: much more code than part (a) needs; extrusion (part b) will build on the shape model.

## Tests
- Sanitizer: every rejected construct, entity bombs, limits, malformed input, dropped-element notes, style parsing, transform composition, colour validation, idempotence of `sanitize(toSvgMarkup(m))`, and fuzzing (never throws).
- Core: underlay validation, the hook, round trip.
- e2e: import, display, controls, save/reload, rejection messages.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the T-019 questions in the session.
