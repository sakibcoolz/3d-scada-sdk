# ADR-0016: Valve face-to-face and nozzle sizes (ASME phase 3)

Status: Accepted (owner, 2026-10-16); implemented in T-052

## Context
This is the last phase of the owner's industry-standard request (ADR-0014, ADR-0015). Before it:
- the ball valve was a 1.2 m body at every size, about four times a real DN150 Class 150 valve;
- tank and pump nozzles were fixed at DN150, so a smaller line needed a reducer at every vessel.

## Decision
- **Valve face-to-face:** the ball valve follows ASME B16.10 Class 150, short pattern, raised face (`asme[size].valveFaceToFace`). The ports sit on the raised faces, F apart, so the B16.5 flange pairs from ADR-0015 meet there.

  | Size | DN50 | DN80 | DN100 | DN150 | DN200 |
  |---|---|---|---|---|---|
  | F | 178 mm | 203 mm | 229 mm | 267 mm | 292 mm |

  These values are as published in common tables. **They must be verified against the standard; the SDK is not a certified design tool.**
- **Valve body:** everything fits within F.
  - Ball radius: min(0.45 F, 1.6 × pipe radius).
  - Stem: 0.3 F long.
  - Lever: 0.9 F long; it lies along the pipe when open and turns 90° when closed (unchanged).
  - Valve ports now move with size, like the ASME fittings.
- **Nozzle sizes:** the ports stay where they are; only their size and the drawn nozzle change.
  - Vertical and conical tanks take `nozzleSize`, which applies to both nozzles.
  - The pump takes `suctionSize` and `dischargeSize`.
  - All three are choices of DN50–DN200, defaulting to DN150, so existing files are unchanged.
- **Snapping a dropped part:** `sizeParameterFor(type, portId)` names the choice that sizes a port. These are:
  - `size` on most sized parts;
  - `outletSize` on the reducer outlet;
  - `nozzleSize` on vessels;
  - `suctionSize` and `dischargeSize` on the pump.

  When a dropped part snaps to a port of another size, only that parameter is set. For example, a pump dropped on a DN100 outlet gets `suctionSize: 'DN100'`.
- **Older files:**
  - `legacyCatalogResolvers` now also returns the 1.2 m valve ports.
  - `upgradeDimensions` lets each side of a joint be in either generation, old or current, so a file saved after T-050 (current fittings, old valves) is handled.
  - Joints that already meet carry the parts after them along. `findTouchingPorts` counts a pair found twice as one pair.
  - The editor's import message is now "Updated N parts to ASME dimensions."
- **Hydraulics:** valve flow length is the face-to-face from geometry. `HYDRAULIC.lengths` is removed.

## Consequences
- Lines with valves get much shorter: each DN150 valve is 0.933 m shorter. The upgrade closes these lines up on load. Joints that were already broken stay where they were, so their gaps grow. In the owner's open-joints fixture, for example, 1.14 m becomes 2.08 m.
- A valve dropped on the ground sits 0.12 m up instead of 0.2 m, because the ball is smaller.

## Tests
- B16.10 values and port spacing per size; ball, stem and lever within F.
- `nozzleSize` on both tanks, together with the stand; the pump's own sizes; ports fixed; an invalid choice is rejected.
- `sizeParameterFor`; a pump dropped on a DN100 outlet.
- Mixed-generation upgrade, in core and with the catalog. An older scene-file import that says so.
- e2e specs updated for the shorter valve.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the standards questions (ADR-0014).
