import React, { useEffect, useMemo, useState } from 'react';
import { applyTagSuggestions, dataTypes, protocols, reviewTags, suggestVariables, validateScene, type DataType, type ScadaScene, type SceneValidationOptions, type TagFinding } from '@sakibcoolz/core';
import type { ComponentRegistry } from '@sakibcoolz/components';
import {
  addressKind, commitEntry, dataSourceForm, emptyDataSource, emptyVariable, removeEntry, toDataSource, toVariable, variableForm,
  type DataSourceForm, type VariableForm,
} from './tagForms.js';

// The tag and variable editor (ADR-0027, T-089): the scene's data sources and read-only runtime
// variables (ADR-0024), with suggestions and review. Every save is validated by core first; errors show
// beside their field and nothing invalid is committed. All text is React text.

type Commit = (scene: ScadaScene) => void;
type Errors = Record<string, string>;
const box: React.CSSProperties = { border: '1px solid #ffffff22', borderRadius: 4, padding: 8, margin: '6px 0' };
const muted: React.CSSProperties = { opacity: 0.7, fontSize: 11 };
const errorStyle: React.CSSProperties = { color: '#ff9a9a', fontSize: 11 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 };

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactElement }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
      {label}
      {React.cloneElement(children as React.ReactElement<{ 'aria-invalid'?: boolean; 'aria-label'?: string }>, { 'aria-label': label, 'aria-invalid': error ? true : undefined })}
      {hint && <span style={muted}>{hint}</span>}
      {error && <span role="alert" style={errorStyle}>{error}</span>}
    </label>
  );
}

function DataSourceEditor({ scene, index, options, onCommit, onDone }: { scene: ScadaScene; index?: number; options: SceneValidationOptions; onCommit: Commit; onDone: () => void }) {
  const previous = index === undefined ? undefined : scene.dataSources?.[index];
  const [form, setForm] = useState<DataSourceForm>(() => (previous ? dataSourceForm(previous) : emptyDataSource()));
  const [errors, setErrors] = useState<Errors>({});
  const set = (change: Partial<DataSourceForm>) => setForm((f) => ({ ...f, ...change }));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const result = commitEntry(scene, 'dataSources', index, toDataSource(form, previous), options);
    if (!result.ok) return setErrors(result.errors);
    onCommit(result.scene);
    onDone();
  };
  return (
    <form aria-label={index === undefined ? 'New data source' : `Edit data source ${previous?.id}`} onSubmit={save} style={box}>
      <div style={grid}>
        <Field label="Source ID" error={errors.id}><input value={form.id} onChange={(e) => set({ id: e.target.value })} /></Field>
        <Field label="Source name" error={errors.name}><input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Protocol" error={errors.protocol} hint="Or a namespaced host protocol, such as com.example.bus">
          <input list="s3-protocols" value={form.protocol} onChange={(e) => set({ protocol: e.target.value })} />
        </Field>
        <Field label="Device" error={errors.deviceId}>
          <select value={form.deviceId} onChange={(e) => set({ deviceId: e.target.value })}>
            <option value="">none</option>
            {scene.components.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
          </select>
        </Field>
        <Field label="Endpoint reference" error={errors.endpointRef} hint="A reference your host resolves, never a password">
          <input value={form.endpointRef} onChange={(e) => set({ endpointRef: e.target.value })} />
        </Field>
      </div>
      {errors._ && <div role="alert" style={errorStyle}>{errors._}</div>}
      <datalist id="s3-protocols">{protocols.map((p) => <option key={p} value={p} />)}</datalist>
      <button type="submit">Save data source</button> <button type="button" onClick={onDone}>Cancel</button>
    </form>
  );
}

function VariableEditor({ scene, index, options, onCommit, onDone }: { scene: ScadaScene; index?: number; options: SceneValidationOptions; onCommit: Commit; onDone: () => void }) {
  const previous = index === undefined ? undefined : scene.runtimeVariables?.[index];
  const [form, setForm] = useState<VariableForm>(() => (previous ? variableForm(previous) : emptyVariable()));
  const [errors, setErrors] = useState<Errors>({});
  const set = (change: Partial<VariableForm>) => setForm((f) => ({ ...f, ...change }));
  const protocol = scene.dataSources?.find((s) => s.id === form.dataSourceId)?.protocol;
  const kind = addressKind(protocol);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const built = toVariable(form, protocol);
    if ('field' in built) return setErrors({ [built.field]: built.message });
    const result = commitEntry(scene, 'runtimeVariables', index, built.variable, options);
    if (!result.ok) return setErrors(result.errors);
    onCommit(result.scene);
    onDone();
  };
  const input = (field: keyof VariableForm, label: string, hint?: string) => (
    <Field label={label} error={errors[field]} hint={hint}><input value={form[field] as string} onChange={(e) => set({ [field]: e.target.value } as Partial<VariableForm>)} /></Field>
  );
  return (
    <form aria-label={index === undefined ? 'New variable' : `Edit variable ${previous?.id}`} onSubmit={save} style={box}>
      <div style={grid}>
        {input('id', 'Tag ID')}
        {input('name', 'Variable name')}
        <Field label="Component" error={errors.componentId}>
          <select value={form.componentId} onChange={(e) => set({ componentId: e.target.value })}>
            <option value="">none</option>
            {scene.components.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
          </select>
        </Field>
        <Field label="Data type" error={errors.dataType}>
          <select value={form.dataType} onChange={(e) => set({ dataType: e.target.value as DataType })}>{dataTypes.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        {input('unit', 'Unit')}
        <Field label="Source" error={errors.dataSourceId}>
          <select value={form.dataSourceId} onChange={(e) => set({ dataSourceId: e.target.value })}>
            <option value="">none (host supplies values)</option>
            {(scene.dataSources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name ?? s.id} ({s.protocol})</option>)}
          </select>
        </Field>
        {form.dataSourceId && input('variable', 'Source variable name')}
      </div>
      {form.dataSourceId && kind === 'modbus' && (
        <fieldset style={{ ...grid, border: 'none', padding: 0, marginTop: 6 }}>
          <Field label="Modbus area" error={errors.area}>
            <select value={form.area} onChange={(e) => set({ area: e.target.value })}>{['coil', 'discrete', 'input', 'holding'].map((a) => <option key={a}>{a}</option>)}</select>
          </Field>
          {input('address', 'Register address', '0–65535')}
          {input('unitId', 'Unit ID')}
          <Field label="Byte order" error={errors.byteOrder}>
            <select value={form.byteOrder} onChange={(e) => set({ byteOrder: e.target.value })}><option value="">default</option><option>big</option><option>little</option></select>
          </Field>
          <Field label="Word order" error={errors.wordOrder}>
            <select value={form.wordOrder} onChange={(e) => set({ wordOrder: e.target.value })}><option value="">default</option><option>high-first</option><option>low-first</option></select>
          </Field>
          {input('bit', 'Bit', 'For a bool in a register, 0–15')}
        </fieldset>
      )}
      {form.dataSourceId && kind === 'opcua' && <div style={{ ...grid, marginTop: 6 }}>{input('nodeId', 'Node ID', 'e.g. ns=2;s=Line1.Level')}{input('namespaceUri', 'Namespace URI')}</div>}
      {form.dataSourceId && kind === 'json' && <div style={{ marginTop: 6 }}>{input('rawAddress', 'Address (JSON)', 'Checked by the host for its protocol')}</div>}
      {errors.address && <div role="alert" style={errorStyle}>{errors.address}</div>}
      <label style={{ display: 'block', fontSize: 12, marginTop: 6 }}><input type="checkbox" checked={form.scaling} onChange={(e) => set({ scaling: e.target.checked })} /> Linear scaling (descriptive; the host applies it)</label>
      {form.scaling && <div style={grid}>{input('rawMin', 'Raw minimum')}{input('rawMax', 'Raw maximum')}{input('min', 'Scaled minimum')}{input('max', 'Scaled maximum')}</div>}
      {errors.scaling && <div role="alert" style={errorStyle}>{errors.scaling}</div>}
      <Field label="Access" error={errors.access}>
        <select value={form.access} onChange={(e) => set({ access: e.target.value as VariableForm['access'] })}>
          <option value="read">read only</option>
          <option value="readWrite">read and request changes</option>
        </select>
      </Field>
      {form.access === 'readWrite' && (
        <div style={grid}>
          {form.dataType !== 'bool' && <>{input('commandMin', 'Command minimum')}{input('commandMax', 'Command maximum')}</>}
          {input('commandStep', 'Command step', 'Optional, counted from the minimum')}
          {input('commandConfirm', 'Confirmation note', 'Optional, shown before a request')}
        </div>
      )}
      {errors._ && <div role="alert" style={errorStyle}>{errors._}</div>}
      <p style={muted}>{form.access === 'readWrite' ? 'The SDK never writes tags: a writable variable lets the runtime send a confirmed request to the host, whose gateway must enforce these limits too.' : 'Read only: the SDK never writes tags.'}</p>
      <button type="submit">Save variable</button> <button type="button" onClick={onDone}>Cancel</button>
    </form>
  );
}

function Suggestions({ scene, options, onCommit }: { scene: ScadaScene; options: SceneValidationOptions & Parameters<typeof suggestVariables>[1]; onCommit: Commit }) {
  const proposals = useMemo(() => suggestVariables(scene, options), [scene, options]);
  const [picked, setPicked] = useState<Set<string> | undefined>();
  const chosen = picked ?? new Set(proposals.variables.map((v) => v.id));
  const [error, setError] = useState('');
  if (proposals.variables.length === 0) return <p style={muted}>No suggestions: every template already has a tag.</p>;
  const add = () => {
    const variables = proposals.variables.filter((v) => chosen.has(v.id));
    const bindings = proposals.bindings.filter((b) => chosen.has(b.tagId));
    const result = applyTagSuggestions(scene, { variables, bindings }, options);
    if (!result.ok) return setError(result.errors[0].message);
    setPicked(undefined);
    setError('');
    onCommit(result.scene);
  };
  return (
    <div role="group" aria-label="Suggested tags">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 180, overflowY: 'auto', fontSize: 12 }}>
        {proposals.variables.map((v) => (
          <li key={v.id}>
            <label>
              <input type="checkbox" checked={chosen.has(v.id)} onChange={(e) => { const next = new Set(chosen); if (e.target.checked) next.add(v.id); else next.delete(v.id); setPicked(next); }} />{' '}
              {v.id} <span style={muted}>{v.dataType}{v.unit ? ` · ${v.unit}` : ''}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <div role="alert" style={errorStyle}>{error}</div>}
      <button type="button" disabled={chosen.size === 0} onClick={add}>Add {chosen.size} selected</button>
    </div>
  );
}

/** Where a review finding points: a component to select, or a variable to edit. */
function findingTarget(scene: ScadaScene, f: TagFinding): { component?: string; variable?: number } {
  const index = (list: string) => { const m = new RegExp(`^${list}\\[(\\d+)\\]`).exec(f.path); return m ? Number(m[1]) : undefined; };
  const c = index('components');
  if (c !== undefined) return { component: scene.components[c]?.id };
  const v = index('runtimeVariables');
  if (v !== undefined) return { variable: v };
  const b = index('tagBindings');
  const binding = b === undefined ? undefined : scene.tagBindings?.[b];
  return binding?.kind === 'property' ? { component: binding.instanceId } : {};
}

export function TagEditor({ scene, registry, readOnly, onCommit, onSelectComponent, onClose }: {
  scene: ScadaScene; registry: ComponentRegistry; readOnly: boolean; onCommit: Commit; onSelectComponent: (id: string) => void; onClose: () => void;
}) {
  const options = registry.resolvers;
  const [editing, setEditing] = useState<{ list: 'source' | 'variable'; index?: number } | undefined>();
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const findings = useMemo(() => reviewTags(scene, options), [scene, options]);
  const remove = (list: 'dataSources' | 'runtimeVariables', index: number) => {
    const next = removeEntry(scene, list, index);
    const result = validateScene(next, options);
    if (!result.ok) return setProblem(`Cannot remove it: ${result.errors[0].message}`);
    setProblem('');
    onCommit(next);
  };
  const done = () => setEditing(undefined);
  const section = (title: string, children: React.ReactNode) => <section aria-label={title} style={{ marginBottom: 12 }}><h3 style={{ fontSize: 13, margin: '4px 0' }}>{title}</h3>{children}</section>;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Tags" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 94vw)', maxHeight: '88vh', overflowY: 'auto', background: '#132435', color: '#ebf2fa', border: '1px solid #3c5366', borderRadius: 6, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Tags</h2>
          <button type="button" onClick={onClose} aria-label="Close tags">×</button>
        </div>
        {readOnly && <p style={muted}>Editing is locked: the tags are shown read only.</p>}
        {problem && <div role="alert" style={errorStyle}>{problem}</div>}

        {section('Data sources', <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {(scene.dataSources ?? []).map((s, i) => (
              <li key={s.id} aria-label={`Data source ${s.id}`}>
                <b>{s.name ?? s.id}</b> <span style={muted}>{s.id} · {s.protocol}{s.endpointRef ? ` · ${s.endpointRef}` : ''}</span>
                {!readOnly && <> <button type="button" onClick={() => setEditing({ list: 'source', index: i })}>Edit</button> <button type="button" onClick={() => remove('dataSources', i)}>Remove</button></>}
              </li>
            ))}
          </ul>
          {!scene.dataSources?.length && <p style={muted}>No data sources.</p>}
          {editing?.list === 'source' && <DataSourceEditor key={editing.index ?? 'new'} scene={scene} index={editing.index} options={options} onCommit={onCommit} onDone={done} />}
          {!readOnly && editing?.list !== 'source' && <button type="button" onClick={() => setEditing({ list: 'source' })}>Add data source</button>}
        </>)}

        {section('Variables', <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {(scene.runtimeVariables ?? []).map((v, i) => (
              <li key={v.id} aria-label={`Variable ${v.id}`}>
                <b>{v.id}</b> <span style={muted}>{v.dataType}{v.unit ? ` · ${v.unit}` : ''}{v.source ? ` · from ${v.source.dataSourceId}` : ''}</span>
                {!readOnly && <> <button type="button" onClick={() => setEditing({ list: 'variable', index: i })}>Edit</button> <button type="button" onClick={() => remove('runtimeVariables', i)}>Remove</button></>}
              </li>
            ))}
          </ul>
          {!scene.runtimeVariables?.length && <p style={muted}>No variables.</p>}
          {editing?.list === 'variable' && <VariableEditor key={editing.index ?? 'new'} scene={scene} index={editing.index} options={options} onCommit={onCommit} onDone={done} />}
          {!readOnly && editing?.list !== 'variable' && <button type="button" onClick={() => setEditing({ list: 'variable' })}>Add variable</button>}
        </>)}

        {!readOnly && section('Suggestions', <Suggestions scene={scene} options={options} onCommit={onCommit} />)}

        {section('Review', findings.length === 0 ? <p style={muted}>No findings.</p> : (
          <ul aria-label="Review findings" style={{ paddingLeft: 16, margin: 0, fontSize: 12 }}>
            {findings.map((f, i) => {
              const target = findingTarget(scene, f);
              return (
                <li key={i}>
                  <span style={muted}>{f.code}</span> {f.message}{' '}
                  {target.component && <button type="button" onClick={() => { onSelectComponent(target.component!); onClose(); }}>Show component</button>}
                  {target.variable !== undefined && !readOnly && <button type="button" onClick={() => setEditing({ list: 'variable', index: target.variable })}>Edit variable</button>}
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </div>
  );
}
