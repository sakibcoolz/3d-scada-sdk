import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseScene, upgradeDimensions, type ScadaScene } from '@sakibcoolz/core';
import { catalogResolvers, legacyCatalogResolvers } from '@sakibcoolz/components';
import { Scada3DEditor, Scada3DViewer } from '@sakibcoolz/react';
import { ProcessView } from '@sakibcoolz/views-2d';

// A tank feeding a valve, a reducer and a DN100 pipe: authored as plain JSON, checked by the core.
const authored = {
  schemaVersion: 3,
  units: 'm',
  components: [
    { id: 'tank', type: 'tank', position: { x: 0, y: 1.535, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { level: 60 } },
    { id: 'valve', type: 'valve', position: { x: 1.8, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { open: true } },
    { id: 'reducer', type: 'reducer', position: { x: 2.55, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: {} },
    { id: 'pipe', type: 'pipe', position: { x: 3.7, y: 0.635, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, properties: { length: 2, size: 'DN100' } },
  ],
  connections: [
    { id: 'c1', from: { instanceId: 'tank', portId: 'outlet' }, to: { instanceId: 'valve', portId: 'in' } },
    { id: 'c2', from: { instanceId: 'valve', portId: 'out' }, to: { instanceId: 'reducer', portId: 'in' } },
    { id: 'c3', from: { instanceId: 'reducer', portId: 'out' }, to: { instanceId: 'pipe', portId: 'in' } },
  ],
};

const loaded = parseScene(JSON.stringify(authored), catalogResolvers);
if (!loaded.ok) throw new Error(loaded.errors.map((e) => e.message).join('\n'));
// The scene above was authored before ASME fitting sizes (ADR-0014). A host that loads saved scenes
// itself upgrades them, so joints that met under the old sizes meet again.
const initial: ScadaScene = upgradeDimensions(loaded.scene, { ...catalogResolvers, ...legacyCatalogResolvers }).scene;

function App() {
  const [mode, setMode] = useState<'viewer' | 'editor' | 'process'>('viewer');
  const [scene, setScene] = useState(initial);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', height: '100%' }}>
      <header style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Consumer example</strong>
        <button aria-pressed={mode === 'viewer'} onClick={() => setMode('viewer')}>Viewer</button>
        <button aria-pressed={mode === 'editor'} onClick={() => setMode('editor')}>Editor</button>
        <button aria-pressed={mode === 'process'} onClick={() => setMode('process')}>Process</button>
        <span aria-label="Component count">{scene.components.length} components</span>
      </header>
      <main style={{ minHeight: 0 }}>
        {mode === 'viewer' ? <Scada3DViewer scene={scene} /> : mode === 'editor' ? <Scada3DEditor initialScene={scene} onChange={setScene} /> : <ProcessView scene={scene} editable onChange={setScene} style={{ height: '100%' }} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
