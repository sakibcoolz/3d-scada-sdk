import type { ScadaScene } from './scene.js';
import type { PropertyState, TelemetryUnknownReason } from './telemetry.js';

// Status per component (ADR-0028 §3–4): host-supplied alarms and the quality of bound values, folded
// into one status each. Display only: the SDK never evaluates limits, raises, clears or acknowledges.

export type AlarmSeverity = 'critical' | 'high' | 'medium' | 'low';
export const alarmSeverities: readonly AlarmSeverity[] = ['critical', 'high', 'medium', 'low'];

/** An alarm from the host's alarm system, shown as given. */
export interface AlarmState {
  id: string;
  /** What it is about; a tag maps to components through property bindings, flow bindings and runtime variables. */
  componentId?: string;
  tagId?: string;
  severity: AlarmSeverity;
  message: string;
  active: boolean;
  acknowledged?: boolean;
  /** ISO 8601, shown as given. */
  since?: string;
}

export type ComponentStatusKind = 'alarm' | 'unknown' | 'uncertain' | 'ok' | 'unbound';

export interface ComponentStatus {
  componentId: string;
  /** Highest first: alarm, unknown, uncertain, ok, unbound. */
  status: ComponentStatusKind;
  /** The highest active alarm severity, when `status` is 'alarm'. */
  severity?: AlarmSeverity;
  /** Any of its active alarms is not acknowledged. */
  unacknowledged: boolean;
  /** Its active alarms: highest severity first, unacknowledged before acknowledged, then host order. */
  alarms: AlarmState[];
  /** Bound properties without a trusted value. */
  unknown: { property: string; reason: TelemetryUnknownReason }[];
  /** Bound properties whose value is trusted but UNCERTAIN. */
  uncertain: string[];
  /** Some of its values are simulated (labelled SIMULATED, never plant data). */
  simulated: boolean;
}

export interface StatusResult {
  /** One status per scene component. */
  byComponent: ReadonlyMap<string, ComponentStatus>;
  /** Components needing attention: alarms first (by severity, unacknowledged first), then unknown values; scene order within each. */
  attention: ComponentStatus[];
  /** Active alarms whose component or tag does not resolve: listed, never dropped. */
  unlinked: AlarmState[];
  counts: Record<AlarmSeverity | 'unknown' | 'uncertain' | 'unacknowledged' | 'unlinked', number>;
}

const rank = (s: AlarmSeverity) => alarmSeverities.indexOf(s);

/** Plain text from a host value; objects and symbols (whose conversion can throw) become ''. */
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : '');

/**
 * Host data is untrusted: an unrecognised severity is shown as critical, never under-reported, and
 * every field the views render becomes plain text or is dropped (T-096).
 */
function normalise(alarm: AlarmState): AlarmState {
  const severity = alarmSeverities.includes(alarm.severity) ? alarm.severity : 'critical';
  const { componentId, tagId, since } = alarm;
  return {
    id: text(alarm.id),
    severity,
    message: text(alarm.message),
    active: true,
    acknowledged: alarm.acknowledged === true,
    ...(typeof componentId === 'string' ? { componentId } : {}),
    ...(typeof tagId === 'string' ? { tagId } : {}),
    ...(typeof since === 'string' ? { since } : {}),
  };
}

/**
 * Folds host alarms and resolved telemetry into one status per component. Pure. Only active alarms
 * count; acknowledged ones still count while active. An explicit `componentId` that exists wins;
 * otherwise `tagId` maps through the scene's bindings and variables.
 */
export function componentStatus(scene: ScadaScene, resolution: { properties: readonly PropertyState[] } | undefined, alarms: readonly AlarmState[] = []): StatusResult {
  const ids = new Set(scene.components.map((c) => c.id));
  const tagTargets = new Map<string, Set<string>>();
  const target = (tagId: string, componentId: string) => {
    if (ids.has(componentId)) { const set = tagTargets.get(tagId); if (set) set.add(componentId); else tagTargets.set(tagId, new Set([componentId])); }
  };
  const connections = new Map(scene.connections.map((c) => [c.id, c]));
  for (const b of scene.tagBindings ?? []) {
    if (b.kind === 'property') target(b.tagId, b.instanceId);
    else {
      const c = connections.get(b.connectionId);
      if (c) for (const end of [c.from.instanceId, c.to.instanceId]) target(b.tagId, end);
    }
  }
  for (const v of scene.runtimeVariables ?? []) if (v.componentId) target(v.id, v.componentId);

  const byAlarm = new Map<string, AlarmState[]>();
  const unlinked: AlarmState[] = [];
  for (const raw of alarms) {
    if (!raw || typeof raw !== 'object' || raw.active !== true) continue;
    const alarm = normalise(raw);
    const targets = alarm.componentId !== undefined && ids.has(alarm.componentId) ? [alarm.componentId] : [...(alarm.tagId !== undefined ? (tagTargets.get(alarm.tagId) ?? []) : [])];
    if (targets.length === 0) unlinked.push(alarm);
    // Pushed, not copied: folding must stay linear in the number of host alarms (T-096).
    for (const id of targets) { const list = byAlarm.get(id); if (list) list.push(alarm); else byAlarm.set(id, [alarm]); }
  }

  const states = new Map<string, PropertyState[]>();
  for (const p of resolution?.properties ?? []) { const list = states.get(p.instanceId); if (list) list.push(p); else states.set(p.instanceId, [p]); }

  const byComponent = new Map<string, ComponentStatus>();
  for (const { id } of scene.components) {
    const active = (byAlarm.get(id) ?? []).map((a, i) => [a, i] as const).sort(([a, i], [b, j]) => rank(a.severity) - rank(b.severity) || Number(!!a.acknowledged) - Number(!!b.acknowledged) || i - j).map(([a]) => a);
    const values = states.get(id) ?? [];
    const unknown = values.flatMap((p) => (p.status === 'unknown' ? [{ property: p.property, reason: p.reason }] : []));
    const uncertain = values.flatMap((p) => (p.status === 'ok' && p.uncertain ? [p.property] : []));
    // A simulated value never clears an unknown measured one: unknown outranks ok whatever the source (ADR-0010).
    const status: ComponentStatusKind = active.length ? 'alarm' : unknown.length ? 'unknown' : uncertain.length ? 'uncertain' : values.length ? 'ok' : 'unbound';
    byComponent.set(id, {
      componentId: id,
      status,
      ...(active.length ? { severity: active[0].severity } : {}),
      unacknowledged: active.some((a) => !a.acknowledged),
      alarms: active,
      unknown,
      uncertain,
      simulated: values.some((p) => p.source === 'SIMULATED'),
    });
  }

  const all = [...byComponent.values()];
  const alarmed = all.filter((s) => s.status === 'alarm').map((s, i) => [s, i] as const).sort(([a, i], [b, j]) => rank(a.severity!) - rank(b.severity!) || Number(b.unacknowledged) - Number(a.unacknowledged) || i - j).map(([s]) => s);
  const counts: StatusResult['counts'] = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, uncertain: 0, unacknowledged: 0, unlinked: unlinked.length };
  for (const s of all) {
    if (s.severity) counts[s.severity]++;
    if (s.status === 'unknown') counts.unknown++;
    if (s.status === 'uncertain') counts.uncertain++;
    if (s.unacknowledged) counts.unacknowledged++;
  }
  return { byComponent, attention: [...alarmed, ...all.filter((s) => s.status === 'unknown')], unlinked, counts };
}
