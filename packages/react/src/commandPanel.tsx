import React, { useEffect, useRef, useState } from 'react';
import type { RuntimeVariable, ScadaScene, ValueSource, VariableState } from '@sakibcoolz/core';
import { checkCommandValue, COMMAND_NOTICE, commandAvailability, createCommandRequest, formatCommandValue, requestIds, writableVariables, type CommandRequest, type CommandStatus } from './commands.js';

// The runtime's command requests (ADR-0029 §3): a form, then a confirmation, then one call to the
// host. The displayed value never changes here; only telemetry changes it.

/** After a confirm, the same variable's button waits this long, so repeated clicks cannot double-send. */
export const RESEND_DELAY_MS = 2000;

type Dialog = { variable: RuntimeVariable; stage: 'form' | 'confirm'; input: string | boolean | undefined; value?: number | boolean; error?: string };

const button: React.CSSProperties = { padding: '2px 8px', borderRadius: 3, border: '1px solid #3c5366', background: '#132435', color: '#ebf2fa', cursor: 'pointer', fontSize: 12 };
const statusColors: Record<CommandStatus['state'], string> = { pending: '#ebf2fa', accepted: '#7cc4fa', completed: '#2fb36d', rejected: '#ffb224', failed: '#e5484d' };

export interface CommandsProps {
  scene: ScadaScene;
  componentId: string;
  states: ReadonlyMap<string, VariableState>;
  source?: ValueSource;
  revision: string;
  digest: string;
  onCommandRequest: (request: CommandRequest) => void;
  commandStatus?: Readonly<Record<string, CommandStatus>>;
  /** Kept by the runtime, so the last request per tag survives a change of selection. */
  session: CommandSession;
}

export type SentRequests = Record<string, { requestId: string; at: number }>;
export interface CommandSession {
  sent: SentRequests;
  setSent: React.Dispatch<React.SetStateAction<SentRequests>>;
  nextId: () => string;
}

/** One session per runtime: request IDs and the last request per tag. */
export function useCommandSession(): CommandSession {
  const [nextId] = useState(requestIds);
  const [sent, setSent] = useState<SentRequests>({});
  return { sent, setSent, nextId };
}

export function Commands({ scene, componentId, states, source, revision, digest, onCommandRequest, commandStatus, session }: CommandsProps) {
  const variables = writableVariables(scene, componentId);
  const { sent, setSent, nextId } = session;
  const [dialog, setDialog] = useState<Dialog>();
  const [, tick] = useState(0);
  useEffect(() => {
    const waiting = Object.values(sent).some((s) => Date.now() - s.at < RESEND_DELAY_MS);
    if (!waiting) return undefined;
    const timer = setTimeout(() => tick((n) => n + 1), RESEND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  if (variables.length === 0) return null;

  const review = () => {
    if (!dialog) return;
    const checked = checkCommandValue(dialog.variable, dialog.input ?? '');
    setDialog(checked.ok ? { ...dialog, stage: 'confirm', value: checked.value, error: undefined } : { ...dialog, error: checked.message });
  };
  const confirm = () => {
    if (!dialog || dialog.value === undefined) return;
    // The reading may have changed while the dialog was open: check again, and send nothing if it is now unknown.
    const now = commandAvailability(states.get(dialog.variable.id), source);
    if (!now.ok) return setDialog({ ...dialog, error: now.reason });
    const request = createCommandRequest({ requestId: nextId(), variable: dialog.variable, value: dialog.value, current: states.get(dialog.variable.id), revision, digest, at: new Date() });
    setDialog(undefined);
    setSent((s) => ({ ...s, [request.tagId]: { requestId: request.requestId, at: Date.now() } }));
    onCommandRequest(request);
  };

  return (
    <section aria-label="Commands">
      <h3 style={{ fontSize: 12, margin: '12px 0 4px', textTransform: 'uppercase', opacity: 0.8 }}>Request changes</h3>
      <ul aria-label="Writable variables" style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
        {variables.map((v) => {
          const state = states.get(v.id);
          const available = commandAvailability(state, source);
          const last = sent[v.id];
          const waiting = !!last && Date.now() - last.at < RESEND_DELAY_MS;
          const status = last ? commandStatus?.[last.requestId] : undefined;
          return (
            <li key={v.id} data-tag-id={v.id} style={{ margin: '4px 0' }}>
              <div>{v.name ?? v.id}: {state?.status === 'ok' ? `${formatCommandValue(v, state.value)} · ${state.quality}` : 'unknown'}</div>
              <button type="button" style={{ ...button, opacity: available.ok && !waiting ? 1 : 0.5 }} disabled={!available.ok || waiting || !!dialog} aria-label={`Request change to ${v.name ?? v.id}`} onClick={() => setDialog({ variable: v, stage: 'form', input: v.dataType === 'bool' ? undefined : '' })}>
                {waiting ? 'Sent' : 'Request change…'}
              </button>
              {!available.ok && <div style={{ opacity: 0.75 }}>{available.reason}</div>}
              {last && (
                <div aria-label={`Last request for ${v.id}`} style={{ color: status ? statusColors[status.state] : undefined }}>
                  Last request {last.requestId}: {status ? `${status.state}${status.message ? `, ${status.message}` : ''}` : 'sent, no answer from the host yet'}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {dialog && <CommandDialog dialog={dialog} state={states.get(dialog.variable.id)} onChange={(input) => setDialog({ ...dialog, input, error: undefined })} onReview={review} onBack={() => setDialog({ ...dialog, stage: 'form', error: undefined })} onConfirm={confirm} onCancel={() => setDialog(undefined)} />}
    </section>
  );
}

function CommandDialog({ dialog, state, onChange, onReview, onBack, onConfirm, onCancel }: { dialog: Dialog; state?: VariableState; onChange: (input: string | boolean) => void; onReview: () => void; onBack: () => void; onConfirm: () => void; onCancel: () => void }) {
  const { variable } = dialog;
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Cancel has focus at confirmation, so a stray Enter never sends.
    if (dialog.stage === 'confirm') cancel.current?.focus();
  }, [dialog.stage]);
  const { min, max, step, confirm } = variable.command ?? {};
  const limits = variable.dataType === 'bool' ? 'on or off' : `${min} to ${max}${variable.unit ? ` ${variable.unit}` : ''}${step !== undefined ? `, in steps of ${step}` : ''}`;
  const current = state?.status === 'ok' ? `${formatCommandValue(variable, state.value)} · ${state.quality} · at ${state.sourceTimestamp}` : 'unknown';
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'grid', placeItems: 'center', zIndex: 20 }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <div role="dialog" aria-modal="true" aria-label={dialog.stage === 'form' ? 'Request change' : 'Confirm request'} style={{ width: 420, maxWidth: 'calc(100vw - 32px)', padding: 16, borderRadius: 6, background: '#0f1d2c', color: '#ebf2fa', border: '1px solid #3c5366', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>{dialog.stage === 'form' ? 'Request change' : 'Confirm request'}: {variable.name ?? variable.id}</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', margin: '0 0 10px' }}>
          <dt>Tag</dt><dd style={{ margin: 0 }}>{variable.id}{variable.componentId ? ` (${variable.componentId})` : ''}</dd>
          <dt>Current</dt><dd style={{ margin: 0 }}>{current}</dd>
          <dt>Allowed</dt><dd style={{ margin: 0 }}>{limits}</dd>
          {dialog.stage === 'confirm' && dialog.value !== undefined && <><dt>Requested</dt><dd aria-label="Requested value" style={{ margin: 0, fontWeight: 700 }}>{formatCommandValue(variable, dialog.value)}</dd></>}
        </dl>
        {dialog.stage === 'form' ? (
          <form onSubmit={(e) => { e.preventDefault(); onReview(); }}>
            {variable.dataType === 'bool' ? (
              <fieldset style={{ border: 'none', padding: 0 }}>
                <legend>New state</legend>
                <label><input type="radio" name="command-bool" checked={dialog.input === true} onChange={() => onChange(true)} /> On</label>{' '}
                <label><input type="radio" name="command-bool" checked={dialog.input === false} onChange={() => onChange(false)} /> Off</label>
              </fieldset>
            ) : (
              <label>New value{variable.unit ? ` (${variable.unit})` : ''} <input aria-label="New value" autoFocus inputMode="decimal" value={typeof dialog.input === 'string' ? dialog.input : ''} onChange={(e) => onChange(e.target.value)} aria-invalid={!!dialog.error} /></label>
            )}
            {dialog.error && <div role="alert" style={{ color: '#ffb224', marginTop: 6 }}>{dialog.error}</div>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit">Review</button>
              <button type="button" onClick={onCancel}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            {confirm && <p style={{ margin: '0 0 8px' }}>{confirm}</p>}
            <p role="note" style={{ margin: '0 0 8px', padding: 8, borderLeft: '3px solid #ffb224', background: '#2e2108' }}>{COMMAND_NOTICE}</p>
            {dialog.error && <div role="alert" style={{ color: '#ffb224' }}>{dialog.error}</div>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" onClick={onConfirm}>Send request</button>
              <button type="button" onClick={onBack}>Back</button>
              <button type="button" ref={cancel} onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
