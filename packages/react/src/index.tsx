// Public API of @sakibcoolz/react: the viewer, the editor, the workspace, their prop and handle types,
// and scene import helpers. Editor internals (drop planning, history, visual helpers) stay private.
// See docs/API.md. The viewer and the editor live in separate modules; the viewer never imports the
// editor (ADR-0028).
export { formatSceneErrors, importSceneText, MAX_SCENE_FILE_BYTES, type SceneImport } from './sceneFile.js';
export { viewModes, type ViewMode } from './appearance.js';
export { Scada3DViewer } from './viewer.js';
export type { FlowInput, InstancingMode, ScadaHandle, SelectHandler, SimulationInput, TelemetryInput, TransformHandler, TransformMode, WalkPlacing } from './viewer.js';
export { Scada3DEditor } from './editor.js';

// One document, several views (ADR-0026).
export { ScadaWorkspace } from './workspace.js';
export type { ScadaWorkspaceProps, WorkspaceLayout } from './workspace.js';

// The locked runtime: an approved document, view only (ADR-0028).
export { ScadaRuntime } from './runtime.js';
export type { RuntimeLayout, ScadaRuntimeProps } from './runtime.js';
export type { ApprovalRecord, RuntimeRefusal } from './approval.js';
export type { CommandRequest, CommandState, CommandStatus } from './commands.js';
// Host-supplied alarms and status per component (ADR-0028); defined in core, re-exported for runtime hosts.
export type { AlarmSeverity, AlarmState, ComponentStatus, StatusResult } from '@sakibcoolz/core';
