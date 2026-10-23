import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parseScene, sceneDigest, serializeScene, upgradeDimensions, type AlarmState, type Observation, type ScadaScene } from '@sakibcoolz/core';
import { catalogResolvers, legacyCatalogResolvers } from '@sakibcoolz/components';
import { Scada3DEditor, Scada3DViewer, ScadaRuntime, type CommandRequest, type CommandStatus } from '@sakibcoolz/react';
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

// The runtime (ADR-0028, ADR-0029): the same line as an approved version 4 document, with a level
// variable bound to the tank and a writable valve command, pinned by revision and digest.
const approved: ScadaScene = {
  ...initial,
  project: { name: 'Consumer line', revision: '1' },
  dataSources: [{ id: 'gw', protocol: 'host', endpointRef: 'host:gateway' }],
  runtimeVariables: [
    { id: 'LT-1.PV', componentId: 'tank', dataType: 'float32', unit: '%', access: 'read', source: { dataSourceId: 'gw' } },
    { id: 'XV-1.CMD', name: 'Valve command', componentId: 'valve', dataType: 'bool', access: 'readWrite', source: { dataSourceId: 'gw' }, command: { confirm: 'Opens or closes the outlet valve.' } },
  ],
  tagBindings: [{ id: 'b-level', tagId: 'LT-1.PV', kind: 'property', instanceId: 'tank', property: 'level', unit: '%' }],
};
const approvedText = serializeScene(approved);
const expected = { revision: '1', digest: sceneDigest(approved) };
const alarms: AlarmState[] = [{ id: 'LAH-1', componentId: 'tank', severity: 'high', message: 'Level high', active: true }];

/** A stand-in host feed: fresh GOOD values every second, so nothing goes stale. */
function useFeed(): Observation[] {
  const make = (): Observation[] => {
    const sourceTimestamp = new Date().toISOString();
    return [{ tagId: 'LT-1.PV', value: 82, quality: 'GOOD', sourceTimestamp, dataType: 'float32', unit: '%' }, { tagId: 'XV-1.CMD', value: true, quality: 'GOOD', sourceTimestamp, dataType: 'bool' }];
  };
  const [observations, setObservations] = useState(make);
  useEffect(() => {
    const timer = setInterval(() => setObservations(make()), 1000);
    return () => clearInterval(timer);
  }, []);
  return observations;
}

function Runtime() {
  const observations = useFeed();
  const [requests, setRequests] = useState<CommandRequest[]>([]);
  const [status, setStatus] = useState<Record<string, CommandStatus>>({});
  const onCommandRequest = (request: CommandRequest) => {
    // A real host authorizes, audits and writes through its gateway; this one only records and answers.
    setRequests((list) => [...list, request]);
    setStatus((s) => ({ ...s, [request.requestId]: { state: 'accepted', message: 'recorded by the example host' } }));
  };
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', height: '100%' }}>
      <ScadaRuntime scene={approvedText} expected={expected} telemetry={{ observations }} alarms={alarms} onCommandRequest={onCommandRequest} commandStatus={status} />
      <ul aria-label="Requests received by the host" style={{ margin: 0, padding: '4px 24px', fontSize: 12 }}>
        {requests.map((r) => <li key={r.requestId}>{r.tagId} = {String(r.value)} (revision {r.sceneRevision}, digest {r.sceneDigest.slice(0, 12)})</li>)}
      </ul>
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<'viewer' | 'editor' | 'process' | 'runtime'>('viewer');
  const [scene, setScene] = useState(initial);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', height: '100%' }}>
      <header style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Consumer example</strong>
        <button aria-pressed={mode === 'viewer'} onClick={() => setMode('viewer')}>Viewer</button>
        <button aria-pressed={mode === 'editor'} onClick={() => setMode('editor')}>Editor</button>
        <button aria-pressed={mode === 'process'} onClick={() => setMode('process')}>Process</button>
        <button aria-pressed={mode === 'runtime'} onClick={() => setMode('runtime')}>Runtime</button>
        <span aria-label="Component count">{scene.components.length} components</span>
      </header>
      <main style={{ minHeight: 0 }}>
        {mode === 'runtime' ? <Runtime /> : mode === 'viewer' ? <Scada3DViewer scene={scene} /> : mode === 'editor' ? <Scada3DEditor initialScene={scene} onChange={setScene} /> : <ProcessView scene={scene} editable onChange={setScene} style={{ height: '100%' }} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
