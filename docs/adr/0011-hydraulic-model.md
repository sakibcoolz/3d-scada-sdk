# ADR-0011: Hydraulic simulation model (pressure, friction, pump curves)

Status: Accepted (owner, 2026-10-16); implemented in T-022

## Context
`mass-balance` v1 (ADR-0010) drains tanks by Torricelli's law straight to atmosphere. It has no friction, no back-pressure, no elevation differences between the ends, fixed-rate pumps, and equal tee splits. T-022 adds an optional model with pressure and losses, built on assumptions the owner has confirmed.

## Owner decisions
- **Fluid:** water at 20 °C. **Pipe:** commercial steel. **Friction:** Darcy–Weisbach, with fixed, documented constants.
- **Fittings:** standard K-factors.
- **Pumps:** quadratic curve from a shut-off head and one design point.
- **Networks:** branching trees solved exactly; loops are reported, not solved.

## Decision
- Same package. `createSimulation(scene, { model: 'hydraulic', … })` selects model `hydraulic` v1; `mass-balance` v1 stays the default and is unchanged.
- **Constants (`HYDRAULIC`):**
  - g = 9.81 m/s²;
  - ρ = 998 kg/m³, μ = 1.0 mPa·s, so ν = μ/ρ;
  - roughness ε = 0.045 mm.
- **Friction factor:**
  - f = 64/Re for Re < 2000;
  - Swamee–Jain f = 0.25 / log10(ε/3.7D + 5.74/Re^0.9)² for Re > 4000 (an explicit approximation of Colebrook–White);
  - linear between 2000 and 4000.
- **Minor losses** h = K·v²/2g:

  | Fitting | K |
  |---|---|
  | Open ball valve | 0.05 |
  | 90° elbow | 0.3 |
  | Bend of a routed run | 0.3 |
  | Tee | 0.1 per run leg (0.2 straight through), 1.0 on the branch leg |
  | Reducer | 0.5·(1 − d²/D²)², on the small-end velocity, either direction |
  | Liquid leaving a tank into a pipe | 0.5 |
  | Liquid entering a tank | 1.0 |
  | Free outlet (exit loss) | 1.0 |

- **Lengths:**
  - pipe and coupler: the distance between their ports (their validated `length`);
  - valve body: 1.2 m;
  - elbow: centreline π/2·0.3 m;
  - tee: 1 m per leg;
  - reducer and coupler: their length;
  - routed run between ports: its routed length at the port bore.
- **Pumps:**
  - curve H(Q) = H₀ − a·Q², with a = (H₀ − H_d)/Q_d², from `{ shutoffHead, design: { rate, head } }`;
  - flow passes suction → discharge only (built-in check valve);
  - a stopped pump blocks;
  - no NPSH or cavitation model.
- **Boundaries and unknowns:**
  - tank ports with liquid above them have known head = the liquid surface elevation (world y);
  - a tank port with no liquid above it only accepts inflow;
  - a free port is atmosphere at its elevation and only lets liquid out;
  - tees and fed free ports are unknown-head nodes;
  - a feed at a free port injects its rate there, or straight into the tank at a tank port.
- **Solve:**
  - every chain of two-port parts between two of those points is one link with a monotonic head-loss function;
  - nodal heads are solved by Gauss–Seidel bisection, warm-started each step; each link flow is found by bisection on its loss function;
  - a cycle among unknown nodes is reported (`loop`) and its links carry no flow;
  - a feed with no way out is reported (`blocked`) and not counted.
- **Time:** quasi-steady. Each step solves the network for the current levels, then integrates the volumes with explicit Euler (default step 0.5 s). Levels are clamped 0–100 %, with overflow counted as spilled.
- **Assumptions:** tanks are upright; no water hammer, compressibility or two-phase flow. Results are SIMULATED.

## Alternatives rejected
- A general looped Newton solver: chosen against by the owner for now. Can be added later behind the same model API.
- Configurable fluid and roughness: deferred; the constants are exported for review.

## Tests
- Friction factor against Colebrook–White over the catalog's ε/D (DN50–DN200): within 2 % for Re ≥ 4000 (measured worst 1.9 %, just above the transition), and within 1 % for Re ≥ 3·10⁴.
- A single gravity line against an independent energy-equation solution.
- Two tanks equalising their surface elevations, and backflow.
- The pump operating point against the system curve.
- Tee splits by resistance; closed valves; one-way free ends; loops reported; blocked feeds; conservation; determinism.
- The `mass-balance` v1 tests are unchanged.

## Date / Approvers
2026-10-16 / accepted by repository owner (sakibcoolz) via the T-022 questions in the session.
