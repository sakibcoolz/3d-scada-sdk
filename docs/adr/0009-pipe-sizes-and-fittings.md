# ADR-0009: Pipe sizes, reducer and coupler in scene version 3

Status: Accepted (owner, 2026-10-15); implemented in T-045

## Context
Every fluid port was DN150. The owner asked for a fitting that connects pipes and components of different sizes, and for one that fills a small gap along a pipe line. Core already refuses to join ports of different `nominalSize` (`portsCompatible`, `INCOMPATIBLE_PORTS`), so sizes need no new connection rules, only sized parts.

## Owner decisions
- Add a **reducer** (two different sizes) and a **coupler** (short sleeve, equal sizes, adjustable length).
- Sizes **DN50, DN80, DN100, DN150, DN200**.
- **Pipe, elbow, tee and valve** get a size choice, as do the fittings. Tank and pump nozzles stay DN150; a reducer steps down from them.
- Stored as an **optional size property**, without a version bump.

## Decision
- New component kinds `reducer` and `coupler` (additive to `componentKinds`). Older SDKs reject a file that uses them (`UNKNOWN_COMPONENT_TYPE`); files without them are unchanged.
- `properties.size` on pipe, elbow, tee, valve, reducer and coupler, one of `"DN50" | "DN80" | "DN100" | "DN150" | "DN200"`. **Absent means DN150**, so every existing scene loads and draws exactly as before and stays `schemaVersion: 3` (in line with ADR-0006 and ADR-0008: additive, no release yet). New parts store `size` only when it is not DN150.
- Reducer: `size` is the inlet, `outletSize` the outlet; they must differ. Default DN150 → DN100; 0.3 m long (two 0.05 m stubs and a 0.2 m cone). Coupler: `size` and `length` (0.05–0.2 m, default 0.1 m); a pipe-sized bore with a wider sleeve band in the middle.
- Port `nominalSize` is the nominal bore in metres (DN/1000); unchanged meaning, so DN150 stays 0.15. Drawn outer diameters follow the steel-pipe series: 60.3, 88.9 and 114.3 mm for DN50–DN100, and 219.1 mm for DN200. DN150 keeps the existing 168 mm (`pipeOuterRadius` 0.084) so current scenes do not change by a fraction of a millimetre.
- Fixed dimensions across sizes: pipe length, tee run 2 m and branch 1 m, valve body 1.2 m, elbow bend radius 0.3 m. Changing size therefore never moves a port. The valve's ball, stem and handle scale with the pipe diameter.
- Shape parameters gain a **choice** kind (`{ label, choices, default }`) beside the numeric kind; `validateProperties` reports values outside the choices and a reducer whose sizes are equal.
- Geometry gains a `cone` part (frustum along an axis, `radiusStart` at the −axis end and `radiusEnd` at the +axis end).
- Editor: a Size dropdown, shown as a choice parameter. A change that would leave a connection between different sizes is refused with an explanation (disconnect it, or put a reducer between). A part dropped onto a port takes that port's size when it has a size choice. Routed pipe runs and flow beads are drawn at the size of their ports.

## Alternatives rejected
- Schema version 4 with migration: the same content with more ceremony; old files need no migration because absent means DN150.
- Sizing by free numeric diameter: invites near-miss sizes that never connect; a fixed series matches real pipe.
- Auto-inserting reducers on size mismatch: hides a design decision and changes the topology without the user asking (ADR-0002).

## Tests
Components: size table, every sized definition (ports and parts at the right size, bounds, ports unchanged by size), reducer and coupler geometry, choice validation, equal-size reducer refused, default scene unchanged, guards for every joint size. Core: validation of the new kinds, size mismatch refused, sizes round-trip. React: cone geometry. e2e: size dropdown, refused change on a connected part, reducer between DN150 and DN100, coupler length, export/import.

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz) via the size/fitting questions in the session.
