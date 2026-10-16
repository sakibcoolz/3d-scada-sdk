# ADR-0015: Flanged and welded joints (ASME phase 2)

Status: Accepted (owner, 2026-10-16); implemented in T-051

## Context
Phase 2 of the owner's industry-standard request (ADR-0014). Joints were bare touching ends. The owner chose "flanged and welded by part type".

## Decision
- **Joint style** (`jointStyle`): **flanged** when either side is a valve, pump, vertical tank or conical tank; **welded** otherwise (pipe, elbow, tee, reducer, coupler).
- A routed run counts as pipe at both ends. Every long-radius bend in a run gets a weld at each end of the bend. A free port of a flanged part shows a single flange.
- **Flanges:** ASME B16.5 Class 150 weld-neck (`asmeFlange`), with values as published in common tables:

  | Size | OD | Thickness | Raised face | Bolt circle | Bolts | Hub X | Y |
  |---|---|---|---|---|---|---|---|
  | DN50 | 152.4 mm | 19.1 mm | 92.1 mm | 120.7 mm | 4 × 15.9 mm | 77.7 mm | 63.5 mm |
  | DN80 | 190.5 mm | 23.9 mm | 127 mm | 152.4 mm | 4 × 15.9 mm | 108 mm | 69.9 mm |
  | DN100 | 228.6 mm | 23.9 mm | 157.2 mm | 190.5 mm | 8 × 15.9 mm | 134.9 mm | 76.2 mm |
  | DN150 | 279.4 mm | 25.4 mm | 215.9 mm | 241.3 mm | 8 × 19.1 mm | 192 mm | 88.9 mm |
  | DN200 | 342.9 mm | 28.6 mm | 269.9 mm | 298.5 mm | 8 × 19.1 mm | 246.1 mm | 101.6 mm |

  The raised-face height is 1.6 mm, and the bolts straddle the centre lines. **These values must be verified against the standard; the SDK is not a certified design tool** (as in ADR-0014).
- **Weld bead:** a ring at the pipe surface on the joint plane, with tube radius max(3 mm, 0.6 × the Sch 40 wall).
- **Geometry** (components, framework-free): `flangePairParts`, `flangeParts` and `weldParts` in a joint frame, with +X along the first port and the raised faces meeting at x = 0. New part shape `ring`; new roles `flange`, `bolt` and `weld`.
- **Rendering** (react):
  - `jointPlacements` computes a world frame per joint.
  - `JointHardware` draws one instanced mesh per part of each style and size, chunked spatially (≤ 256 instances) so off-screen hardware is culled. Bolts use 6-sided cylinders and flanges 16-sided ones.
  - Detail drops with joint count: above 2,000 joints no bolts; above 8,000 only the flange rings.
  - Display only: the hardware cannot be picked and never moves a port.
  - The viewer and editor take `joints?: boolean` (default true); the playground accepts `?joints=off`.
- **Routed runs** bend like ASME long-radius elbows. `RoutingOptions.bendRadiusFor(nominalSize)`, provided by `catalogResolvers`, gives 1.5 × NPS (B16.9 A) for the run's size.

## Measurements
- Apple M2, Chrome: no measurable cost.
  - chain-1000: 372 frames in 5 s with joints, 376 without.
  - chain-5000: 370 with, 372 without (375 is the display rate).
- Headless software rendering (SwiftShader), chain-200: 6.0 fps with joints and 9.0 without. The cost there is CPU rasterising the large flange discs, not draw calls (a few dozen).

## Tests
- The flange table; style rules (both orders); pair geometry (rings, raised faces at x = 0, bolt count, circle and length, hub taper); single flange; weld bead.
- Placements: a valve–pipe pair with its free-end single flange; pipe–elbow weld; routed run ends plus two bend welds; nothing for unroutable joints.
- Routing `bendRadiusFor`.
- e2e: hardware counts on a pipe–valve–pipe–pipe line; `?joints=off`; joint meshes counted separately in the render-scale test.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the standards questions (ADR-0014).
