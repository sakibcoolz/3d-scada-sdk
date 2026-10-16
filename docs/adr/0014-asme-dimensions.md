# ADR-0014: ASME dimensions for pipe and fittings (phase 1)

Status: Accepted (owner, 2026-10-16); implemented in T-050

## Context
The owner asked for industry-standard connections: "should not feel like it is just working things". Before this change:
- the fitting dimensions were simplified: one 0.3 m elbow radius, a 2 m tee, a 0.3 m reducer;
- DN150 was drawn at 168 mm;
- joints were plain touching ends.

## Owner decisions
- Follow **ASME**.
- Joints: **flanged and welded by part type** (phase 2).
- Older scenes: **re-seat on load**.
- Deliver **in phases**:
  1. dimension tables and pipe, elbow, tee and reducer (this ADR);
  2. flanges and welds at joints;
  3. valves, pumps and tank nozzles.

## Decision
- **`asme` table** (components), in metres, per size:

  | Size | NPS | B36.10M OD | Sch 40 wall | B16.9 LR 90° elbow A | B16.9 tee C = M | B16.9 reducer H (by larger end) |
  |---|---|---|---|---|---|---|
  | DN50 | 2 | 60.3 mm | 3.91 mm | 76 mm | 64 mm | 76 mm |
  | DN80 | 3 | 88.9 mm | 5.49 mm | 114 mm | 86 mm | 89 mm |
  | DN100 | 4 | 114.3 mm | 6.02 mm | 152 mm | 105 mm | 102 mm |
  | DN150 | 6 | 168.3 mm | 7.11 mm | 229 mm | 143 mm | 140 mm |
  | DN200 | 8 | 219.1 mm | 8.18 mm | 305 mm | 178 mm | 152 mm |

  **Source and caveat:** these are values as published in commonly available ASME B36.10M and B16.9 tables. ASME standards are copyrighted, and the official tables were not consulted here. The values must be **verified by someone with access to the standard** before the SDK is relied on for engineering. The SDK is a visualisation and layout tool, **not a certified design tool**.
- **Pipe** is drawn at the B36.10M outside diameter at every size; DN150 goes from 168.0 to 168.3 mm, so `pipeOuterRadius` is 0.08415. Port `nominalSize` (used for matching) is unchanged.
- **Fittings:**
  - **Elbows** are long-radius: bend radius = centre-to-end A, with ports at A.
  - **Equal tees** have run and branch ends at C.
  - **Concentric reducers** are H long, by the larger end: 20 % straight at each end around a 60 % cone.

  Ports therefore move compared with older files. Couplers, pipes, valves, tanks and pumps are unchanged in this phase.
- **Older files:** core `upgradeDimensions(scene, { resolvePorts, resolveLegacyPorts })` re-seats every pair of ports that met under the old dimensions, whether connected or merely touching.
  - It walks each line outwards from its first part in scene order, so downstream parts follow (one part moved per seat, assemblies kept).
  - Deliberate gaps (routed runs) and connections are left alone.
  - Running it on a current scene changes nothing.
  - Components export `legacyCatalogResolvers` (old elbow/tee/reducer ports, used only for this).
  - The editor's file and text import runs it and reports "Updated N parts to ASME fitting sizes."
  - Hosts loading scenes another way can call it themselves.
- **Hydraulic model:** flow lengths now come from the real geometry: the elbow arc (π/2·A) and the tee legs (C). `HYDRAULIC.lengths` keeps only the valve body. Link flows below 1 µL/s are reported as zero (solver tolerance, e.g. a dead-end tee).
- **Routed runs** keep the router's 0.3 m bend radius. Making it follow 1.5D per size is phase 2.

## Consequences
- Scenes look tighter: a DN150 tee is 0.29 m across instead of 2 m. Layouts built with the old sizes open up where fittings shrank; upgraded joints stay closed, and gaps are filled by routed runs.
- A joint that was already broken in an older file (not touching) stays broken; the open-joint list shows it at its new distance.

## Tests
- The table for every size; pipe radius; long-radius check (A ≈ 1.5 × NPS).
- Elbow, tee and reducer ports per size.
- `upgradeDimensions`: connected line, touching unconnected parts, idempotence, deliberate gaps.
- The owner's legacy plant still gives 11 touching pairs and direct routes after upgrade.
- e2e: the load message, `Connect touching ports (11)`, and idempotent reload.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the standards questions in the session.
