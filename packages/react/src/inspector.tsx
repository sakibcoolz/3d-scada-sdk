import React, { useState } from 'react';
import { relationshipKinds, type Relationship, type SceneConnection } from '@sakibcoolz/core';
import type { PortJoin, PortRow } from './ports.js';
import type { Relations, RelatedComponent } from './relations.js';
import { parsePropertyValue, type WiringCandidate } from './wiring.js';

// Properties sections (ADR-0027): the selected component's ports and terminals (T-087) with wiring
// (T-088), and how it relates to the rest of the scene with its associations. Every name is React
// text; "go to" links select the other part. Edits are offered only when `editing` is given.

const muted: React.CSSProperties = { opacity: 0.7, fontSize: 11 };
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: '#7fb7ff', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' };
const small: React.CSSProperties = { fontSize: 11, padding: '0 6px', marginLeft: 6 };
const refused: React.CSSProperties = { fontSize: 11, color: '#e7a33e' };

export interface PortEditing {
  candidates: (portId: string) => WiringCandidate[] | undefined;
  onWire: (portId: string, to: WiringCandidate) => void;
  onDisconnect: (connectionId: string) => void;
  onEditConnection: (connectionId: string, changes: Pick<SceneConnection, 'relationship' | 'properties'>) => void;
}

/** Choose the port at the other end: compatible, free ports enabled; the rest disabled with their reason. */
function WirePicker({ portId, candidates, onPick }: { portId: string; candidates: readonly WiringCandidate[]; onPick: (c: WiringCandidate) => void }) {
  const [filter, setFilter] = useState('');
  const shown = candidates.filter((c) => c.componentLabel.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div role="group" aria-label={`Wire ${portId} to`} style={{ margin: '4px 0 4px 8px', padding: 6, border: '1px solid #ffffff22', borderRadius: 3 }}>
      <input aria-label="Filter components" placeholder="Filter components" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
      {shown.length === 0 && <div style={muted}>No {candidates.length ? 'matching ' : ''}ports of this kind.</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 220, overflowY: 'auto' }}>
        {shown.map((c) => (
          <li key={`${c.componentId}:${c.portId}`} style={{ padding: '2px 0' }}>
            <button type="button" disabled={!c.ok} onClick={() => onPick(c)} style={{ width: '100%', textAlign: 'left' }}>
              {c.componentLabel} · {c.portId}{c.terminal && c.terminal !== c.portId ? ` (${c.terminal})` : ''}
              {c.rating && <span style={muted}> — {c.rating}</span>}
            </button>
            {c.reason && <div style={refused}>{c.reason}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A wire's relationship and free properties (cable, length …), each change one undo step. */
function ConnectionDetails({ join, onEdit }: { join: PortJoin; onEdit: PortEditing['onEditConnection'] }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const properties = join.properties ?? {};
  const withProperties = (next: Record<string, number | boolean | string>) => onEdit(join.connectionId, { relationship: join.relationship, properties: Object.keys(next).length ? next : undefined });
  return (
    <div role="group" aria-label={`Details of ${join.connectionId}`} style={{ margin: '4px 0 4px 16px', fontSize: 11 }}>
      <label>Relationship{' '}
        <select aria-label="Relationship" value={join.relationship ?? ''} onChange={(e) => onEdit(join.connectionId, { relationship: (e.target.value || undefined) as Relationship | undefined, properties: join.properties })}>
          <option value="">none</option>
          {relationshipKinds.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <ul aria-label="Connection properties" style={{ listStyle: 'none', padding: 0, margin: '4px 0' }}>
        {Object.entries(properties).map(([k, v]) => (
          <li key={k}>
            {k} = {String(v)}
            <button type="button" style={small} aria-label={`Remove property ${k}`} onClick={() => { const { [k]: _, ...rest } = properties; withProperties(rest); }}>×</button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; withProperties({ ...properties, [name.trim()]: parsePropertyValue(value) }); setName(''); setValue(''); }} style={{ display: 'flex', gap: 4 }}>
        <input aria-label="Property name" placeholder="name, e.g. cable" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <input aria-label="Property value" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export function PortsInspector({ rows, onGo, editing }: { rows: readonly PortRow[]; onGo: (componentId: string) => void; editing?: PortEditing }) {
  const [picking, setPicking] = useState<string>();
  const [details, setDetails] = useState<string>();
  if (rows.length === 0) return <p style={muted}>No ports.</p>;
  return (
    <ul aria-label="Ports" style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
      {rows.map((p) => (
        <li key={p.id} aria-label={`Port ${p.id}`} style={{ padding: '4px 0', borderBottom: '1px solid #ffffff14' }}>
          <div>
            <b>{p.name ?? p.id}</b>
            {p.terminal && <span style={muted}> · {p.terminal}</span>}
            <span style={muted}> · {p.kind}</span>
            <span style={{ float: 'right', ...muted }} aria-label={`Usage of ${p.id}`}>{p.used}/{p.capacity}</span>
          </div>
          {p.rating && <div style={muted}>{p.rating}</div>}
          {p.joins.map((j) => (
            <div key={j.connectionId} style={{ paddingLeft: 8 }}>
              →{' '}
              <button type="button" style={link} title="Select this component" onClick={() => onGo(j.componentId)}>
                {j.componentLabel} · {j.portId}{j.terminal ? ` (${j.terminal})` : ''}
              </button>
              {j.relationship && <span style={muted}> · {j.relationship}</span>}
              {editing && p.wired && <>
                <button type="button" style={small} aria-expanded={details === j.connectionId} onClick={() => setDetails(details === j.connectionId ? undefined : j.connectionId)}>Details</button>
                <button type="button" style={small} aria-label={`Disconnect ${j.componentLabel} · ${j.portId}`} onClick={() => editing.onDisconnect(j.connectionId)}>Disconnect</button>
              </>}
              {editing && details === j.connectionId && <ConnectionDetails join={j} onEdit={editing.onEditConnection} />}
            </div>
          ))}
          {editing && p.wired && p.used < p.capacity && (
            <button type="button" style={{ ...small, marginLeft: 8 }} aria-expanded={picking === p.id} aria-label={`Wire ${p.id}`} onClick={() => setPicking(picking === p.id ? undefined : p.id)}>Wire…</button>
          )}
          {editing && picking === p.id && p.used < p.capacity && (
            <WirePicker portId={p.id} candidates={editing.candidates(p.id) ?? []} onPick={(c) => { setPicking(undefined); editing.onWire(p.id, c); }} />
          )}
        </li>
      ))}
    </ul>
  );
}

export interface RelationEditing {
  /** Components that can be related to the selected one, by id and label. */
  others: readonly RelatedComponent[];
  onAdd: (relationship: Relationship, toId: string) => void;
  onRemove: (associationId: string) => void;
}

export function RelationsExplorer({ relations, onGo, editing }: { relations: Relations; onGo: (componentId: string) => void; editing?: RelationEditing }) {
  const [relationship, setRelationship] = useState<Relationship>('controls');
  const [target, setTarget] = useState('');
  const item = (c: RelatedComponent) => (
    <li key={`${c.id}:${c.associationId ?? ''}`}>
      <button type="button" style={link} onClick={() => onGo(c.id)}>{c.label}</button>
      {editing && c.associationId && <button type="button" style={small} aria-label={`Remove relationship with ${c.label}`} onClick={() => editing.onRemove(c.associationId!)}>×</button>}
    </li>
  );
  return (
    <div style={{ fontSize: 12 }}>
      {relations.groups.length === 0 && <p style={muted}>Not connected or related to anything.</p>}
      {relations.groups.map((g) => (
        <div key={g.key} role="group" aria-label={g.label} style={{ marginBottom: 6 }}>
          <div style={muted}>{g.label}</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{g.components.map(item)}</ul>
        </div>
      ))}
      {relations.chain.length > 0 && (
        <div role="group" aria-label="Control chain" style={{ marginTop: 8 }}>
          <div style={muted}>Control chain (what acts on this, nearest first)</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>{relations.chain.map(item)}</ol>
        </div>
      )}
      {editing && editing.others.length > 0 && (
        <form aria-label="Add relationship" onSubmit={(e) => { e.preventDefault(); if (target) editing.onAdd(relationship, target); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          <select aria-label="Relationship to add" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
            {relationshipKinds.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select aria-label="Related component" value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
            <option value="">component…</option>
            {editing.others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button type="submit" disabled={!target}>Add relationship</button>
        </form>
      )}
    </div>
  );
}
