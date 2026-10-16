// Public API of @scada3d/simulation (ADR-0010, ADR-0011). See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { createSimulation, MODEL } from './simulation.js';
export { frictionFactor, HYDRAULIC } from './hydraulic.js';
export { TANK } from './shared.js';
export { vesselOf } from './vessels.js';
export type { Vessel } from './vessels.js';
export type { Feed, PumpCurve, Simulation, SimulationNote, SimulationOptions, SimulationState } from './shared.js';
