# ADR-0010: Optional mass-balance simulation package

Status: Accepted (owner, 2026-10-15); implemented in T-021

> Note (2026-10-22, T-070): the packages were published as `@sakibcoolz/*` from 0.1.1 (T-059, ADR-0019 amendment). The `@scada3d/*` names in this record are historical.

## Context
The architecture plans an optional, deterministic simulator whose results are always labelled SIMULATED and kept apart from measured values (ARCHITECTURE §1 invariant 3, §8). The flow resolver already understands `source: 'SIMULATED'` readings. Nothing yet produces them except the playground's hand-typed feed.

## Owner decisions
- A **new optional package `@scada3d/simulation`**.
- **Gravity drain plus sources**:
  - tank outlets drain by gravity through open valves;
  - feeds and running pumps add set rates;
  - a tee splits equally across open branches;
  - levels follow the mass balance.
- A **new `simulation` prop** on the viewer and editor carries the simulator's state. No tag bindings are needed, and the saved scene is never changed.

## Decision
- **Package:** `@scada3d/simulation` depends on `@scada3d/core` and `@scada3d/components` (tank dimensions and port heights come from the catalog). It has no React, three.js or DOM dependency, so it runs in Node and in browsers. Hosts that do not simulate never install it.
- **API:** `createSimulation(scene, options)` returns `{ state(), step(seconds), update(scene), reset() }`. The host owns the clock and calls `step`; nothing runs on its own.
- **Model `mass-balance` v1:**
  - **Tanks:** cylindrical, radius 1 m, height 3 m. Volume = π r² h; level % = 100·h / 3.
  - **Gravity drain:** a tank port below the liquid surface drains q = Cd·A·√(2 g Δh) through an open path, where Cd = 0.62, A is the port bore area, g = 9.81 m/s² and Δh is the liquid height above the port. It discharges to atmosphere: no back-pressure, no backflow, no friction.
  - **Network:**
    - pipes, elbows, couplers and reducers pass flow through;
    - a valve passes when `open` is not false;
    - a tee splits flow equally across its other ports that have an open onward path;
    - a pump passes only suction → discharge;
    - a free port spills to atmosphere;
    - a tank port receives the flow;
    - a cycle counts as blocked.
  - **Sources set by the host:**
    - `feeds` (a rate entering at a free port);
    - `pumps` (rate per pump id while running). A pump draws its rate from the tank its suction reaches, and delivers nothing (reported as `dry`) when that tank cannot supply it.
  - **Integration:** explicit Euler, fixed step (default 0.1 s, sub-stepped). Levels are clamped to 0–100 %. Inflow into a full tank is counted as spilled (`overflow`). A forced flow with no open path is reported as `blocked`.
- **Output:** `SimulationState` carries:
  - `time`;
  - `levels` (percent by tank id);
  - `flows` (`FlowReading`s with `source: 'SIMULATED'`, `quality: 'GOOD'`, sign + = from→to);
  - `totals` (fed, spilled, stored, m³);
  - `notes` (dry, blocked, overflow);
  - `model: { name: 'mass-balance', version: 1 }`.
- **Viewer and editor:** `simulation?: { levels?, flows?, model? }`. While it is set:
  - tank levels and connection flows are drawn from it;
  - `telemetry` and `flow` are not mixed in for those values, so measured and simulated values never combine;
  - a "SIMULATED" badge names the model.

## Alternatives rejected
- Simulator inside core: every consumer would ship physics code it does not use.
- Simulated telemetry through tag bindings: nothing could be simulated before tags were bound.
- Hydraulic network solve (pressures, friction, pump curves): this is T-022, which needs validated assumptions first.

## Tests
- Volume conservation (fed = Δstored + spilled) over long runs.
- Drain-down against the analytic Torricelli solution.
- Valve gating, equal tee split, pump direction and dry suction, blocked feeds, overflow, cycles.
- `update` keeps levels across topology edits; determinism.
- e2e: playground simulation drives level and violet flow, and the badge shows the model.

## Date / Approvers
2026-10-15 / accepted by repository owner (sakibcoolz) via the simulation questions in the session.
