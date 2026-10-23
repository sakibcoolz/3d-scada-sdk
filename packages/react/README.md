# @sakibcoolz/react

**React Three Fiber viewer, editor, workspace and locked runtime** for industrial 3D SCADA scenes, part of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk). Drop-in components that render a plant from a scene built with [`@sakibcoolz/core`](https://www.npmjs.com/package/@sakibcoolz/core) and [`@sakibcoolz/components`](https://www.npmjs.com/package/@sakibcoolz/components).

```sh
npm install @sakibcoolz/react @sakibcoolz/core @sakibcoolz/components three @react-three/fiber @react-three/drei react react-dom
```
React 19 · ESM only · TypeScript types included · MIT · the 2D process and electrical views ([`@sakibcoolz/views-2d`](https://www.npmjs.com/package/@sakibcoolz/views-2d)) are a dependency and install automatically.

## Quick start

```tsx
import { useState } from 'react';
import { parseScene, type ScadaScene } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';
import { Scada3DEditor, Scada3DViewer } from '@sakibcoolz/react';

const loaded = parseScene(savedJson, catalogResolvers); // savedJson: your scene file text
if (!loaded.ok) throw new Error(loaded.errors[0].message);
const initial: ScadaScene = loaded.scene;

export function Plant() {
  const [scene, setScene] = useState<ScadaScene>(initial);
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ height: '100vh' }}>
      <button onClick={() => setEditing(!editing)}>{editing ? 'View' : 'Edit'}</button>
      {editing
        ? <Scada3DEditor initialScene={scene} onChange={setScene} />
        : <Scada3DViewer scene={scene} viewMode="glass" />}
    </div>
  );
}
```
Give the parent element a height; the canvas fills it. For host component types, pass the same `registry` (from `createComponentRegistry` in `@sakibcoolz/components`) to `parseScene` (as `registry.resolvers`) and to every component below.

## `Scada3DViewer`
Read-only 3D view. Main props:
- `scene` — the scene to draw (required); `registry` — component types (built-in kinds by default).
- `viewMode` — `'normal' | 'glass' | 'xray' | 'cutaway'`; `viewOverrides` per component.
- `selectedId`, `onSelect(id, { additive })`.
- `telemetry` — live values: `{ observations }` or `{ provider }` (tag → value, quality, timestamp); stale, bad and disconnected values are shown as unknown.
- `flow` — flow readings per connection (animated beads). Power, signal and network connections are drawn as straight wires.
- `simulation` — `{ levels, flows, model }` from [`@sakibcoolz/simulation`](https://www.npmjs.com/package/@sakibcoolz/simulation); shown with a SIMULATED badge.
- `collisions`, `openJoints`, `joints` (flanges, bolts, welds) — default `true`; `floor` — concrete slab, default `false`; `instancing` — `'auto'` (from 100 components), `'off'`, `'always'`.
- `walkthrough` — first-person Walk on the desktop and Enter VR on a WebXR headset (HTTPS); view only.
- `ref` → `ScadaHandle` with `setTagValues([...])` for pushing live values.

## `Scada3DEditor`
Everything in the viewer plus a full editor: component palette with presets, drag-and-drop with port snapping, Shift+click attach, move/rotate gizmo and numeric transform, Properties panel (sizes, dimensions, stands, capacity unit, valve state, tag bindings), a Ports inspector with wiring per domain (compatible ports only, connection details, disconnect), a Related panel for associations and neighbours, a **Tags…** dialog for data sources and runtime variables (address forms, scaling, suggestions, review), routed pipes, open-joint seating, collision warnings, copy/paste, assemblies, undo/redo, SVG underlay, scene import/export. Walkthrough mode keeps selection, connecting and placing parts.
- `initialScene`, `onChange(scene)` — the editor owns its state and reports every change.
- `locked` / `defaultLocked` / `onLockedChange` — view-only mode; `selectedIds` / `onSelectionChange` — controlled selection.
- Same `registry`, `telemetry`, `flow`, `simulation`, `collisions`, `openJoints`, `joints`, `floor`, `walkthrough`, `instancing`, `ref` props as the viewer.
- Restyle with CSS custom properties on `.scada3d-editor` (`--s3-bg`, `--s3-accent`, …).

## `ScadaWorkspace`
The editor and the 2D process and electrical diagrams side by side over one scene, with one shared selection. Takes the editor's props plus `layout` / `defaultLayout` / `onLayoutChange` (`'3d' | 'process' | 'electrical' | 'split'`, default split), `defaultDiagram`, `selectedIds` / `onSelectionChange`, `editorRef` and `style`. A symbol dragged in 2D is saved to `scene.views` and undoes like any other edit.

## `ScadaRuntime`
A locked operator view of an approved revision: 3D, process, electrical or split, with an information panel and an Attention list. It has no editing controls.

```tsx
<ScadaRuntime
  scene={approvedText}                     // scene text or parsed JSON
  expected={{ revision: '12', digest }}    // digest: sceneDigest(scene), recorded when the revision was approved
  registry={registry}
  telemetry={{ provider }}
  alarms={alarms}                          // AlarmState[] from the host's alarm system, displayed only
  onRefused={(refusal) => console.warn(refusal.code, refusal.message)}
/>
```
- A document that is invalid or does not match `expected` shows a refusal screen and calls `onRefused`.
- Each component shows its status (alarm, unknown, uncertain) in every view; the SDK never evaluates limits or acknowledges alarms.
- **Command requests (optional):** with `expected.digest` set, `onCommandRequest` lets an operator request a change to a `readWrite` variable through a form and a confirmation. The SDK calls `onCommandRequest(CommandRequest)` once and never writes; `commandStatus` (by `requestId`) shows the host's answer as given. Requests are refused while the reading is unknown or simulated, and the shown value changes only when telemetry does.

## Other exports
`viewModes`, `importSceneText` (parse, validate and upgrade a pasted or uploaded scene file), `formatSceneErrors`, `MAX_SCENE_FILE_BYTES`; types `ScadaHandle`, `TelemetryInput`, `FlowInput`, `SimulationInput`, `ViewMode`, `TransformMode`, `SceneImport`, `ScadaWorkspaceProps`, `WorkspaceLayout`, `ScadaRuntimeProps`, `RuntimeLayout`, `ApprovalRecord`, `RuntimeRefusal`, `CommandRequest`, `CommandState`, `CommandStatus`, and the re-exported `AlarmState`, `AlarmSeverity`, `ComponentStatus`, `StatusResult`.

## Safety
Display only: the components never write tags, open connections or control equipment, and live values never change the scene passed to `onChange`. A command request is a callback to the host, which authorizes, audits, enforces limits and writes; the controller's interlocks stay authoritative.

Full API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md) · Host integration: [docs/RUNTIME_INTEGRATION.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/RUNTIME_INTEGRATION.md) · Working app: [examples/consumer-vite](https://github.com/sakibcoolz/3d-scada-sdk/tree/develop/examples/consumer-vite) · Licence: MIT
