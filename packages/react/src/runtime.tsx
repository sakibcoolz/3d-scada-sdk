import React, { useEffect, useMemo, useState } from 'react';
import { componentStatus, resolveVariableValues, type AlarmState, type ScadaScene, type StatusResult, type TelemetryResolution } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';
import { describeStatus, ElectricalView, ProcessView, statusColors } from '@sakibcoolz/views-2d';
import { Scada3DViewer, useNow, useTelemetry, useTelemetryFeed, type TelemetryInput } from './viewer.js';
import { checkApproval, type ApprovalRecord, type RuntimeRefusal } from './approval.js';
import { PortsInspector, RelationsExplorer } from './inspector.js';
import { describePorts } from './ports.js';
import { describeRelations } from './relations.js';
import { describeProperty } from './telemetryView.js';
import { describeAlarm, describeAttention, summarizeStatus } from './statusText.js';
import { Commands, useCommandSession } from './commandPanel.js';
import type { CommandRequest, CommandStatus } from './commands.js';

/** Host alarms are unbounded: the list of unlinked ones shows this many, then a count (T-096). */
const MAX_LISTED_ALARMS = 100;

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
  /**
   * Alarms from the host's alarm system, shown as given (ADR-0028 §3). The SDK never evaluates limits,
   * raises, clears or acknowledges an alarm; an alarm that matches no equipment is still listed.
   */
  alarms?: readonly AlarmState[];
  /** Controlled layout; without it the runtime keeps its own, starting at `defaultLayout` (default '3d'). */
  layout?: RuntimeLayout;
  defaultLayout?: RuntimeLayout;
  onLayoutChange?: (layout: RuntimeLayout) => void;
  /** Controlled selection, shared by every view. */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Called once per refused document, with the reason. */
  onRefused?: (refusal: RuntimeRefusal) => void;
  /**
   * Opts in to command requests (ADR-0029). Offered only with `expected.digest`, for writable variables
   * with a trusted measured reading, after a confirmation; called once per confirmed request. The SDK
   * never writes, retries or queues: the host authorizes, audits and writes.
   */
  onCommandRequest?: (request: CommandRequest) => void;
  /** The host's answers by `requestId`, shown as given. */
  commandStatus?: Readonly<Record<string, CommandStatus>>;
  style?: React.CSSProperties;
}

const layouts: [RuntimeLayout, string][] = [['3d', '3D'], ['process', 'Process'], ['electrical', 'Electrical'], ['split', 'Split']];
const tab = (pressed: boolean): React.CSSProperties => ({ padding: '2px 10px', borderRadius: 3, border: '1px solid #3c5366', background: pressed ? '#2a5d8f' : '#132435', color: '#ebf2fa', cursor: 'pointer' });
const panel: React.CSSProperties = { width: 320, flex: 'none', overflowY: 'auto', padding: 12, background: '#0f1d2c', color: '#ebf2fa', borderLeft: '1px solid #3c5366', fontFamily: 'system-ui, sans-serif', fontSize: 13 };

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

const heading: React.CSSProperties = { fontSize: 12, margin: '12px 0 4px', textTransform: 'uppercase', opacity: 0.8 };
const linkButton = (color?: string): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', margin: '2px 0', borderRadius: 3, border: `1px solid ${color ?? '#3c5366'}`, borderLeftWidth: 4, background: '#132435', color: '#ebf2fa', cursor: 'pointer', fontSize: 12 });

function Attention({ scene, status, onGo }: { scene: ScadaScene; status: StatusResult; onGo: (id: string) => void }) {
  const names = new Map(scene.components.map((c) => [c.id, c.name ?? c.id]));
  return (
    <section aria-label="Attention">
      <h3 style={{ ...heading, marginTop: 0 }}>Attention</h3>
      {status.attention.length === 0 && status.unlinked.length === 0 ? <p style={{ opacity: 0.7, fontSize: 12, margin: 0 }}>Nothing needs attention.</p> : (
        <ul aria-label="Needs attention" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {status.attention.map((s) => (
            <li key={s.componentId}>
              <button type="button" data-status={s.status} style={linkButton(describeStatus(s)?.color)} onClick={() => onGo(s.componentId)}>{describeAttention(s, names.get(s.componentId) ?? s.componentId)}</button>
            </li>
          ))}
        </ul>
      )}
      {status.unlinked.length > 0 && (
        <>
          <h3 style={heading}>Not linked to equipment</h3>
          <ul aria-label="Alarms not linked to equipment" style={{ fontSize: 12, paddingLeft: 16, margin: 0 }}>
            {status.unlinked.slice(0, MAX_LISTED_ALARMS).map((a, i) => <li key={`${a.id}:${i}`} style={{ color: statusColors[a.severity] }}>{a.id}: {describeAlarm(a)}{a.componentId ? ` (component ${a.componentId})` : a.tagId ? ` (tag ${a.tagId})` : ''}</li>)}
            {status.unlinked.length > MAX_LISTED_ALARMS && <li>…and {status.unlinked.length - MAX_LISTED_ALARMS} more.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function Information({ scene, id, registry, live, status, commands, onGo }: { scene: ScadaScene; id?: string; registry: ComponentRegistry; live?: TelemetryResolution; status: StatusResult; commands?: (id: string) => React.ReactNode; onGo: (id: string) => void }) {
  const component = id ? scene.components.find((c) => c.id === id) : undefined;
  const attention = <Attention scene={scene} status={status} onGo={onGo} />;
  if (!component) return <aside aria-label="Information" style={panel}>{attention}<p style={{ opacity: 0.7, marginTop: 16 }}>Select equipment to see its values and connections.</p></aside>;
  const bindable = registry.resolvers.resolveBindable(component.type) ?? {};
  const values = (live?.properties ?? []).filter((p) => p.instanceId === component.id);
  const alarms = status.byComponent.get(component.id)?.alarms ?? [];
  return (
    <aside aria-label="Information" style={panel}>
      {attention}
      <h2 style={{ fontSize: 15, margin: '16px 0 2px' }}>{component.name ?? component.id}</h2>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>{registry.definitionFor(component.type, component.properties).label}</div>
      <h3 style={heading}>Active alarms</h3>
      {alarms.length === 0 ? <p style={{ opacity: 0.7, fontSize: 12, margin: 0 }}>None.</p> : (
        <ul aria-label="Active alarms" style={{ fontSize: 12, paddingLeft: 16, margin: 0 }}>{alarms.map((a, i) => <li key={`${a.id}:${i}`} style={{ color: statusColors[a.severity] }}>{describeAlarm(a)}</li>)}</ul>
      )}
      <h3 style={heading}>Live values</h3>
      {values.length === 0 ? <p style={{ opacity: 0.7, fontSize: 12 }}>No bound values.</p> : (
        <ul aria-label="Live values" style={{ fontSize: 12, paddingLeft: 16, margin: 0 }}>{values.map((p) => <li key={p.bindingId}>{describeProperty(p, bindable[p.property])}{p.source === 'SIMULATED' ? ' · SIMULATED' : ''}</li>)}</ul>
      )}
      {commands?.(component.id)}
      <h3 style={heading}>Ports</h3>
      <PortsInspector key={`ports:${component.id}`} rows={describePorts(scene, component.id, registry)} onGo={onGo} />
      <h3 style={heading}>Related</h3>
      <RelationsExplorer key={`related:${component.id}`} relations={describeRelations(scene, component.id, registry)} onGo={onGo} />
    </aside>
  );
}

/** A read-only operator view of an approved document (ADR-0028): 3D and 2D, live values, no editing. */
export function ScadaRuntime({ scene: document, expected, registry = builtInRegistry, telemetry: telemetryInput, alarms, layout, defaultLayout = '3d', onLayoutChange, selectedIds, onSelectionChange, onRefused, onCommandRequest, commandStatus, style }: ScadaRuntimeProps) {
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
  return <Approved scene={approval.scene} digest={approval.digest} onCommandRequest={onCommandRequest} commandStatus={commandStatus} expected={expected} registry={registry} telemetry={telemetry} alarms={alarms} shown={shown} onLayout={(id) => { if (!layout) setOwnLayout(id); onLayoutChange?.(id); }} selection={selection} select={select} style={style} />;
}

/** The runtime over an approved scene: one telemetry resolution and one status for every view and the panel. */
function Approved({ scene, digest, onCommandRequest, commandStatus, expected, registry, telemetry, alarms, shown, onLayout, selection, select, style }: { scene: ScadaScene; digest: string; onCommandRequest?: (request: CommandRequest) => void; commandStatus?: Readonly<Record<string, CommandStatus>>; expected?: ApprovalRecord; registry: ComponentRegistry; telemetry?: TelemetryInput; alarms?: readonly AlarmState[]; shown: RuntimeLayout; onLayout: (layout: RuntimeLayout) => void; selection: readonly string[]; select: (ids: string[]) => void; style?: React.CSSProperties }) {
  const now = useNow(1000);
  const live = useTelemetry(scene, telemetry, now, registry);
  const status = useMemo(() => componentStatus(scene, live, alarms), [scene, live, alarms]);
  // Command requests only from a digest-pinned document, and only when the host opts in (ADR-0029).
  const commandsOn = !!onCommandRequest && !!expected?.digest;
  const session = useCommandSession();
  const variableStates = useMemo(() => (commandsOn ? resolveVariableValues(scene, telemetry?.observations ?? [], { now, source: telemetry?.source, staleAfterMs: telemetry?.staleAfterMs }) : undefined), [commandsOn, scene, telemetry, now]);
  const commands = commandsOn && variableStates
    ? (id: string) => <Commands key={`${digest}:${id}`} scene={scene} componentId={id} states={variableStates} source={telemetry?.source} revision={scene.project?.revision ?? ''} digest={digest} onCommandRequest={onCommandRequest!} commandStatus={commandStatus} session={session} />
    : undefined;
  const diagram = { scene, registry, telemetry, status: status.byComponent, selectedIds: selection, onSelectionChange: select, editable: false, style: { height: '100%' } };
  const show3d = shown === '3d' || shown === 'split';
  const show2d = shown === 'process' || shown === 'electrical' ? shown : shown === 'split' ? 'process' : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...style }}>
      <div role="toolbar" aria-label="Runtime layout" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 8px', background: '#0b1725', color: '#ebf2fa', fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>
        {layouts.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={shown === id} style={tab(shown === id)} onClick={() => onLayout(id)}>{label}</button>
        ))}
        <span aria-label="Approved revision" style={{ marginLeft: 'auto', opacity: 0.8 }}>
          {scene.project?.name ? `${scene.project.name} · ` : ''}revision {scene.project?.revision ?? 'not set'}{expected?.digest ? ' · digest verified' : ''} · view only
        </span>
        {telemetry?.source === 'SIMULATED' && <span aria-label="Simulated values" style={{ padding: '1px 8px', borderRadius: 3, background: '#b58cff', color: '#10051f', fontWeight: 700 }}>SIMULATED values, not plant data</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <div aria-label="Status summary" aria-live="polite" style={{ position: 'absolute', zIndex: 1, top: 8, left: 8, padding: '3px 8px', borderRadius: 4, background: '#0b1725dd', color: '#ebf2fa', fontFamily: 'system-ui, sans-serif', fontSize: 12, pointerEvents: 'none', borderLeft: `4px solid ${status.attention[0] ? describeStatus(status.attention[0])!.color : '#2fb36d'}` }}>{summarizeStatus(status)}</div>
        {show3d && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Scada3DViewer scene={scene} registry={registry} telemetry={telemetry} status={status.byComponent} selectedId={selection.at(-1)} onSelect={(id) => select([id])} />
          </div>
        )}
        {show2d && (
          <div style={{ flex: 1, minWidth: 0, borderLeft: show3d ? '1px solid #3c5366' : undefined }}>
            {show2d === 'process' ? <ProcessView {...diagram} /> : <ElectricalView {...diagram} />}
          </div>
        )}
        <Information scene={scene} id={selection.at(-1)} registry={registry} live={live} status={status} commands={commands} onGo={(id) => select([id])} />
      </div>
    </div>
  );
}
