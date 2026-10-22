import React from 'react';
import type { PortRow } from './ports.js';
import type { Relations } from './relations.js';

// Read-only Properties sections (ADR-0027, T-087): the selected component's ports and terminals, and
// how it relates to the rest of the scene. Every name is React text; "go to" selects the other part.

const muted: React.CSSProperties = { opacity: 0.7, fontSize: 11 };
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: '#7fb7ff', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' };

export function PortsInspector({ rows, onGo }: { rows: readonly PortRow[]; onGo: (componentId: string) => void }) {
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
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

export function RelationsExplorer({ relations, onGo }: { relations: Relations; onGo: (componentId: string) => void }) {
  if (relations.groups.length === 0) return <p style={muted}>Not connected or related to anything.</p>;
  const item = (c: { id: string; label: string }) => (
    <li key={c.id}><button type="button" style={link} onClick={() => onGo(c.id)}>{c.label}</button></li>
  );
  return (
    <div style={{ fontSize: 12 }}>
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
    </div>
  );
}
