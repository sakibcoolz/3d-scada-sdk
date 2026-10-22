import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEmptyScene, validateScene, type ScadaScene } from '@sakibcoolz/core';
import { catalogResolvers } from '@sakibcoolz/components';
import { Scada3DEditor, Scada3DViewer, type ScadaHandle } from '@sakibcoolz/react';
import { demoScene, demoTagRows, generatedScene } from './demo';
import { useDemoFeed } from './DemoFeed';
import { useSimulation } from './SimulationPanel';
import { exampleRegistry } from './customTypes';
import { controlRegistry, controlScene, controlTagRows } from './controlDemo';

const params = new URLSearchParams(location.search);
// `?generate=N` loads the named benchmark scene "chain-N" with a live flow feed (see docs/PERFORMANCE.md).
const generated = params.has('generate') ? generatedScene(Math.max(2, Math.min(5000, Number(params.get('generate')) || 200))) : undefined;
// `?simulate` runs the demo plant through the simulator instead of the demo tag feed (ADR-0010);
// `?simulate=hydraulic` starts with the hydraulic model (ADR-0011).
const simulate = params.has('simulate');
// `?custom` adds an example host component type through the registry (ADR-0022).
// `?control` opens the PLC → VFD → Motor → pump demo built from the control library (ADR-0025).
const control = params.has('control');
const registry = control ? controlRegistry : params.has('custom') ? exampleRegistry : undefined;
const simulateModel = params.get('simulate') === 'hydraulic' ? 'hydraulic' : 'mass-balance';
const demo = params.has('demo') || generated !== undefined || simulate || control;
// `?collisions=off` shows the host switch for the default-on collision highlight.
const collisions = params.get('collisions') !== 'off';
// `?locked` starts the editor in view-only mode.
const defaultLocked = params.has('locked');
// `?instancing=off|always` overrides the automatic equipment instancing (T-046).
const instancing = (['off', 'always'] as const).find((m) => m === params.get('instancing')) ?? 'auto';
// `?joints=off` hides flanges, bolts and weld beads (ADR-0015).
const joints = params.get('joints') !== 'off';
// `?floor=off` starts without the floor slab (T-061).
const floorDefault = params.get('floor') !== 'off';

// `?demo` opens the MVP demo network, validated like any imported scene, with a demo tag feed.
function initialScene(): ScadaScene | undefined {
  if (!demo) return undefined;
  const result = validateScene(generated?.scene ?? (control ? controlScene : demoScene), registry?.resolvers ?? catalogResolvers);
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

const start = initialScene();

function App() {
  const [scene, setScene] = useState<ScadaScene>(start ?? createEmptyScene());
  const { telemetry, panel } = useDemoFeed(scene, generated?.rows ?? (control ? controlTagRows : demo && !simulate ? demoTagRows : {}));
  const simulation = useSimulation(scene, simulate, simulateModel);
  const [mounted, setMounted] = useState(true);
  const [second, setSecond] = useState(false);
  const [floor, setFloor] = useState(floorDefault);
  const editor = useRef<ScadaHandle>(null);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', background: '#0b1725', color: 'white', fontFamily: 'system-ui' }}>
        <b>3D SCADA SDK</b> <span style={{ opacity: 0.6 }}> / R&D Playground</span>
      </header>
      {demo && !generated && !simulate && panel}
      {simulation.panel}
      <div style={{ display: 'flex', gap: 14, padding: '4px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12 }}>
        <label><input type="checkbox" aria-label="Mount editor" checked={mounted} onChange={(e) => setMounted(e.target.checked)} /> Mount editor</label>
        <label><input type="checkbox" aria-label="Second viewer" checked={second} onChange={(e) => setSecond(e.target.checked)} /> Second viewer</label>
        <label><input type="checkbox" aria-label="Floor" checked={floor} onChange={(e) => setFloor(e.target.checked)} /> Floor</label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mounted && (
          <Scada3DEditor
            registry={registry}
            ref={(handle) => {
              editor.current = handle;
              (window as unknown as { __scadaEditor: ScadaHandle | null }).__scadaEditor = handle;
            }}
            initialScene={scene}
            onChange={setScene}
            telemetry={demo && !simulate ? telemetry : undefined}
            simulation={simulation.state}
            collisions={collisions}
            defaultLocked={defaultLocked}
            instancing={instancing}
            joints={joints}
            floor={floor}
            walkthrough
          />
        )}
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
