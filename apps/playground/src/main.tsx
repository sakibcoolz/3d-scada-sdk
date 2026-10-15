import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEmptyScene, validateScene, type ScadaScene } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';
import { Scada3DEditor, Scada3DViewer, type ScadaHandle } from '@scada3d/react';
import { demoScene, demoTagRows, generatedScene } from './demo';
import { useDemoFeed } from './DemoFeed';

const params = new URLSearchParams(location.search);
// `?generate=N` loads the named benchmark scene "chain-N" with a live flow feed (see docs/PERFORMANCE.md).
const generated = params.has('generate') ? generatedScene(Math.max(2, Math.min(5000, Number(params.get('generate')) || 200))) : undefined;
const demo = params.has('demo') || generated !== undefined;
// `?collisions=off` shows the host switch for the default-on collision highlight.
const collisions = params.get('collisions') !== 'off';
// `?locked` starts the editor in view-only mode.
const defaultLocked = params.has('locked');

// `?demo` opens the MVP demo network, validated like any imported scene, with a demo tag feed.
function initialScene(): ScadaScene | undefined {
  if (!demo) return undefined;
  const result = validateScene(generated?.scene ?? demoScene, { resolvePorts: (type) => componentCatalog[type].ports, resolveBindable: (type) => componentCatalog[type].bindable });
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

const start = initialScene();

function App() {
  const [scene, setScene] = useState<ScadaScene>(start ?? createEmptyScene());
  const { telemetry, panel } = useDemoFeed(scene, generated?.rows ?? (demo ? demoTagRows : {}));
  const [mounted, setMounted] = useState(true);
  const [second, setSecond] = useState(false);
  const editor = useRef<ScadaHandle>(null);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', background: '#0b1725', color: 'white', fontFamily: 'system-ui' }}>
        <b>3D SCADA SDK</b> <span style={{ opacity: 0.6 }}> / R&D Playground</span>
      </header>
      {demo && !generated && panel}
      <div style={{ display: 'flex', gap: 14, padding: '4px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12 }}>
        <label><input type="checkbox" aria-label="Mount editor" checked={mounted} onChange={(e) => setMounted(e.target.checked)} /> Mount editor</label>
        <label><input type="checkbox" aria-label="Second viewer" checked={second} onChange={(e) => setSecond(e.target.checked)} /> Second viewer</label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mounted && (
          <Scada3DEditor
            ref={(handle) => {
              editor.current = handle;
              (window as unknown as { __scadaEditor: ScadaHandle | null }).__scadaEditor = handle;
            }}
            initialScene={scene}
            onChange={setScene}
            telemetry={demo ? telemetry : undefined}
            collisions={collisions}
            defaultLocked={defaultLocked}
          />
        )}
      </div>
      {second && (
        <div style={{ height: 220, borderTop: '1px solid #3c5366' }}>
          <Scada3DViewer scene={scene} telemetry={demo ? telemetry : undefined} viewMode="glass" />
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
