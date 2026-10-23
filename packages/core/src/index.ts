// Public API of @sakibcoolz/core. Everything not listed here is internal. See docs/API.md;
// `api.test.ts` fails when the runtime surface changes.

// Scene model and units
export { SCENE_DOCUMENT_TYPE, SCENE_SCHEMA_VERSION, componentKinds, createEmptyScene, isBuiltInKind, isNamespacedType, isRelationship, relationshipKinds, dataTypes, modbusAreas, protocols, checkPorts, matesPhysically, portCapacity, portKinds, portsCompatible, powerKinds, signalTypes, viewKinds } from './scene.js';
export type {
  ComponentDefinition,
  VariableTemplate,
  ComponentInstance,
  ComponentKind,
  ComponentType,
  ConnectionPort,
  JsonValue,
  PortCheck,
  PortFlow,
  PortKind,
  PowerKind,
  SignalType,
  QuaternionLike,
  QuaternionTuple,
  Relationship,
  Quantity,
  ScadaScene,
  DataType,
  ModbusAddress,
  OpcUaAddress,
  Protocol,
  RuntimeVariable,
  SceneAssociation,
  SceneDataSource,
  VariableAddress,
  SceneConnection,
  SceneExtensions,
  SceneProject,
  SceneUnderlay,
  SceneViews,
  SymbolPlacement,
  TagBinding,
  Vector3Like,
  Vector3Tuple,
  ViewKind,
  ViewLayout,
  ViewRoute,
} from './scene.js';
export { canonicalUnits, isKnownUnit, toCanonical } from './units.js';

// Validation, persistence and migration
export { defaultSceneLimits, validateScene } from './validation.js';
export type { SceneLimits, SceneValidationError, SceneValidationErrorCode, SceneValidationOptions, SceneValidationResult } from './validation.js';
export { parseScene, serializeScene } from './serialization.js';
export { sceneDigest, sha256Hex } from './digest.js';
export type { ParseSceneOptions } from './serialization.js';

// Transforms
export { identityQuaternion, quaternionFromEuler, quaternionToEuler, rotateVector } from './rotation.js';
export { portToWorld } from './transforms.js';
export type { ComponentTransform, WorldPort } from './transforms.js';

// Connections: snapping, graph, routing
export { findSnapCandidates, snapComponent } from './snapping.js';
export type { SnapCandidate, SnapOptions, SnapResult, SnapStatus } from './snapping.js';
export { projectAcquisition } from './acquisition.js';
export { applyTagSuggestions, reviewTags, suggestVariables } from './tags.js';
export type { ApplyResult, SuggestOptions, TagFinding, TagFindingCode, TagSuggestions } from './tags.js';
export type { AcquisitionPlan, AcquisitionVariable } from './acquisition.js';
export { addAssociation, removeAssociation, connect, connectedGroups, connectionsOf, disconnect, neighbours, pathBetween, physicalDomains, reachableComponents, relatedComponents, removeComponent } from './graph.js';
export type { ConnectionFilter, GraphError, GraphErrorCode, GraphFilter, GraphOptions, GraphResult, GraphStep } from './graph.js';
export { routeConnection, routeScene, sampleRouteCenterline } from './routing.js';
export type { PipeRoute, RouteBend, RouteFailure, RouteKind, RoutingOptions } from './routing.js';

// Assemblies: parent/child locks for rigid editing (ADR-0008)
export { assemblyOf, lockConnectedAsChildren, moveAssembly, unlockFromParent } from './assembly.js';
export type { AssemblyResult } from './assembly.js';

// Copy and paste of components and assemblies
export { clipboardWidth, copyComponents, pasteComponents } from './clipboard.js';
export type { ComponentClipboard } from './clipboard.js';

// Turning exactly touching ports into explicit connections (user-triggered)
export { connectTouchingPorts, findTouchingPorts } from './touching.js';
export type { ConnectTouchingResult, TouchingMatch, TouchingOptions, TouchingRejection, TouchingResult } from './touching.js';

// Bringing scenes written with older component dimensions up to date (ADR-0014)
export { upgradeDimensions } from './upgrade.js';
export type { UpgradeOptions, UpgradeResult } from './upgrade.js';

// Attaching one part to another at their closest free ports (editor Shift+click)
export { attachComponents } from './attach.js';
export type { AttachOptions, AttachResult } from './attach.js';

// Connections whose ports do not meet, and seating a part back onto its partner
export { findOpenJoints, seatOnConnection } from './joints.js';
export type { JointOptions, OpenJoint, SeatResult } from './joints.js';

// Solid-body overlap (display only)
export { findCollisions } from './collision.js';
export type { CollisionOptions, CollisionPair, CollisionResult } from './collision.js';

// Read-only observations: flow, telemetry, host data input
export { resolveFlow } from './flow.js';
export type { FlowDirection, FlowOptions, FlowReading, FlowResolution, FlowState, FlowUnknownReason, Quality, ValueSource } from './flow.js';
export type { FreshnessOptions } from './observation.js';
export { displayScene, resolveTelemetry } from './telemetry.js';
export type { Observation, PropertyState, TelemetryOptions, TelemetryResolution, TelemetryUnknownReason } from './telemetry.js';
export { connectProvider, createObservationStore } from './dataInput.js';
export type { DataProvider, ObservationStore } from './dataInput.js';
