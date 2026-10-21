# @sakibcoolz/react

**React Three Fiber viewer and editor** for industrial 3D SCADA scenes, part of the [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk). Drop-in components that render a plant from a scene built with [`@sakibcoolz/core`](https://www.npmjs.com/package/@sakibcoolz/core) and [`@sakibcoolz/components`](https://www.npmjs.com/package/@sakibcoolz/components).

```sh
npm install @sakibcoolz/react @sakibcoolz/core @sakibcoolz/components three @react-three/fiber @react-three/drei react react-dom
```
React 19 · ESM only · TypeScript types included · MIT

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
Give the parent element a height; the canvas fills it.

## `Scada3DViewer`
Read-only 3D view. Main props:
- `scene` — the scene to draw (required).
- `viewMode` — `'normal' | 'glass' | 'xray' | 'cutaway'`; `viewOverrides` per component.
- `selectedId`, `onSelect(id, { additive })`.
- `telemetry` — live values: `{ observations }` or `{ provider }` (tag → value, quality, timestamp); stale and bad values are shown as unknown.
- `flow` — flow readings per connection (animated beads).
- `simulation` — `{ levels, flows, model }` from [`@sakibcoolz/simulation`](https://www.npmjs.com/package/@sakibcoolz/simulation); shown with a SIMULATED badge.
- `collisions`, `openJoints`, `joints` (flanges, bolts, welds) — default `true`; `instancing` — `'auto'` (from 100 components), `'off'`, `'always'`.
- `ref` → `ScadaHandle` with `setTagValues([...])` for pushing live values.

## `Scada3DEditor`
Everything in the viewer plus a full editor: component palette with presets, drag-and-drop with port snapping, Shift+click attach, move/rotate gizmo and numeric transform, Properties panel (sizes, dimensions, stands, capacity unit, valve state, tag bindings), routed pipes, open-joint seating, collision warnings, copy/paste, assemblies, undo/redo, SVG underlay, scene import/export.
- `initialScene`, `onChange(scene)` — the editor owns its state and reports every change.
- `locked` / `defaultLocked` / `onLockedChange` — view-only mode.
- Same `telemetry`, `flow`, `simulation`, `collisions`, `openJoints`, `joints`, `instancing`, `ref` props as the viewer.
- Restyle with CSS custom properties on `.scada3d-editor` (`--s3-bg`, `--s3-accent`, …).

## Other exports
`viewModes`, `importSceneText` (parse, validate and upgrade a pasted or uploaded scene file), `formatSceneErrors`, `MAX_SCENE_FILE_BYTES`; types `ScadaHandle`, `TelemetryInput`, `FlowInput`, `ViewMode`, `TransformMode`, `SceneImport`.

## Safety
Display only: the components never write tags or control equipment, and live values never change the scene passed to `onChange`.

Full API reference: [docs/API.md](https://github.com/sakibcoolz/3d-scada-sdk/blob/develop/docs/API.md) · Working app: [examples/consumer-vite](https://github.com/sakibcoolz/3d-scada-sdk/tree/develop/examples/consumer-vite) · Licence: MIT
