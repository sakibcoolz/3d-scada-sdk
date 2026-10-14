import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEmptyScene, validateScene, type ScadaScene } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';
import { Scada3DEditor, Scada3DViewer, type ScadaHandle } from '@scada3d/react';
import { demoScene, demoTagRows } from './demo';
import { useDemoFeed } from './DemoFeed';

const demo = new URLSearchParams(location.search).has('demo');

// `?demo` opens the MVP demo network, validated like any imported scene, with a demo tag feed.
function initialScene(): ScadaScene | undefined {
  if (!demo) return undefined;
  const result = validateScene(demoScene, { resolvePorts: (type) => componentCatalog[type].ports, resolveBindable: (type) => componentCatalog[type].bindable });
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

const start = initialScene();

function App() {
  const [scene, setScene] = useState<ScadaScene>(start ?? createEmptyScene());
  const { telemetry, panel } = useDemoFeed(scene, demo ? demoTagRows : {});
  const [mounted, setMounted] = useState(true);
  const [second, setSecond] = useState(false);
  const editor = useRef<ScadaHandle>(null);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', background: '#0b1725', color: 'white', fontFamily: 'system-ui' }}>
        <b>3D SCADA SDK</b> <span style={{ opacity: 0.6 }}> / R&D Playground</span>
      </header>
      {demo && panel}
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
