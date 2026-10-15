// Public API of @scada3d/simulation (ADR-0010). See docs/API.md; `api.test.ts` fails when the runtime surface changes.
export { createSimulation, MODEL, TANK } from './simulation.js';
export type { Feed, Simulation, SimulationNote, SimulationOptions, SimulationState } from './simulation.js';
