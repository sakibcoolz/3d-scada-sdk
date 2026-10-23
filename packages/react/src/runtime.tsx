import React, { useEffect, useMemo, useState } from 'react';
import type { ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { ElectricalView, ProcessView } from '@sakibcoolz/views-2d';
import { Scada3DViewer, useNow, useTelemetry, useTelemetryFeed, type TelemetryInput } from './viewer.js';
import { checkApproval, type ApprovalRecord, type RuntimeRefusal } from './approval.js';
import { PortsInspector, RelationsExplorer } from './inspector.js';
import { describePorts } from './ports.js';
import { describeRelations } from './relations.js';
import { describeProperty } from './telemetryView.js';

// The locked runtime (ADR-0028): an approved document shown with live values, never changed. Built from
// the viewer and the 2D views only. This module must not import the editor, so no edit path exists here
// at all (a test checks the import graph). UI locks are not a security boundary; approval and access
// control are the host's.

export type RuntimeLayout = '3d' | 'process' | 'electrical' | 'split';

export interface ScadaRuntimeProps {
  /** The approved document, as scene text or parsed JSON. Changing it re-runs every check. */
  scene: string | object;
  /** The host's approval record; when given, a document that does not match is refused. */
  expected?: ApprovalRecord;
  registry?: ComponentRegistry;
  telemetry?: TelemetryInput;
  /** Controlled layout; without it the runtime keeps its own, starting at `defaultLayout` (default '3d'). */
  layout?: RuntimeLayout;
  defaultLayout?: RuntimeLayout;
  onLayoutChange?: (layout: RuntimeLayout) => void;
  /** Controlled selection, shared by every view. */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Called once per refused document, with the reason. */
  onRefused?: (refusal: RuntimeRefusal) => void;
  style?: React.CSSProperties;
}

const layouts: [RuntimeLayout, string][] = [['3d', '3D'], ['process', 'Process'], ['electrical', 'Electrical'], ['split', 'Split']];
const tab = (pressed: boolean): React.CSSProperties => ({ padding: '2px 10px', borderRadius: 3, border: '1px solid #3c5366', background: pressed ? '#2a5d8f' : '#132435', color: '#ebf2fa', cursor: 'pointer' });
const panel: React.CSSProperties = { width: 300, flex: 'none', overflowY: 'auto', padding: 12, background: '#0f1d2c', color: '#ebf2fa', borderLeft: '1px solid #3c5366', fontFamily: 'system-ui, sans-serif', fontSize: 13 };

/** What the operator sees when a document is refused: the reason, and nothing drawn. */
function Refused({ refusal, style }: { refusal: RuntimeRefusal; style?: React.CSSProperties }) {
  return (
    <div role="alert" aria-label="Runtime refused" style={{ padding: 24, background: '#2a1215', color: '#ffd7d9', fontFamily: 'system-ui, sans-serif', height: '100%', ...style }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>This plant view cannot be shown</h2>
      <p>{refusal.message}</p>
      <p style={{ opacity: 0.75, fontSize: 12 }}>Code: {refusal.code}. Ask the engineer responsible to publish an approved revision.</p>
    </div>
  );
}

function Information({ scene, id, registry, telemetry, onGo }: { scene: ScadaScene; id?: string; registry: ComponentRegistry; telemetry?: TelemetryInput; onGo: (id: string) => void }) {
  const now = useNow(1000);
  const live = useTelemetry(scene, telemetry, now, registry);
  const component = id ? scene.components.find((c) => c.id === id) : undefined;
  if (!component) return <aside aria-label="Information" style={panel}><p style={{ opacity: 0.7 }}>Select equipment to see its values and connections.</p></aside>;
  const bindable = registry.resolvers.resolveBindable(component.type) ?? {};
  const values = (live?.properties ?? []).filter((p) => p.instanceId === component.id);
  return (
    <aside aria-label="Information" style={panel}>
      <h2 style={{ fontSize: 15, margin: '0 0 2px' }}>{component.name ?? component.id}</h2>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>{registry.definitionFor(component.type, component.properties).label}</div>
      <h3 style={{ fontSize: 12, margin: '8px 0 4px', textTransform: 'uppercase', opacity: 0.8 }}>Live values</h3>
      {values.length === 0 ? <p style={{ opacity: 0.7, fontSize: 12 }}>No bound values.</p> : (
        <ul aria-label="Live values" style={{ fontSize: 12, paddingLeft: 16, margin: 0 }}>{values.map((p) => <li key={p.bindingId}>{describeProperty(p, bindable[p.property])}</li>)}</ul>
      )}
      <h3 style={{ fontSize: 12, margin: '12px 0 4px', textTransform: 'uppercase', opacity: 0.8 }}>Ports</h3>
      <PortsInspector key={`ports:${component.id}`} rows={describePorts(scene, component.id, registry)} onGo={onGo} />
      <h3 style={{ fontSize: 12, margin: '12px 0 4px', textTransform: 'uppercase', opacity: 0.8 }}>Related</h3>
      <RelationsExplorer key={`related:${component.id}`} relations={describeRelations(scene, component.id, registry)} onGo={onGo} />
    </aside>
  );
}

/** A read-only operator view of an approved document (ADR-0028): 3D and 2D, live values, no editing. */
export function ScadaRuntime({ scene: document, expected, registry = builtInRegistry, telemetry: telemetryInput, layout, defaultLayout = '3d', onLayoutChange, selectedIds, onSelectionChange, onRefused, style }: ScadaRuntimeProps) {
  const approval = useMemo(() => checkApproval(document, expected, registry.resolvers), [document, expected?.revision, expected?.digest, registry]);
  useEffect(() => {
    if (!approval.ok) onRefused?.(approval.refusal);
    // Report each refused document once, not on every render.
  }, [approval]);

  const [ownLayout, setOwnLayout] = useState(defaultLayout);
  const shown = layout ?? ownLayout;
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selection = selectedIds ?? ownSelection;
  const select = (ids: string[]) => {
    if (!selectedIds) setOwnSelection(ids);
    onSelectionChange?.(ids);
  };
  // One feed for the viewer, the diagrams and the panel.
  const telemetry = useTelemetryFeed(telemetryInput, undefined);

  if (!approval.ok) return <Refused refusal={approval.refusal} style={style} />;
  const scene = approval.scene;
  const diagram = { scene, registry, telemetry, selectedIds: selection, onSelectionChange: select, editable: false, style: { height: '100%' } };
  const show3d = shown === '3d' || shown === 'split';
  const show2d = shown === 'process' || shown === 'electrical' ? shown : shown === 'split' ? 'process' : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...style }}>
      <div role="toolbar" aria-label="Runtime layout" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 8px', background: '#0b1725', color: '#ebf2fa', fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>
        {layouts.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={shown === id} style={tab(shown === id)} onClick={() => { if (!layout) setOwnLayout(id); onLayoutChange?.(id); }}>{label}</button>
        ))}
        <span aria-label="Approved revision" style={{ marginLeft: 'auto', opacity: 0.8 }}>
          {scene.project?.name ? `${scene.project.name} · ` : ''}revision {scene.project?.revision ?? 'not set'}{expected?.digest ? ' · digest verified' : ''} · view only
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {show3d && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Scada3DViewer scene={scene} registry={registry} telemetry={telemetry} selectedId={selection.at(-1)} onSelect={(id) => select([id])} />
          </div>
        )}
        {show2d && (
          <div style={{ flex: 1, minWidth: 0, borderLeft: show3d ? '1px solid #3c5366' : undefined }}>
            {show2d === 'process' ? <ProcessView {...diagram} /> : <ElectricalView {...diagram} />}
          </div>
        )}
        <Information scene={scene} id={selection.at(-1)} registry={registry} telemetry={telemetry} onGo={(id) => select([id])} />
      </div>
    </div>
  );
}
