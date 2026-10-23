import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DataProvider, Observation, Quality, ScadaScene, ValueSource } from '@sakibcoolz/core';

/**
 * Stands in for a host application's data feed, delivered through a `DataProvider`: one row per
 * bound tag, typed by hand. Every edit pushes the rows; "Live" re-sends them each second like a
 * polling host, and unticking it lets them go stale. Clearing a value stops sending that tag.
 */
export interface TagRow {
  value: string;
  quality: Quality;
}

const qualities: Quality[] = ['GOOD', 'UNCERTAIN', 'BAD', 'STALE', 'DISCONNECTED'];

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
  const subscribers = useRef(new Set<(observations: readonly Observation[]) => void>());
  const current = useRef<() => Observation[]>(() => []);
  current.current = () =>
    Object.entries(rows)
      .filter(([, row]) => row.value.trim() !== '')
      .map(([tagId, row]) => ({ tagId, value: parseValue(row.value), quality: row.quality, source, sourceTimestamp: new Date().toISOString() }));

  /** The host side of the SDK contract; `active()` exists only so tests can check cleanup. */
  const provider = useMemo<DataProvider & { active(): number }>(
    () => ({
      getSnapshot: () => current.current(),
      subscribe(onObservations) {
        subscribers.current.add(onObservations);
        return () => subscribers.current.delete(onObservations);
      },
      active: () => subscribers.current.size,
    }),
    [],
  );
  (window as unknown as { __demoFeed: typeof provider }).__demoFeed = provider;

  const send = () => {
    const batch = current.current();
    for (const subscriber of [...subscribers.current]) subscriber(batch);
  };
  useEffect(send, [rows, source]);
  useEffect(() => {
    if (!live) return undefined;
    send();
    const timer = setInterval(send, 1000);
    return () => clearInterval(timer);
  }, [live]);

  // Bound tags, plus unbound ones the demo feeds (the control demo's writable setpoints).
  const tags = useMemo(() => [...new Set([...(scene.tagBindings ?? []).map((b) => b.tagId), ...Object.keys(initialRows)])], [scene, initialRows]);

  function update(tagId: string, change: Partial<TagRow>) {
    setRows((existing) => {
      const previous: TagRow = existing[tagId] ?? { value: '', quality: 'GOOD' };
      return { ...existing, [tagId]: { ...previous, ...change } };
    });
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

  return { telemetry: { provider, source }, panel };
}
