import React, { useCallback, useState } from 'react';
import type { CommandRequest, CommandState, CommandStatus } from '@sakibcoolz/react';

/**
 * Stands in for a host receiving command requests in `?runtime` (ADR-0029). It only records them and
 * lets you answer: nothing is written. To see a change, type the new value in the demo tag feed, as a
 * real plant would report it.
 */
const states: CommandState[] = ['pending', 'accepted', 'rejected', 'completed', 'failed'];

export function useDemoCommands() {
  const [requests, setRequests] = useState<CommandRequest[]>([]);
  const [commandStatus, setStatus] = useState<Record<string, CommandStatus>>({});
  const onCommandRequest = useCallback((request: CommandRequest) => setRequests((all) => [...all, request]), []);
  const panel = (
    <div aria-label="Demo command requests" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '6px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12, borderTop: '1px solid #1a2b3c' }}>
      <b>Command requests received (host side, nothing is written)</b>
      {requests.length === 0 && <span style={{ opacity: 0.7 }}>none yet</span>}
      <ol aria-label="Received requests" style={{ margin: 0, paddingLeft: 18 }}>
        {requests.map((r) => (
          <li key={r.requestId}>
            {r.requestId}: {r.tagId} → {String(r.value)}{r.unit ? ` ${r.unit}` : ''} (revision {r.sceneRevision}, digest {r.sceneDigest.slice(0, 8)}…)
            <select aria-label={`Answer ${r.requestId}`} value={commandStatus[r.requestId]?.state ?? ''} onChange={(e) => setStatus((s) => ({ ...s, [r.requestId]: { state: e.target.value as CommandState, ...(e.target.value === 'rejected' ? { message: 'not authorized for this operator' } : {}) } }))} style={{ marginLeft: 6 }}>
              <option value="" disabled>answer…</option>
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          </li>
        ))}
      </ol>
    </div>
  );
  return { onCommandRequest, commandStatus, panel };
}
