# ADR-0013: Conical tank, vessel shapes and lathe liquids

Status: Accepted (owner request, 2026-10-16); implemented in T-048

## Context
The owner asked for a conical-bottom tank like a reference image: a cylindrical body over a cone, a level sight glass and a name plate. The catalog had one cylindrical tank. The renderer drew liquid only as a vertically scaled cylinder, and both simulation models hard-coded that cylinder.

## Decision
- **New component kind `conicalTank`** (additive to `componentKinds`, as in ADR-0009; older SDKs reject files that use it).
  - **Body:** a 2 m cylindrical body (radius 1 m) over a 1 m cone.
  - **Legs:** three, reaching the ground 2.5 m below the body origin.
  - **Ports (DN150):** an `inlet` on top facing +Y; an `outlet` from the cone tip down through a 0.3 m-radius bend to a horizontal stub, facing +X, 0.4 m above the ground.
  - **Extras:** the shared front gauge (below).
  - **Bindings:** `level` and `temperature`.
- **Shared level gauge** (owner follow-up with a cylindrical-tank image): `levelGauge` adds, on both tanks' front centre (+Z, 1.08 m from the axis):
  - a glass tube (role `gauge`) with a liquid column that follows the level;
  - 11 ticks (role `scale`) every 10 %, longer at 0, 50 and 100 %;
  - a blank name plate (role `plate`) across the gauge.

  This changes the look of the Vertical Tank in existing scenes only: its ports, liquid, file format and simulation are unchanged. The ticks have no numbers (that needs a font).
- **Stand on every tank** (owner follow-up). Owner decisions: an adjustable height with a 0.8 m default, older scenes kept as they are, and snapping in plan view.
  - **Vertical tank:** a `standHeight` parameter (0–3 m) gives four legs (radius 0.05 m, 0.75 m from the axis) with feet. Ports never move.
  - **Older files:** an absent value means **no stand**, so older scenes look and behave exactly as before. New tanks start at 0.8 m (`NumberParameterSpec.initial`).
  - **Editing the height** keeps the lowest point in place (`keepsBottom`), so raising the stand lifts the tank.
  - **Conical tank:** keeps its fixed three legs.
- **Snap in plan view** (editor drop): if nothing is in 3D snap reach, a part dropped on the ground within 0.5 m in plan of a higher port is lifted to that port's height and snapped as usual (size matching still applies). Core `snapComponent` is unchanged.
- **Geometry:** cone parts may be `openEnded`. A new part shape `lathe` (a profile revolved about +Y) is used for the liquid. `liquidProfile(points, fraction)` cuts the inner-wall profile at the level height, so the liquid follows the cone. The viewer rebuilds the lathe per 0.1 % of level. Tanks with a lathe liquid are not instanced (ADR/T-046).
- **Level** stays a percent of the liquid **height** (as drawn), for every vessel.
- **Simulation:** `vesselOf(type)` derives a vessel's shape from its open cylinder and cone shell parts (volume at a height, height at a volume, port heights). Both models use it instead of one cylinder.
  - A conical tank drains from its tip (port height 0), so it empties completely.
  - The flat tank's results are unchanged; its cylinder path keeps exact volume ↔ percent.
- The name plate has no text: drawing text would need a font (a network fetch, or a bundled font plus a licence check). Left for later.

## Tests
- Catalog: ports, legs and clearance, parts, `liquidProfile` (empty, full, cut, narrow near the tip, clamping). The generic catalog, geometry and tee tests now include the new kind.
- Simulation: vessel shapes (exact cone volume, height round trip, port heights); drains completely where the flat tank stops at 20 %; falls faster near the tip; conservation; hydraulic drain.
- e2e: palette, legs on the ground, liquid and gauge following the level, a valve snapping to the outlet, simulated drain to empty.

## Date / Approvers
2026-10-16 / owner request with a reference image (sakibcoolz); defaults stated in the session.
