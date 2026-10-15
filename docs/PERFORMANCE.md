# Performance baseline (MVP, T-023 part D)

**Status:** measured baseline, not a promise. No frame-rate target is claimed for the MVP. Re-run on the target hardware before quoting numbers.

## How to reproduce
- Core: `pnpm bench` (vitest bench over `packages/core/src/scene.bench.ts`).
- Browser: `pnpm perf` (Playwright, `playwright.perf.config.ts`, `perf/frame-time.perf.ts`); writes `test-results/perf.json` with CPU and GPU strings.
- Leaks: `e2e/leaks.spec.ts` runs in the normal `pnpm test:e2e` suite and asserts GPU geometry/texture counts are unchanged after 5 remounts and after editing churn (10 add/remove cycles, every view mode, flow quality changes).

## Named scenes
- **demo:** playground `?demo`, 6 components, 5 connections, 7 tag bindings, live flow on 4 routes.
- **chain-N:** N valves in a zig-zag (every route has two bends), each connection bound to a flow tag. Core benchmarks generate it in `scene.bench.ts`; the browser uses playground `?generate=N` with every flow tag fed 1 m³/s so all markers animate.

## Environment (2026-10-15)
12th Gen Intel Core i7-12700 (20 logical cores), 62 GB RAM, Linux 6.12, Node v22.23.2, pnpm 9.15.4, vitest 4.1.11, Playwright 1.64.1 Chromium **headless with SwiftShader** (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`): WebGL is rasterised on the CPU, so browser frame times are a pessimistic floor, not representative of a hardware GPU. **Hardware-GPU browser measurement: NOT RUN.**

## Core (mean time per call, ms)
| Operation | chain-100 | chain-1000 |
|---|---:|---:|
| validateScene (incl. 199 / 1999 bindings) | 0.186 | 1.94 |
| serializeScene | 0.120 | 1.40 |
| parseScene (parse + validate) | 0.341 | 3.76 |
| routeScene | 0.551 | 8.32 |
| resolveFlow | 0.022 | 0.232 |
| resolveTelemetry | 0.038 | 0.465 |
| snapComponent (one dragover) | 0.072 | 0.726 |
| connect (one edge, revalidates scene) | 0.176 | 1.94 |

All operations scale roughly linearly with scene size. `routeScene` runs on every scene change; at 1,000 components it costs about half a 60 Hz frame.

## Browser (3 s sample after 1.5 s warm-up, SwiftShader)
| Scene | Frames | Median frame | p95 | JS heap | Geometries | Draw calls / frame | Triangles / frame |
|---|---:|---:|---:|---:|---:|---:|---:|
| demo | 181 | 16.7 ms | 16.7 ms | 12.1 MB | 29 | 34 | 4,510 |
| chain-200 | 39 | 83.3 ms | 83.4 ms | 57.5 MB | 281 | 286 | 406,598 |
| chain-1000 | 10 | 349.9 ms | 350 ms | 242.2 MB | 1,081 | 1,086 | 2,032,838 |

The demo runs at the display rate (vsync-limited). Large scenes are CPU-rasterisation bound here: about one draw call per mesh and about 2,000 triangles per valve.

## Rendering scale, part A (T-029, 2026-10-15)
Changes:
- **Flow beads:** one instanced mesh per colour/opacity for the whole scene, instead of one per route. Positions are written in place each frame (`pointAtInto`), with no per-frame allocation.
- **Pipe runs:** each routed run is merged into one mesh (`createRouteGeometry`), and all runs share one material per view mode.
- **Port markers:** markers on free ports only, all in one instanced mesh (8×6 sphere).
- **Equipment geometry:** shared per catalog definition, reference-counted and disposed when the last user unmounts.

Scene objects in chain-1000 fell from 11,146 to 5,005.

### Hardware GPU (owner's machine, Apple M2, Chrome 154, ANGLE Metal, 75 Hz display, production build)
Frame times are from `requestAnimationFrame` sampling over 3 s after a 6 s warm-up, in a visible tab:

| Scene | Before: median / p95 / frames in 3 s | After: median / p95 / frames in 3 s |
|---|---|---|
| demo | 13.3 / 14.3 ms / 227 | 13.3 / 15.1 ms / 206–218 |
| chain-200 | 13.3 / 13.4 ms / 226 | not re-measured (was already at display rate) |
| chain-1000 | 26.6–40 / 40–67 ms (first runs); 13.4 / 26.8 ms (later runs) / 76–173 | **13.3 / 13.5–13.9 ms / 222–223** |
| chain-3000 | 40 / 173 ms / 43, worst 908 ms | **13.3 / 13.7 ms / 198** |
| chain-5000 | — | 13.3 / 66.6 ms / 161 (equipment-bound: 20,000 part meshes) |

Further measurements:
- **Steady-state demo comparison:** 12 s after warm-up, two runs per build. Both builds rendered 901/901 frames with no frame over 25 ms (worst 16–20 ms).
- **Isolated stalls:** occasional 100 ms–3 s stalls showed up in **both** builds during or just after page load. They are not attributable to this change.
- **chain-1000 before the change, by layer:** the time inside the animation-frame callbacks was 33 ms per frame, so the scene was CPU-bound. Removing any one layer (flow markers, equipment or pipe runs) brought it back to the display rate.
- **JS heap** in these runs is not reliable: it grew across reloads in one tab, and background tabs do not render.

### Headless (SwiftShader, same machine as the baseline above)
| Scene | Heap before → after | Geometries | Draw calls / frame | Triangles / frame |
|---|---|---|---|---|
| demo | 12.8 → 12.1 MB | 29 → 21 | 34 → 26 | 4,510 → 3,670 |
| chain-200 | 64.8 → 35.6 MB | 281 → 28 | 286 → 58 | 406,598 → 437,750 |
| chain-1000 | 227.9 → 117.3 MB | 1,081 → 28 | 1,086 → 58 | 2,032,838 → 2,063,990 |

SwiftShader frame times stay rasterisation-bound (chain-1000: 333 → 350 ms median), because triangle counts are about the same. The win shows on real GPUs, where the CPU was the limit.

## Findings and follow-ups
- **Fixed in this part:** drei `TransformControls` built a new gizmo (17 geometries plus materials) on every selection and never disposed it, leaking GPU memory with each selection change. The viewer now disposes the gizmo on unmount; the leak test covers it.
- Each component instance builds its own geometry, and equipment is not instanced, so geometry and draw calls grow one-for-one with components. Candidate optimisations, to be measured before adoption: share geometry per catalog type, instance equipment meshes, lower segment counts or LOD for distant parts, and avoid per-frame tuple allocation in flow markers. Tracked as T-029 (post-MVP). Part A (above) shares geometry and instances markers; equipment instancing and LOD remain (T-046): at chain-5000 the 20,000 equipment meshes are the limit on the M2 (p95 67 ms).
