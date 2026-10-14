import React, { useEffect, useMemo, useState } from 'react';
import type { FlowReading, Quality, ScadaScene, ValueSource } from '@scada3d/core';

/**
 * Stands in for a host application's data feed: per-connection rate and quality typed by hand.
 * "Live" re-stamps every reading each second like a polling host; unticking it lets them go stale.
 */
export interface FlowRow {
  rate: string;
  quality: Quality;
}

const qualities: Quality[] = ['GOOD', 'UNCERTAIN', 'BAD', 'STALE'];
const input: React.CSSProperties = { width: 56, marginLeft: 4 };

export function useDemoFlow(scene: ScadaScene, initialRows: Record<string, FlowRow>) {
  const [rows, setRows] = useState(initialRows);
  const [source, setSource] = useState<ValueSource>('MEASURED');
  const [live, setLive] = useState(true);
  const [stamp, setStamp] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!live) return undefined;
    setStamp(new Date().toISOString());
    const timer = setInterval(() => setStamp(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const readings = useMemo<FlowReading[]>(
    () =>
      Object.entries(rows)
        .filter(([, row]) => row.rate.trim() !== '')
        .map(([connectionId, row]) => ({ connectionId, rate: Number(row.rate), quality: row.quality, source, sourceTimestamp: stamp })),
    [rows, source, stamp],
  );

  function update(connectionId: string, change: Partial<FlowRow>) {
    setRows((current) => {
      const previous: FlowRow = current[connectionId] ?? { rate: '', quality: 'GOOD' };
      return { ...current, [connectionId]: { ...previous, ...change } };
    });
    setStamp(new Date().toISOString());
  }

  const panel = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '6px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12 }}>
      <b>Demo flow feed</b>
      <label>
        <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} aria-label="Live readings" /> Live
      </label>
      <label>
        Source
        <select aria-label="Flow source" value={source} onChange={(e) => setSource(e.target.value as ValueSource)} style={{ marginLeft: 4 }}>
          <option value="MEASURED">Measured</option>
          <option value="SIMULATED">Simulated</option>
        </select>
      </label>
      {scene.connections.length === 0 && <span>No connections yet.</span>}
      {scene.connections.map(({ id }) => (
        <span key={id}>
          {id}
          <input aria-label={`Rate ${id}`} type="number" step="0.1" placeholder="m³/s" value={rows[id]?.rate ?? ''} onChange={(e) => update(id, { rate: e.target.value })} style={input} />
          <select aria-label={`Quality ${id}`} value={rows[id]?.quality ?? 'GOOD'} onChange={(e) => update(id, { quality: e.target.value as Quality })} style={{ marginLeft: 2 }}>
            {qualities.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </span>
      ))}
    </div>
  );

  return { flow: { readings, source }, panel };
}
