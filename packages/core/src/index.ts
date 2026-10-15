// Public API of @scada3d/core. Everything not listed here is internal. See docs/API.md;
// `api.test.ts` fails when the runtime surface changes.

// Scene model and units
export { SCENE_SCHEMA_VERSION, componentKinds, createEmptyScene, portsCompatible } from './scene';
export type {
  ComponentDefinition,
  ComponentInstance,
  ComponentKind,
  ConnectionPort,
  PortKind,
  QuaternionLike,
  QuaternionTuple,
  Quantity,
  ScadaScene,
  SceneConnection,
  TagBinding,
  Vector3Like,
  Vector3Tuple,
} from './scene';
export { canonicalUnits, isKnownUnit, toCanonical } from './units';

// Validation, persistence and migration
export { defaultSceneLimits, validateScene } from './validation';
export type { SceneLimits, SceneValidationError, SceneValidationErrorCode, SceneValidationOptions, SceneValidationResult } from './validation';
export { parseScene, serializeScene } from './serialization';
export type { ParseSceneOptions } from './serialization';

// Transforms
export { identityQuaternion, quaternionFromEuler, quaternionToEuler, rotateVector } from './rotation';
export { portToWorld } from './transforms';
export type { ComponentTransform, WorldPort } from './transforms';

// Connections: snapping, graph, routing
export { findSnapCandidates, snapComponent } from './snapping';
export type { SnapCandidate, SnapOptions, SnapResult, SnapStatus } from './snapping';
export { connect, connectedGroups, connectionsOf, disconnect, reachableComponents, removeComponent } from './graph';
export type { GraphError, GraphErrorCode, GraphOptions, GraphResult } from './graph';
export { routeConnection, routeScene, sampleRouteCenterline } from './routing';
export type { PipeRoute, RouteBend, RouteFailure, RouteKind, RoutingOptions } from './routing';

// Assemblies: parent/child locks for rigid editing (ADR-0008)
export { assemblyOf, lockConnectedAsChildren, moveAssembly, unlockFromParent } from './assembly';
export type { AssemblyResult } from './assembly';

// Copy and paste of components and assemblies
export { clipboardWidth, copyComponents, pasteComponents } from './clipboard';
export type { ComponentClipboard } from './clipboard';

// Turning exactly touching ports into explicit connections (user-triggered)
export { connectTouchingPorts, findTouchingPorts } from './touching';
export type { ConnectTouchingResult, TouchingMatch, TouchingOptions, TouchingRejection, TouchingResult } from './touching';

// Connections whose ports do not meet, and seating a part back onto its partner
export { findOpenJoints, seatOnConnection } from './joints';
export type { JointOptions, OpenJoint, SeatResult } from './joints';

// Solid-body overlap (display only)
export { findCollisions } from './collision';
export type { CollisionOptions, CollisionPair, CollisionResult } from './collision';

// Read-only observations: flow, telemetry, host data input
export { resolveFlow } from './flow';
export type { FlowDirection, FlowOptions, FlowReading, FlowResolution, FlowState, FlowUnknownReason, Quality, ValueSource } from './flow';
export type { FreshnessOptions } from './observation';
export { displayScene, resolveTelemetry } from './telemetry';
export type { Observation, PropertyState, TelemetryOptions, TelemetryResolution, TelemetryUnknownReason } from './telemetry';
export { connectProvider, createObservationStore } from './dataInput';
export type { DataProvider, ObservationStore } from './dataInput';
