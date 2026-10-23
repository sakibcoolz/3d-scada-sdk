import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEmptyScene, sceneDigest, serializeScene, validateScene, type ScadaScene } from '@sakibcoolz/core';
import { controlLibrary, createComponentRegistry } from '@sakibcoolz/components';
import { Scada3DEditor, Scada3DViewer, ScadaRuntime, ScadaWorkspace, type ScadaHandle, type WorkspaceLayout } from '@sakibcoolz/react';
import { demoScene, demoTagRows, generatedScene } from './demo';
import { useDemoFeed } from './DemoFeed';
import { useDemoAlarms } from './DemoAlarms';
import { useSimulation } from './SimulationPanel';
import { exampleTypes } from './customTypes';
import { controlScene, controlTagRows } from './controlDemo';

const params = new URLSearchParams(location.search);
// `?generate=N` loads the named benchmark scene "chain-N" with a live flow feed (see docs/PERFORMANCE.md).
const generated = params.has('generate') ? generatedScene(Math.max(2, Math.min(5000, Number(params.get('generate')) || 200))) : undefined;
// `?simulate` runs the demo plant through the simulator instead of the demo tag feed (ADR-0010);
// `?simulate=hydraulic` starts with the hydraulic model (ADR-0011).
const simulate = params.has('simulate');
// The playground opts in to the control library (ADR-0025), so any file it exports loads again;
// `?custom` adds example host types on top (ADR-0022).
const registry = createComponentRegistry(...controlLibrary, ...(params.has('custom') ? exampleTypes : []));
// `?control` opens the PLC → VFD → Motor → pump demo built from the control library.
// `?runtime` shows the control demo in the locked runtime (ADR-0028), pinned to its approved revision
// and digest, with demo host alarms; `?runtime=tampered` passes an altered copy, and `&revision=N`
// expects another revision.
const runtime = params.has('runtime');
const control = params.has('control') || runtime;
const simulateModel = params.get('simulate') === 'hydraulic' ? 'hydraulic' : 'mass-balance';
const demo = params.has('demo') || generated !== undefined || simulate || control;
// `?collisions=off` shows the host switch for the default-on collision highlight.
const collisions = params.get('collisions') !== 'off';
// `?locked` starts the editor in view-only mode.
const defaultLocked = params.has('locked');
// `?instancing=off|always` overrides the automatic equipment instancing (T-046).
const instancing = (['off', 'always'] as const).find((m) => m === params.get('instancing')) ?? ('auto' as const);
// `?joints=off` hides flanges, bolts and weld beads (ADR-0015).
const joints = params.get('joints') !== 'off';
// `?floor=off` starts without the floor slab (T-061).
const floorDefault = params.get('floor') !== 'off';
// `?layout=3d|process|electrical|split` opens the workspace: the editor with the 2D process and
// electrical views over one scene and one selection (ADR-0026). `?view=process|electrical` is the
// split layout with that diagram beside 3D.
const layouts: WorkspaceLayout[] = ['3d', 'process', 'electrical', 'split'];
const viewParam = params.get('view');
const workspaceLayout = layouts.find((l) => l === params.get('layout')) ?? (viewParam === 'process' || viewParam === 'electrical' ? 'split' : undefined);
const workspaceDiagram = viewParam === 'electrical' ? 'electrical' : 'process';

// `?demo` opens the MVP demo network, validated like any imported scene, with a demo tag feed.
function initialScene(): ScadaScene | undefined {
  if (!demo) return undefined;
  const result = validateScene(generated?.scene ?? (control ? controlScene : demoScene), registry.resolvers);
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

const start = initialScene();

/** The runtime demo's approval record and document, computed once like a host's approval step. */
function runtimeDocument(): { text: string; expected: { revision: string; digest: string } } | undefined {
  if (!runtime || !start) return undefined;
  const approved: ScadaScene = { ...start, project: { name: 'Demo line', revision: '1' } };
  const expected = { revision: params.get('revision') ?? '1', digest: sceneDigest(approved) };
  const shown = params.get('runtime') === 'tampered' ? { ...approved, components: approved.components.map((c, i) => (i === 0 ? { ...c, position: { ...c.position, x: c.position.x + 1 } } : c)) } : approved;
  return { text: serializeScene(shown), expected };
}
const runtimeDemo = runtimeDocument();

function App() {
  const [scene, setScene] = useState<ScadaScene>(start ?? createEmptyScene());
  const { telemetry, panel } = useDemoFeed(scene, generated?.rows ?? (control ? controlTagRows : demo && !simulate ? demoTagRows : {}));
  const simulation = useSimulation(scene, simulate, simulateModel);
  const demoAlarms = useDemoAlarms();
  const [mounted, setMounted] = useState(true);
  const [second, setSecond] = useState(false);
  const [floor, setFloor] = useState(floorDefault);
  const editor = useRef<ScadaHandle>(null);
  const editorRef = (handle: ScadaHandle | null) => {
    editor.current = handle;
    (window as unknown as { __scadaEditor: ScadaHandle | null }).__scadaEditor = handle;
  };
  const editorProps = {
    registry,
    initialScene: scene,
    onChange: setScene,
    telemetry: demo && !simulate ? telemetry : undefined,
    simulation: simulation.state,
    collisions,
    defaultLocked,
    instancing,
    joints,
    floor,
    walkthrough: true,
  };
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', background: '#0b1725', color: 'white', fontFamily: 'system-ui' }}>
        <b>3D SCADA SDK</b> <span style={{ opacity: 0.6 }}> / R&D Playground</span>
      </header>
      {demo && !generated && !simulate && panel}
      {runtimeDemo && demoAlarms.panel}
      {simulation.panel}
      <div style={{ display: 'flex', gap: 14, padding: '4px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12 }}>
        <label><input type="checkbox" aria-label="Mount editor" checked={mounted} onChange={(e) => setMounted(e.target.checked)} /> Mount editor</label>
        <label><input type="checkbox" aria-label="Second viewer" checked={second} onChange={(e) => setSecond(e.target.checked)} /> Second viewer</label>
        <label><input type="checkbox" aria-label="Floor" checked={floor} onChange={(e) => setFloor(e.target.checked)} /> Floor</label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mounted && runtimeDemo ? (
          <ScadaRuntime scene={runtimeDemo.text} expected={runtimeDemo.expected} registry={registry} telemetry={editorProps.telemetry} alarms={demoAlarms.alarms} defaultLayout={workspaceLayout ?? '3d'} />
        ) : mounted && (workspaceLayout ? (
          <ScadaWorkspace {...editorProps} defaultLayout={workspaceLayout} defaultDiagram={workspaceDiagram} editorRef={editorRef} />
        ) : (
          <Scada3DEditor {...editorProps} ref={editorRef} />
        ))}
      </div>
      {second && (
        <div style={{ height: 220, borderTop: '1px solid #3c5366' }}>
          <Scada3DViewer scene={scene} telemetry={demo ? telemetry : undefined} viewMode="glass" floor={floor} registry={registry} />
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
