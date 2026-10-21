# ADR-0017: Tank dimensions, dished heads and capacity plates (tank family 1)

Status: Accepted (owner, 2026-10-16); implemented in T-053

## Context
The owner shared a catalogue of tank shapes and chose four things:
- all four new shapes, phased as T-053 to T-056;
- **dimension parameters** for the Large, Small and Short variants, with presets in the palette;
- the HP (flat-style) variants later, as a view mode (T-057);
- the **computed capacity on the name plate**.

Before this task, the vertical tank was fixed at 2 × 3 m with a flat top, the plate was blank, and the simulation read only the default shape.

## Decision
- **Dimensions:**
  - The vertical tank takes `diameter` (0.6–12 m, default 2) and `height` (straight shell, 0.8–20 m, default 3).
  - Both keep the bottom where it is when they change, like `standHeight`.
  - The defaults reproduce the original tank exactly, so older files are unchanged.
- **Geometry from the dimensions:**
  - Nozzles sit at ±(R + 0.2). The inlet is min(0.7, 0.25 H) below the top of the shell; the outlet is min(0.6, 0.2 H) above the bottom.
  - The gauge sits at R + 0.08 in front, with a column of H − 0.24.
  - Stand legs are at 0.75 R and thicken for tanks wider than 2 m.
- **Head:** `head` is `flat` (default) or `dished`. Dished is a 2:1 semi-ellipsoidal head, depth D/4, drawn as a 24-step `lathe` shell. The liquid follows it as a lathe, like the conical tank.
- **Capacity plate:**
  - Box parts take `text`. Tank plates show the geometric capacity, `capacityOf(parts)`, to three significant figures (`formatCapacity`).
  - `capacityUnit` is `m³` (default), `L` or `US gal`. The conical tank shows its capacity too.
  - React draws the text as a canvas texture. It is created per mesh and disposed on unmount, needs no new dependency, and works in both the per-component and instanced paths.
- **Volume:**
  - `vesselSegments(parts)` and `segmentVolume` (components) describe a vessel as frustums: open cylinders and cones, plus lathe heads between their profile points.
  - `vesselOf(type, properties?)` (simulation) now follows the component's own dimensions, cached per definition. The mass-balance and hydraulic models pass each tank's properties.
  - The level percentage is measured over the full liquid height, head included. It is exactly proportional to volume only for a plain cylinder, as before.
- **Presets:** `componentPresets` lists palette entries with starting properties:
  - Vertical Tank (Dished), (Large) and (Short), all dished;
  - Cylindrical Tank (Large) and (Small), flat.

  The editor palette lists them after the kinds, and both click and drag apply them.
- **Click-add spacing:** a new part is placed to the right of the right-most part's bounds, plus 0.3 m, or at the old 2.4 m spacing, whichever is further. Large tanks therefore don't overlap.

## Consequences
- New tanks record `diameter` and `height` in their properties, because new parts start with every numeric parameter.
- Dished tanks use lathe parts, so they are not instanced (the same as conical tanks).

## Tests
- Default geometry is unchanged; scaling of ports, bounds, shell and gauge at three sizes; dished head and liquid; stand and nozzle size together with the dimensions; invalid values rejected.
- Capacity: integration, formatting (five cases), the plate text in each unit.
- Presets are valid.
- `vesselOf` follows the dimensions and the dished head; a bigger tank fills more slowly in the simulation.
- e2e: the Large preset, diameter and unit changes, and all presets added without overlaps.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the tank family questions.
