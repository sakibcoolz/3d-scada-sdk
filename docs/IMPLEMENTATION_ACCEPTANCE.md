# Feature Acceptance Matrix

Purpose: executable expectations for agents. Every scenario must map to an automated fixture (unit/integration/E2E) before calling the feature complete.

| Feature | Input / action | Expected outcome | Failure or boundary test |
|---|---|---|---|
| Port snap | drag pipe inlet near compatible tank outlet | visible preview, opposing normals aligned, exactly one persistent edge | mismatched bore, orientation or occupied port rejected without scene change |
| Connection editor | disconnect/reconnect valve | graph and visible route both update; undo restores exactly | removing tank removes dangling edges |
| Tee network | tank -> valve -> tee -> branches A/B | tee has 3 genuine ports, graph represents branching | cycles terminate graph traversal; crossing lines don't auto-connect |
| Routing | move connected equipment | deterministic regenerated straight/orthogonal/elbow mesh | constrained/blocked route marked invalid; zero-length handled |
| Flow | rate +5, 0, -5 and unknown | forward, stopped, reverse, unavailable visual state | valve 'open' without rate remains unknown |
| Level and thermal | level 0/50/100; temperature varying | correct interior water height and visual indicator | out-of-range values rejected/clamped according to documented policy |
| Glass/X-ray | toggle selected tank and global view | shell becomes see-through, internal contents still visible | material disposal and depth artifacts checked |
| Import/export | save linked rotated scene; reopen | identical component IDs, transforms and edges | malformed/oversized/unsupported schema fails clearly |
| Undo/redo | drag/rotate/connect then undo/redo | single atomic actions and exact saved states | history invalidated predictably on divergent edit |
| Transform gizmos | rotate connected valve 90° | world ports recalc and route refresh | no accidental orbit during gizmo drag |
| Physics lite | known inflow/outflow over timestep | volume conserved within specified tolerance | no 'actual physical' claim; no negative contents |
| SVG import | safe closed shape + template | reproducible 3D extrusion with separately assigned ports | scripts, remote refs, malformed SVG rejected |
| Host-driven data updates | no provider, static snapshot, push values, stale/out-of-order | standalone viewer works offline; bound values and quality update, old observation rejected | SDK creates no sockets; provider unsubscribes on unmount |
| Optional external OPC UA integration | host bridges tags and calls SDK input contract | renderer sees observations only | SDK has no OPC UA client/PLC writes or mandatory transport |
| Consumer SDK | independent React app installs built package | viewer/editor render without source workspace aliases | no dependence on Z-Factory or playground packages |
| Component designer: model (T-100..T-102) | add, transform, group and edit primitives; save; reopen | same tree, names, transforms and materials after reload; undo/redo exact | malformed, oversized or cyclic document refused with a code; existing editor and kinds unchanged |
| Component designer: factory editor (T-103) | compile a design with ports; register; place, connect and bind it | it snaps, routes and validates like a built-in kind; factory scene save/reload keeps type, ports and bindings | invalid ports or an unknown domain refused at registration |
| Component designer: motion (T-104) | motor shaft clip driven by synthetic `running` and `speed` | shaft turns while running, rate follows speed; survives save/reload | unknown or stale value stops the motion; simulated values labelled; no network opened |
| Component designer: GLB (T-105) | export a compiled design | GLB with geometry, materials and clips, plus a sidecar with type, ports and bindable | losses of the design tree documented; no remote resources in the file |

## Cross-cutting gates
Types/build/tests + browser smoke; accessibility keyboard/select basic paths; resource disposal on unmount; bounded animation allocations; adversarial JSON/asset tests; documented unit conversions; independent reviewer for safety/schema changes.

## Status
This file defines targets only. Features are **not validated or done** until evidence is recorded in WORK_LOG.md and linked from corresponding backlog task.
