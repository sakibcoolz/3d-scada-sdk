import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEmptyScene, validateScene, type ScadaScene } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';
import { Scada3DEditor } from '@scada3d/react';
import { demoFlowRows, demoScene } from './demo';
import { useDemoFlow } from './FlowPanel';

const demo = new URLSearchParams(location.search).has('demo');

// `?demo` opens the MVP demo network, validated like any imported scene, with a demo flow feed.
function initialScene(): ScadaScene | undefined {
  if (!demo) return undefined;
  const result = validateScene(demoScene, { resolvePorts: (type) => componentCatalog[type].ports });
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

const start = initialScene();

function App() {
  const [scene, setScene] = useState<ScadaScene>(start ?? createEmptyScene());
  const { flow, panel } = useDemoFlow(scene, demo ? demoFlowRows : {});
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 20px', background: '#0b1725', color: 'white', fontFamily: 'system-ui' }}>
        <b>3D SCADA SDK</b> <span style={{ opacity: 0.6 }}> / R&D Playground</span>
      </header>
      {demo && panel}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Scada3DEditor initialScene={start} onChange={setScene} flow={demo ? flow : undefined} />
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
