import React, { useEffect, useMemo, useState } from 'react';
import type { Observation, Quality, ScadaScene, ValueSource } from '@scada3d/core';

/**
 * Stands in for a host application's data feed: one row per bound tag, typed by hand.
 * "Live" re-stamps every observation each second like a polling host; unticking it lets them go stale.
 */
export interface TagRow {
  value: string;
  quality: Quality;
}

const qualities: Quality[] = ['GOOD', 'UNCERTAIN', 'BAD', 'STALE'];

/** "true"/"false" become booleans, anything else a number (NaN is sent as-is and shows as invalid). */
function parseValue(text: string): Observation['value'] {
  const trimmed = text.trim();
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  return Number(trimmed);
}

export function useDemoFeed(scene: ScadaScene, initialRows: Record<string, TagRow>) {
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

  const tags = useMemo(() => [...new Set((scene.tagBindings ?? []).map((b) => b.tagId))], [scene]);

  const observations = useMemo<Observation[]>(
    () =>
      Object.entries(rows)
        .filter(([, row]) => row.value.trim() !== '')
        .map(([tagId, row]) => ({ tagId, value: parseValue(row.value), quality: row.quality, source, sourceTimestamp: stamp })),
    [rows, source, stamp],
  );

  function update(tagId: string, change: Partial<TagRow>) {
    setRows((current) => {
      const previous: TagRow = current[tagId] ?? { value: '', quality: 'GOOD' };
      return { ...current, [tagId]: { ...previous, ...change } };
    });
    setStamp(new Date().toISOString());
  }

  const panel = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '6px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12 }}>
      <b>Demo tag feed</b>
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
      {tags.length === 0 && <span>No tag bindings yet.</span>}
      {tags.map((tagId) => (
        <span key={tagId}>
          {tagId}
          <input aria-label={`Value ${tagId}`} value={rows[tagId]?.value ?? ''} placeholder="value" onChange={(e) => update(tagId, { value: e.target.value })} style={{ width: 56, marginLeft: 4 }} />
          <select aria-label={`Quality ${tagId}`} value={rows[tagId]?.quality ?? 'GOOD'} onChange={(e) => update(tagId, { quality: e.target.value as Quality })} style={{ marginLeft: 2 }}>
            {qualities.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </span>
      ))}
    </div>
  );

  return { telemetry: { observations, source }, panel };
}
