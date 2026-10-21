# ADR-0018: Horizontal and spherical tanks, pool, and braced stands (tank family 2)

Status: Accepted (owner, 2026-10-16); implemented in T-054, T-055 and the pool part of T-056

## Context
The owner shared images of a horizontal tank, a small spherical tank, a pool, and cross-braced stands under horizontal and vertical tanks, and asked for 3D components (ADR-0017 is family 1). The elevated tank was not in these images and stays in T-056.

## Decision
- **New kinds:** `horizontalTank`, `sphericalTank` and `pool`, added to `componentKinds` (core).
  - All three are level- and temperature-bindable, with flanged nozzles (`jointStyle`), `nozzleSize` and `capacityUnit`.
  - Each plate shows its capacity.
- **Horizontal tank** (corrected after owner review):
  - Shell along X: `diameter` 0.6–6 m (default 2) and straight `length` 1–20 m (default 3).
  - ASME flanged-and-dished (torispherical) heads: crown radius D, knuckle 0.06 D, depth about 0.169 D. Weld seams where the heads meet the shell.
  - Two saddles just inside the seams cradle the shell. Each stands on two legs (z = ±0.6 R) reaching `standHeight` 0.3–3 m (default 0.6) below the shell, X-braced front and back.
  - Inlet on top 0.4 m from the −X seam. Outlet out of the +X head 0.75 R below the axis, so the tank drains low.
  - The capacity plate is flat on the middle of the front. A full-height sight glass (1.7 R) stands on two brackets at the +X end.
- **Spherical tank:**
  - Sphere `diameter` 1–10 m (default 2.4) on four legs that meet it at the equator and reach `standHeight` 0.2–3 m (default 0.5) below it.
  - Inlet on top; outlet out to +X at 0.7 R below the equator.
- **Pool:**
  - Open basin standing on its floor: `length` 2–50 m, `width` 1–30 m and `depth` 0.5–5 m (default 6 × 3 × 1.2 m), with 0.15 m walls and floor.
  - Inlet through the −X wall 0.25 m below the rim; outlet through the +X wall 0.3 m above the floor.
  - The plate is on the front wall; there is no gauge.
- **Braced stands:** a vertical tank stand of 0.3 m or more gets an X brace on each side (8 struts).
- **Geometry** (components):
  - `lathe` takes an optional `axis`.
  - New `strut` part (a rod from one point to another).
  - Any part can be flagged `holds`, meaning its inside holds the vessel's liquid.
- **Volume:**
  - `vesselProfile(parts)` covers vertical walls and dished heads (`vesselSegments`) exactly, as before.
  - Parts that `holds` are integrated over 1024 horizontal slices: a horizontal lathe by its chord widths, a sphere by π(R² − y²), a box by its plan area.
  - Plain cylinders and boxes keep an exactly proportional level.
  - `capacityOf` and `vesselOf` (simulation) use the profile.
- **Rendering** (react):
  - Horizontal and spherical liquids are drawn by cutting the liquid shape at the level and capping it flat (`cutBelow`, for convex meshes). They are rebuilt per 0.1 % of level.
  - Basin liquids scale from the floor.
  - Vessels with these liquids stay out of instancing, like lathe vessels.

## Consequences
- Files that use the new kinds cannot be opened by SDK versions before this one.
- Vertical tanks with stands draw 8 more shell parts. The view-mode and tank-stand e2e counts change from 13 to 21.

## Tests
- Components:
  - ports, shells, bounds and parameters for each kind; the horizontal tank's F&D head depth, seams, saddles, plate and gauge placement;
  - capacity against closed forms (cylinder plus two F&D heads of about 0.0809 D³, (4/3)πR³, the box interior), and half volume at half height;
  - plate texts;
  - brace counts, and struts inside the bounds.
- Simulation: level and volume agree for each kind; a horizontal tank fills fastest at mid height.
- React: `cutBelow` volumes for a box and a sphere, plus the empty and whole cases.
- e2e: add all three (no collisions, plates, liquids); change the horizontal tank's length and diameter while it stays on the floor.

## Date / Approvers
2026-10-16 / owner request with images (sakibcoolz); follows ADR-0017's answers (dimension parameters, computed capacity).
