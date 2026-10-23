import React, { useState } from 'react';
import type { AlarmSeverity, AlarmState } from '@sakibcoolz/core';

/**
 * Stands in for a host's alarm system in `?runtime` (ADR-0028 §3): the SDK only displays these. Each
 * row can be raised or cleared, acknowledged and given another severity, as the host would.
 */
const initialAlarms: AlarmState[] = [
  { id: 'LAH-101', tagId: 'LT-101.PV', severity: 'high', message: 'Tank level high', active: true, since: '2026-10-23T08:00:00Z' },
  { id: 'VIB-101', componentId: 'P-101', severity: 'medium', message: 'Pump vibration', active: false },
  { id: 'ZS-999', componentId: 'XV-999', severity: 'low', message: 'Spare valve position mismatch', active: true, acknowledged: true },
];

const severities: AlarmSeverity[] = ['critical', 'high', 'medium', 'low'];

export function useDemoAlarms() {
  const [alarms, setAlarms] = useState(initialAlarms);
  const update = (id: string, change: Partial<AlarmState>) => setAlarms((all) => all.map((a) => (a.id === id ? { ...a, ...change } : a)));
  const panel = (
    <div aria-label="Demo alarms" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '6px 20px', background: '#0f1d2c', color: '#ebf2fa', fontFamily: 'system-ui', fontSize: 12, borderTop: '1px solid #1a2b3c' }}>
      <b>Demo alarms (host side)</b>
      {alarms.map((a) => (
        <span key={a.id}>
          {a.id} <span style={{ opacity: 0.7 }}>({a.componentId ?? a.tagId})</span>
          <label style={{ marginLeft: 4 }}><input type="checkbox" aria-label={`Alarm ${a.id} active`} checked={a.active} onChange={(e) => update(a.id, { active: e.target.checked })} /> active</label>
          <label style={{ marginLeft: 4 }}><input type="checkbox" aria-label={`Alarm ${a.id} acknowledged`} checked={!!a.acknowledged} onChange={(e) => update(a.id, { acknowledged: e.target.checked })} /> ack</label>
          <select aria-label={`Alarm ${a.id} severity`} value={a.severity} onChange={(e) => update(a.id, { severity: e.target.value as AlarmSeverity })} style={{ marginLeft: 4 }}>
            {severities.map((s) => <option key={s}>{s}</option>)}
          </select>
        </span>
      ))}
    </div>
  );
  return { alarms, panel };
}
