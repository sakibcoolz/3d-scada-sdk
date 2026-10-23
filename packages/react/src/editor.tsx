// The editor: palette, Properties, history, import and export, wiring and tags, around the viewer.
// It imports the viewer; the viewer never imports it (ADR-0028).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Camera } from 'three';
import { addAssociation, connect as connectPorts, disconnect as disconnectEdge, removeAssociation, type Relationship, type SceneConnection, assemblyOf, clipboardWidth, copyComponents, pasteComponents, validateScene, type ComponentClipboard, connectionsOf, lockConnectedAsChildren, moveAssembly, unlockFromParent, connectTouchingPorts, attachComponents, portsCompatible, findOpenJoints, seatOnConnection, createEmptyScene, findTouchingPorts, portToWorld, removeComponent, type PropertyState, type TagBinding, serializeScene, type ComponentInstance, type ComponentType, type SceneUnderlay, type QuaternionLike, type Vector3Like, type ScadaScene, type SceneViews, type Vector3Tuple } from '@sakibcoolz/core';
import { builtInRegistry, componentPresets, isChoiceParameter, sizeOfPort, type ChoiceParameterSpec, type ComponentRegistry, type NumberParameterSpec } from '@sakibcoolz/components';
import { RegistryContext, useRegistry } from './registryContext.js';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop.js';
import { EDITOR_CSS, formatMetres } from './editorStyles.js';
import { sanitizeSvg } from '@sakibcoolz/asset-import';
import { componentNames, describeAttach, describeLock, describeNewConnections, describeSeat } from './connectionNotice.js';
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.js';
import { importSceneText, MAX_SCENE_FILE_BYTES } from './sceneFile.js';
import { describeProperty } from './telemetryView.js';
import { PortsInspector, RelationsExplorer } from './inspector.js';
import { describePorts } from './ports.js';
import { describeRelations } from './relations.js';
import { wiringCandidates } from './wiring.js';
import { TagEditor } from './tagEditor.js';
import { nudge } from './keyboard.js';
import { degreesFromRotation, rotationFromDegrees, turnAboutWorldAxis } from './rotationForm.js';
import { liquidFill, viewModes, type ViewMode } from './appearance.js';
import { Scada3DViewer, Underlay, collidingWith, useNow, useTelemetry, useTelemetryFeed, type FlowInput, type InstancingMode, type ScadaHandle, type SelectHandler, type SimulationInput, type TelemetryInput, type TransformHandler, type TransformMode, type WalkPlacing } from './viewer.js';

/** Authored starting properties for a newly added component of each type. */
function defaultProperties(type: ComponentType, registry: ComponentRegistry): ComponentInstance['properties'] {
  const state: ComponentInstance['properties'] = registry.definitionFor(type).bindable?.level !== undefined ? { level: 45 } : type === 'valve' ? { open: true } : {};
  const parameters = registry.definitionFor(type).parameters ?? {};
  // Choices (size) are left out: absent means the default, so files only record a deliberate size.
  // A numeric `initial` (e.g. a tank stand) is what new parts start with.
  return { ...state, ...Object.fromEntries(Object.entries(parameters).flatMap(([name, spec]) => (isChoiceParameter(spec) ? [] : [[name, spec.initial ?? spec.default]]))) };
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A text field that commits on Enter or blur, so typing a tag is one undo step. */
function CommitField({ label, value, onCommit, list }: { label: string; value: string; onCommit: (value: string) => void; /** A datalist of suggested values. */ list?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="s3-stack" style={{fontSize:12}}>{label} <input aria-label={label} value={draft} placeholder="tag id" list={list}
    onChange={e=>setDraft(e.target.value)} onBlur={()=>onCommit(draft)} onKeyDown={e=>{if(e.key==='Enter')onCommit(draft);}}/></label>;
}

/** Tag bindings for the selected component's bindable properties and its connections, plus live values. */
function BindingsEditor({ component, scene, live, onSet }: {
  component: ComponentInstance; scene: ScadaScene; live?: readonly PropertyState[];
  onSet: (match: (b: TagBinding) => boolean, make: (tagId: string) => TagBinding, tagId: string) => void;
}) {
  const registry = useRegistry();
  const bindable = registry.definitionFor(component.type).bindable ?? {};
  const connections = scene.connections.filter(c => c.from.instanceId === component.id || c.to.instanceId === component.id);
  const neighbourLabel = (c: typeof connections[number]) => {
    const otherId = c.from.instanceId === component.id ? c.to.instanceId : c.from.instanceId;
    const other = scene.components.find(x => x.id === otherId);
    return other ? registry.definitionFor(other.type).label : otherId;
  };
  const states = live?.filter(p => p.instanceId === component.id) ?? [];
  if (Object.keys(bindable).length === 0 && connections.length === 0) return null;
  return <div>
    {/* The scene's variables, offered as tag ids; opaque host tags stay allowed (ADR-0027). */}
    <datalist id="s3-variable-ids">{(scene.runtimeVariables??[]).map(v=><option key={v.id} value={v.id}/>)}</datalist>
    {Object.keys(bindable).map(property => {
      const match = (b: TagBinding) => b.kind === 'property' && b.instanceId === component.id && b.property === property;
      return <CommitField key={property} list="s3-variable-ids" label={`Tag for ${property}`} value={scene.tagBindings?.find(match)?.tagId ?? ''}
        onCommit={tag => onSet(match, tagId => ({ id: newId(), tagId, kind: 'property', instanceId: component.id, property }), tag)}/>;
    })}
    {connections.map(c => {
      const match = (b: TagBinding) => b.kind === 'flow' && b.connectionId === c.id;
      return <CommitField key={c.id} list="s3-variable-ids" label={`Flow tag for connection to ${neighbourLabel(c)}`} value={scene.tagBindings?.find(match)?.tagId ?? ''}
        onCommit={tag => onSet(match, tagId => ({ id: newId(), tagId, kind: 'flow', connectionId: c.id }), tag)}/>;
    })}
    {states.length > 0 && <ul aria-label="Live values" style={{fontSize:12,paddingLeft:16,margin:'6px 0'}}>
      {states.map(p => <li key={p.bindingId}>{describeProperty(p, bindable[p.property])}</li>)}
    </ul>}
  </div>;
}

/** Keyboard-reachable list of everything in the scene; selecting here equals clicking in the canvas. */
function SceneList({ scene, selected, onSelect, locked }: { scene: ScadaScene; selected?: string; onSelect: SelectHandler; locked?: boolean }) {
  const registry = useRegistry();
  const names = componentNames(scene, registry);
  // Roots in scene order, each followed by its descendants (indented).
  const children = new Map<string, string[]>();
  const ids = new Set(scene.components.map((c) => c.id));
  for (const c of scene.components) if (c.parentId && ids.has(c.parentId)) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  const entries: { id: string; name: string; depth: number }[] = [];
  const visit = (id: string, depth: number) => {
    entries.push({ id, name: names.get(id)!, depth });
    for (const child of children.get(id) ?? []) visit(child, depth + 1);
  };
  for (const c of scene.components) if (!c.parentId || !ids.has(c.parentId)) visit(c.id, 0);
  if (entries.length === 0) return null;
  return <nav aria-label="Scene components" style={{margin:'10px 0'}}>
    <small>{locked ? 'In scene (editing locked)' : 'In scene (arrows move, R turns, Delete removes)'}</small>
    <div style={{maxHeight:160,overflowY:'auto'}}>
      {entries.map(e => <button key={e.id} aria-pressed={selected === e.id} onClick={(ev) => onSelect(e.id, { additive: ev.shiftKey })}
        style={{display:'block',width:`calc(100% - ${e.depth*14}px)`,marginLeft:e.depth*14,textAlign:'left',marginTop:3}}>{e.name}</button>)}
    </div>
  </nav>;
}

/** A number field that keeps what is typed (e.g. a lone "-") and reports only finite values. */
function DegreeField({ label, value, onValue }: { label: string; value: number; onValue: (n: number) => void }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  return <input aria-label={label} type="number" step="15" style={{width:62}} value={draft ?? String(value)}
    onFocus={()=>setDraft(String(value))} onBlur={()=>setDraft(undefined)}
    onChange={e=>{setDraft(e.target.value);const n=Number(e.target.value);if(e.target.value.trim()!==''&&Number.isFinite(n))onValue(n);}}/>;
}

/**
 * Rotation as Euler XYZ degrees (applied X, then Y, then Z, like Three.js), with quick ±90° turns
 * about world axes and a reset. Typing in one field is one undo step (merge key per axis).
 */
/** A position in metres, shown to the millimetre; the typed value is kept exactly while editing. */
function MetreField({ label, value, onValue }: { label: string; value: number; onValue: (n: number) => void }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  return <label className="s3-field">{label} <input type="number" step=".1" value={draft ?? formatMetres(value)}
    onFocus={()=>setDraft(formatMetres(value))} onBlur={()=>setDraft(undefined)}
    onChange={e=>{setDraft(e.target.value);const n=Number(e.target.value);if(e.target.value.trim()!==''&&Number.isFinite(n))onValue(n);}}/></label>;
}

function RotationFields({ rotation, onChange }: { rotation: QuaternionLike; onChange: (rotation: QuaternionLike, mergeKey?: string) => void }) {
  const degrees = degreesFromRotation(rotation);
  const axes = ['x', 'y', 'z'] as const;
  return <fieldset style={{border:'none',padding:0,margin:'10px 0 0'}}>
    <legend style={{fontSize:13}}>Rotation (degrees)</legend>
    {axes.map(axis => <div key={axis} style={{display:'flex',alignItems:'center',gap:4,marginTop:4}}>
      <span style={{width:14}}>{axis.toUpperCase()}</span>
      <DegreeField label={`Rotation ${axis.toUpperCase()} (degrees)`} value={degrees[axis]} onValue={n=>onChange(rotationFromDegrees({...degrees,[axis]:n}),axis)}/>
      <button aria-label={`Turn −90° about ${axis.toUpperCase()}`} onClick={()=>onChange(turnAboutWorldAxis(rotation,axis,-90))}>−90</button>
      <button aria-label={`Turn +90° about ${axis.toUpperCase()}`} onClick={()=>onChange(turnAboutWorldAxis(rotation,axis,90))}>+90</button>
    </div>)}
    <button style={{marginTop:6}} onClick={()=>onChange({x:0,y:0,z:0,w:1})}>Reset rotation</button>
  </fieldset>;
}

/**
 * A shape parameter such as pipe length. Values outside the catalog range are not applied; the
 * field says why. One end stays where it is: the connected end if only one end is connected,
 * otherwise the first port (a pipe's inlet). So a component joined at the fixed end stays joined.
 */
function ParameterField({ name, spec, component, connectedPorts, onChange }: {
  name: string; spec: NumberParameterSpec; component: ComponentInstance; connectedPorts: ReadonlySet<string>;
  onChange: (changes: Pick<ComponentInstance, 'position' | 'properties'>) => void;
}) {
  const registry = useRegistry();
  const current = typeof component.properties[name] === 'number' ? component.properties[name] as number : spec.default;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const value = draft ?? String(current);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= spec.min && n <= spec.max;
  function apply(next: number) {
    const properties = { ...component.properties, [name]: next };
    const ports = registry.definitionFor(component.type, component.properties).ports;
    const connected = ports.filter((p) => connectedPorts.has(p.id));
    const anchorId = (connected.length === 1 ? connected[0] : ports[0])?.id;
    const anchor = (props: ComponentInstance['properties']) => registry.definitionFor(component.type, props).ports.find((p) => p.id === anchorId);
    const before = anchor(component.properties), after = anchor(properties);
    let position = component.position;
    if (spec.keepsBottom) {
      // Keep the feet on the floor: the body moves by the change in its lowest point.
      const lowest = (props: ComponentInstance['properties']) => registry.definitionFor(component.type, props).bounds.min[1];
      onChange({ position: { ...position, y: position.y + lowest(component.properties) - lowest(properties) }, properties });
      return;
    }
    if (before && after) {
      const [b, a] = [portToWorld(component, before).position, portToWorld(component, after).position];
      position = { x: position.x + b[0] - a[0], y: position.y + b[1] - a[1], z: position.z + b[2] - a[2] };
    }
    onChange({ position, properties });
  }
  const label = `${spec.label} (${spec.unit})`;
  return <label className="s3-stack">{label} <input aria-label={label} type="number" min={spec.min} max={spec.max} step={spec.step} value={value}
      onFocus={()=>setDraft(String(current))} onBlur={()=>setDraft(undefined)}
      onChange={e=>{setDraft(e.target.value);const v=Number(e.target.value);if(e.target.value.trim()!==''&&Number.isFinite(v)&&v>=spec.min&&v<=spec.max)apply(v);}}/>
    {!valid&&<small role="alert" style={{display:'block',color:'#ff9aa2'}}>{spec.label} must be between {spec.min} and {spec.max} {spec.unit}.</small>}
  </label>;
}

/**
 * A fixed-choice shape parameter (pipe size). Ports stay where they are, so only the size changes;
 * a change that would join different sizes is refused with the reason (ADR-0009).
 */
function ChoiceField({ name, spec, component, scene, onChange }: {
  name: string; spec: ChoiceParameterSpec; component: ComponentInstance; scene: ScadaScene;
  onChange: (changes: Pick<ComponentInstance, 'properties'>) => void;
}) {
  const registry = useRegistry();
  const [problem, setProblem] = useState('');
  const current = typeof component.properties[name] === 'string' ? component.properties[name] as string : spec.default;
  function choose(value: string) {
    const { [name]: _, ...rest } = component.properties;
    const properties = value === spec.default ? rest : { ...rest, [name]: value };
    const invalid = registry.resolvers.validateProperties(component.type, properties)[0];
    if (invalid) { setProblem(`${spec.label} ${invalid.message.replace('must differ from size', 'must differ from the inlet size')}.`); return; }
    const mismatch = sizeMismatch(scene, component, properties, registry);
    if (mismatch) { setProblem(mismatch); return; }
    setProblem('');
    onChange({ properties });
  }
  return <label className="s3-stack">{spec.label} <select aria-label={spec.label} value={current} onChange={e=>choose(e.target.value)}>{spec.choices.map(c=><option key={c} value={c}>{c}</option>)}</select>
    {problem&&<small role="alert" style={{display:'block',color:'#ff9aa2'}}>{problem}</small>}
  </label>;
}

/** Why `properties` would leave one of the component's connections between different sizes, if so. */
function sizeMismatch(scene: ScadaScene, component: ComponentInstance, properties: ComponentInstance['properties'], registry: ComponentRegistry): string | undefined {
  const names = componentNames(scene, registry);
  const ports = registry.resolvers.resolvePorts(component.type, properties) ?? [];
  for (const c of connectionsOf(scene, component.id)) {
    const [own, other] = c.from.instanceId === component.id ? [c.from, c.to] : [c.to, c.from];
    const partner = scene.components.find((x) => x.id === other.instanceId);
    const theirs = partner && registry.resolvers.resolvePorts(partner.type, partner.properties)?.find((p) => p.id === other.portId);
    const mine = ports.find((p) => p.id === own.portId);
    if (mine && theirs && !portsCompatible(mine, theirs)) {
      return `"${own.portId}" is connected to ${names.get(other.instanceId)} "${other.portId}" (${sizeOfPort(theirs) ?? 'another size'}). Disconnect it or put a reducer between them.`;
    }
  }
  return undefined;
}

/** Largest SVG the editor reads as an underlay (the sanitizer enforces the same limit). */
const MAX_UNDERLAY_FILE_BYTES = 512 * 1024;

/** Import, place and remove the scene's reference drawing (ADR-0012). */
function UnderlayControls({ scene, onChange }: { scene: ScadaScene; onChange: (underlay: SceneUnderlay | undefined, mergeKey?: string) => void }) {
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const u = scene.underlay;
  function load(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_UNDERLAY_FILE_BYTES) { setMessage({ text: `Could not use this SVG: larger than ${MAX_UNDERLAY_FILE_BYTES} bytes.`, error: true }); return; }
    file.text().then((text) => {
      const r = sanitizeSvg(text);
      if (!r.ok) { setMessage({ text: `Could not use this SVG: ${r.errors[0].message}`, error: true }); return; }
      onChange({ svg: r.markup, position: u?.position ?? { x: 0, z: 0 }, width: u?.width ?? 20, rotation: u?.rotation ?? 0, opacity: u?.opacity ?? 0.6 });
      const dropped = r.notes.filter((n) => n.kind === 'dropped-element').map((n) => `${n.count} ${n.name}`);
      setMessage({ text: `Underlay loaded: ${r.svg.shapes.length} shape${r.svg.shapes.length === 1 ? '' : 's'}.${dropped.length ? ` Not shown: ${dropped.join(', ')}.` : ''}`, error: false });
    }, (error: Error) => setMessage({ text: `Could not read file: ${error.message}`, error: true }));
  }
  const set = (patch: Partial<SceneUnderlay>, key: string) => u && onChange({ ...u, ...patch }, `underlay:${key}`);
  const number = (label: string, value: number, apply: (n: number) => void, attrs: { min?: number; max?: number; step: number }) =>
    <label className="s3-stack">{label} <input aria-label={label} type="number" {...attrs} value={value} onChange={(e) => { const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n) && (attrs.min === undefined || n >= attrs.min) && (attrs.max === undefined || n <= attrs.max)) apply(n); }}/></label>;
  return <>
    <label className="s3-stack">{u ? 'Replace SVG' : 'Import SVG drawing'} <input type="file" accept=".svg,image/svg+xml" aria-label="Import SVG underlay" onChange={load} style={{fontSize:12,maxWidth:'100%'}}/></label>
    {message && <small role={message.error ? 'alert' : 'status'} style={{display:'block',marginTop:4,color:message.error ? '#ff9aa2' : undefined}}>{message.text}</small>}
    {u && <>
      {number('Underlay width (m)', u.width, (n) => n > 0 && set({ width: n }, 'width'), { min: 0.1, max: 1000, step: 1 })}
      {number('Underlay X (m)', u.position.x, (n) => set({ position: { ...u.position, x: n } }, 'x'), { step: 0.5 })}
      {number('Underlay Z (m)', u.position.z, (n) => set({ position: { ...u.position, z: n } }, 'z'), { step: 0.5 })}
      {number('Underlay rotation (°)', u.rotation, (n) => set({ rotation: n }, 'rotation'), { step: 15 })}
      <label className="s3-stack">Underlay opacity <input aria-label="Underlay opacity" type="range" min={0} max={1} step={0.05} value={u.opacity} onChange={(e) => set({ opacity: Number(e.target.value) }, 'opacity')}/></label>
      <button className="s3-danger s3-block" onClick={() => { onChange(undefined); setMessage(undefined); }}>Remove underlay</button>
    </>}
  </>;
}

/** Parent/child locks for the selected component (ADR-0008). */
function AssemblyControls({ component, scene, onChange, onNotice }: { component: ComponentInstance; scene: ScadaScene; onChange: (next: ScadaScene) => void; onNotice: (lines: string[]) => void }) {
  const registry = useRegistry();
  const names = componentNames(scene, registry);
  const children = scene.components.filter((c) => c.parentId === component.id).length;
  const assemblySize = assemblyOf(scene, component.id).length;
  const hasConnections = connectionsOf(scene, component.id).length > 0;
  return <div>
    <small>Assembly</small>
    {component.parentId && <p style={{fontSize:12,margin:'4px 0'}}>Locked to {names.get(component.parentId)}</p>}
    {children > 0 && <p style={{fontSize:12,margin:'4px 0'}}>Parent of {children} component{children === 1 ? '' : 's'}</p>}
    {assemblySize === 1 && <p style={{fontSize:12,margin:'4px 0'}}>Not in an assembly. Moving it moves only this component.</p>}
    <div className="s3-row">
    <button disabled={!hasConnections} title="Make this the parent of everything connected to it; then they all move together"
      onClick={() => { const r = lockConnectedAsChildren(scene, component.id, registry.resolvers); if (r.ok) { onChange(r.scene); onNotice([describeLock(r.scene, component.id, registry)]); } }}>Lock connected as children</button>
    {component.parentId && <button onClick={() => onChange(unlockFromParent(scene, component.id))}>Unlock from parent</button>}
    {children > 0 && <button onClick={() => onChange(unlockFromParent(scene, component.id))}>Unlock assembly</button>}
    </div>
  </div>;
}

/** "Seat on …" for each open joint of the selected part: moves it exactly onto its partner. */
function SeatControls({ component, scene, onSeat }: { component: ComponentInstance; scene: ScadaScene; onSeat: (connectionId: string) => void }) {
  const registry = useRegistry();
  const names = componentNames(scene, registry);
  const mine = findOpenJoints(scene, registry.resolvers).filter((o) => o.from.instanceId === component.id || o.to.instanceId === component.id);
  if (mine.length === 0) return null;
  return <div style={{marginTop:10}}>
    <small>Open joints</small>
    {mine.map((o) => {
      const partner = o.from.instanceId === component.id ? o.to : o.from;
      return <button key={o.connectionId} title="Move this part so its port sits exactly on the connected port" onClick={() => onSeat(o.connectionId)} style={{display:'block',marginTop:4}}>Seat on {names.get(partner.instanceId)} "{partner.portId}"</button>;
    })}
  </div>;
}

const viewLabels: Record<ViewMode, string> = { normal: 'Normal', glass: 'Glass', xray: 'X-ray', cutaway: 'Cutaway' };

/** Explains a level that cannot be drawn as entered (policy in `liquidFill`). */
function LevelNote({ level }: { level: unknown }) {
  const fill = liquidFill(level);
  if (fill.status === 'ok') return null;
  const text = fill.status === 'clamped' ? `Level ${level} % is outside 0–100 %; shown as ${fill.fraction * 100} %.` : fill.status === 'missing' ? 'No level set: liquid not shown.' : 'Level is not a number: liquid not shown.';
  return <small style={{display:'block',color:'#ffd166'}}>{text}</small>;
}

const NOTICE_MS = 6000;

/** Bottom-centre canvas message for connections the user just made; dismissable, clears itself. */
function ConnectionNotice({ lines, onDismiss }: { lines: string[]; onDismiss: () => void }) {
  return <div role="status" aria-label="Connection message" aria-live="polite" style={{position:'absolute',bottom:44,left:'50%',transform:'translateX(-50%)',maxWidth:'min(640px, 90%)',display:'flex',gap:10,alignItems:'flex-start',padding:'6px 10px',borderRadius:4,background:'#0d2a1ee6',color:'#d6f5e3',border:'1px solid #3ccf7e',fontSize:12}}>
    <div style={{whiteSpace:'pre-line'}}>{lines.join('\n')}</div>
    <button aria-label="Dismiss connection message" onClick={onDismiss} style={{flex:'none',lineHeight:1,padding:'0 4px'}}>×</button>
  </div>;
}

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function EditorBody({initialScene,onChange,selectedIds,onSelectionChange,flow,telemetry:telemetryInput,simulation,collisions=true,openJoints=true,instancing='auto',joints=true,floor=false,walkthrough=false,locked,defaultLocked=false,onLockedChange,registry=builtInRegistry,ref}:{initialScene?:ScadaScene;onChange?:(scene:ScadaScene)=>void;flow?:FlowInput;telemetry?:TelemetryInput;/** Simulated levels and flows; replaces telemetry and `flow` for those values while set. */simulation?:SimulationInput;/** Highlight overlapping solid components in red. Default true. */collisions?:boolean;/** Mark and list connections whose ports do not meet, in amber. Default true. */openJoints?:boolean;/** Draw plain equipment instanced: 'auto' (default) from 100 components, 'off' or 'always'. */instancing?:InstancingMode;/** Draw flanges, bolts and weld beads at joints (ADR-0015). Default true. */joints?:boolean;/** Draw a concrete floor slab under the equipment. Display only. Default false. */floor?:boolean;/** Offer a first-person walkthrough: Walk on the desktop (mouse look, WASD) and Enter VR on a WebXR headset. View only. Default false. */walkthrough?:boolean;/** Controlled lock: when set, the host decides; the toggle calls onLockedChange. */locked?:boolean;/** Initial lock state when `locked` is not controlled. Default false. */defaultLocked?:boolean;onLockedChange?:(locked:boolean)=>void;/** Component types to draw and edit (ADR-0022): `createComponentRegistry(...)` adds host types. Built-in kinds by default. */registry?:ComponentRegistry;/** Controlled selection shared with other views (ADR-0026): the editor shows the last id. */selectedIds?:readonly string[];/** Called with `[id]` or `[]` when the editor's selection changes. */onSelectionChange?:(ids:string[])=>void;ref?:React.Ref<ScadaHandle>}) {
  // 2D layouts from other views join the history as one step, so undo and the edit lock apply (ADR-0026).
  const viewsRef=useRef<(views:SceneViews|undefined)=>boolean>(()=>false);
  const handleExtra=useMemo(()=>({setViews:(views:SceneViews|undefined)=>viewsRef.current(views)}),[]);
  // The editor owns the feed; the viewer below only receives the merged observations.
  const telemetry=useTelemetryFeed(telemetryInput,ref,handleExtra);
  const [history,setHistory]=useState<History>(()=>createHistory(initialScene??createEmptyScene()));
  const scene=history.present;
  const [ownSelected,setOwnSelected]=useState<string>();
  const selected=selectedIds?selectedIds.at(-1):ownSelected;
  function setSelected(id:string|undefined){if(!selectedIds)setOwnSelected(id);if(id!==selected)onSelectionChange?.(id?[id]:[]);}
  const [viewMode,setViewMode]=useState<ViewMode>('normal');
  /** Per-component view modes: editor display state only, never saved into the scene. */
  const [viewOverrides,setViewOverrides]=useState<Record<string,ViewMode>>({});
  const [transformMode,setTransformMode]=useState<TransformMode>('translate');
  /** Every scene change goes through history; pass a mergeKey to fold a gesture into one undo step. */
  const [ownLocked,setOwnLocked]=useState(defaultLocked);
  /** View-only mode: every scene change below is refused here, whatever control triggered it. */
  const isLocked=locked??ownLocked;
  function setLocked(next:boolean){if(locked===undefined)setOwnLocked(next);onLockedChange?.(next);}
  function update(next:ScadaScene, mergeKey?:string){if(isLocked)return;setHistory(h=>commit(h,next,mergeKey));onChange?.(next);}
  viewsRef.current=(views)=>{
    if(isLocked) return false;
    const {views:_,...rest}=scene;
    update(views&&Object.keys(views).length>0?{...rest,views}:rest);
    return true;
  };
  function travel(step:(h:History)=>History){
    if(isLocked) return;
    const next=step(history);
    if(next===history) return;
    setHistory(next);onChange?.(next.present);
    if(selected&&!next.present.components.some(c=>c.id===selected)) setSelected(undefined);
  }
  function onKeyDown(e:React.KeyboardEvent){
    if(isTextEntry(e.target)) return;
    const key=e.key.toLowerCase();
    const command=e.ctrlKey||e.metaKey;
    // Copying never changes the scene, so it stays available while editing is locked.
    if(isLocked&&e.key!=='Escape'&&!(command&&key==='c')) return;
    if(command){
      if(key==='c'&&selected){e.preventDefault();copyIds(e.shiftKey?assemblyOf(scene,selected):[selected]);return;}
      if(key==='v'){e.preventDefault();paste();return;}
      if(key==='z'&&!e.shiftKey){e.preventDefault();travel(undo);}
      else if((key==='z'&&e.shiftKey)||key==='y'){e.preventDefault();travel(redo);}
      return;
    }
    // Keyboard alternative to the canvas for the selected component.
    const target=scene.components.find(c=>c.id===selected);
    if(!target||e.altKey) return;
    if(e.key==='Escape'){e.preventDefault();setSelected(undefined);return;}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected(target.id);return;}
    const moved=nudge(target,e);
    if(!moved) return;
    e.preventDefault();
    // Repeated presses of the same key fold into one undo step.
    moveMember(target.id,moved.position,moved.rotation,`nudge:${target.id}:${e.key.toLowerCase()}`);
  }
  const root=useRef<HTMLDivElement>(null);
  /** Removes a component (with its edges and bindings); focus moves to the editor so keyboard shortcuts keep working. */
  function removeSelected(id:string){
    if(isLocked) return;
    const result=removeComponent(scene,id);
    if(result.ok)update(result.scene);
    setSelected(undefined);
    root.current?.focus();
  }
  /** Short-lived canvas message after the user connects parts or locks an assembly. */
  const [notice,setNotice]=useState<string[]>([]);
  const [tagsOpen,setTagsOpen]=useState(false);
  useEffect(()=>{if(notice.length===0)return;const t=setTimeout(()=>setNotice([]),NOTICE_MS);return()=>clearTimeout(t);},[notice]);
  function announceConnections(before:ScadaScene,after:ScadaScene){const lines=describeNewConnections(before,after,registry);if(lines.length)setNotice(lines);}
  const camera=useRef<Camera|undefined>(undefined);
  const dragKind=useRef<ComponentType|undefined>(undefined);
  // Starting properties of a palette preset being dragged (e.g. a large dished tank).
  const dragPreset=useRef<ComponentInstance['properties']|undefined>(undefined);
  const [preview,setPreview]=useState<DropPlan>();
  // Placement is never blocked; the status line just warns about an overlap.
  const previewOverlap=useMemo(()=>{
    if(!collisions||!preview) return '';
    const withPreview={...scene,components:[...scene.components,preview.component]};
    const names=componentNames(withPreview, registry);
    const hits=collidingWith(withPreview,preview.component.id,registry).map(id=>names.get(id));
    return hits.length?` — overlaps ${hits.join(', ')}`:'';
  },[collisions,preview,scene]);
  // Keyboard/click add: rest on the ground in a row, never auto-connect.
  function add(type:ComponentType, preset:ComponentInstance['properties']={}) {
    const id=newId();
    const properties={...defaultProperties(type,registry),...preset};
    // In a row, 2.4 m apart, but never into the right-most part (a large tank is wider than that).
    const definition=registry.definitionFor(type,properties);
    const rightEdge=Math.max(-Infinity,...scene.components.map(c=>c.position.x+registry.definitionFor(c.type,c.properties).bounds.max[0]));
    const position=dropPosition(definition,[Math.max(scene.components.length*2.4,rightEdge+0.3-definition.bounds.min[0]),0,0]);
    update({...scene,components:[...scene.components,{id,type,position,rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},properties}]});setSelected(id);
  }
  function planAt(e:React.DragEvent<HTMLElement>, id:string):DropPlan|undefined {
    const kind=dragKind.current, canvas=e.currentTarget.querySelector('canvas');
    if(!kind||!camera.current||!canvas) return undefined;
    const hit=screenToPlane({x:e.clientX,y:e.clientY},canvas.getBoundingClientRect(),camera.current);
    return hit ? planDrop(scene,kind,hit,{registry,createId:()=>id,properties:{...defaultProperties(kind,registry),...dragPreset.current}}) : undefined;
  }
  function endDrag(){dragKind.current=undefined;dragPreset.current=undefined;setPreview(undefined);}
  // Placing at the Walk crosshair (T-065): the same drop plan as dragging from the palette.
  const walkParts=useMemo(()=>[
    ...registry.list().map(d=>d.type).map(k=>({key:`kind:${k}`,label:registry.definitionFor(k).label,type:k,preset:{} as ComponentInstance['properties']})),
    ...componentPresets.map(p=>({key:`preset:${p.id}`,label:p.label,type:p.type,preset:p.properties})),
  ],[]);
  const [walkHold,setWalkHold]=useState<(typeof walkParts)[number]>();
  const walkPoint=useRef<Vector3Tuple|undefined>(undefined);
  const walkPlan=(at:Vector3Tuple,id:string)=>walkHold&&planDrop(scene,walkHold.type,at,{registry,createId:()=>id,properties:{...defaultProperties(walkHold.type,registry),...walkHold.preset}});
  useEffect(()=>{if(isLocked&&walkHold){setWalkHold(undefined);setPreview(undefined);}},[isLocked,walkHold]);
  const walkPlacing:WalkPlacing|undefined=isLocked?undefined:{
    parts:walkParts,
    holding:walkHold?.label,
    onHold:key=>{walkPoint.current=undefined;setPreview(undefined);setWalkHold(walkParts.find(p=>p.key===key));},
    onAimFloor:point=>{walkPoint.current=point;setPreview(point?walkPlan(point,'drop-preview'):undefined);},
    onPlace:()=>{
      const at=walkPoint.current;
      if(!walkHold) return;
      if(!at){setNotice([`Aim at the floor to place ${walkHold.label}.`]);return;}
      const plan=walkPlan(at,newId())!;
      // Component and its snapped connection land as one undo step, as with a palette drop.
      const result=applyDrop(scene,plan,newId,registry);
      if(!result.ok){setNotice([`Cannot place ${walkHold.label}: ${result.error.message}`]);return;}
      update(result.scene);setSelected(plan.component.id);
      const lines=describeNewConnections(scene,result.scene,registry);
      setNotice(lines.length?lines:[`Placed ${componentNames(result.scene, registry).get(plan.component.id)}.`]);
      // Refresh the ghost against the new scene, so it shows where the next one would go.
      setPreview(planDrop(result.scene,walkHold.type,at,{registry,createId:()=>'drop-preview',properties:{...defaultProperties(walkHold.type,registry),...walkHold.preset}}));
    },
  };
  function drop(e:React.DragEvent<HTMLElement>) {
    e.preventDefault();
    if(isLocked){endDrag();return;}
    const plan=planAt(e,newId());
    endDrag();
    if(!plan) return;
    // Component and its snapped connection land as one undo step.
    const result=applyDrop(scene,plan,newId,registry);
    if(result.ok){update(result.scene);setSelected(plan.component.id);announceConnections(scene,result.scene);}
  }
  /** Shift+click attaches the clicked part to the selected one at their closest free ports. */
  const select:SelectHandler=(id,options)=>{
    if(!options?.additive||!selected||selected===id){setSelected(id);return;}
    const names=componentNames(scene, registry);
    if(isLocked){setNotice([`Editing is locked: ${names.get(id)} was not attached.`]);return;}
    const r=attachComponents(scene,selected,id,{...registry.resolvers,createId:newId});
    if(!r.ok){setNotice([`Cannot attach ${names.get(id)} to ${names.get(selected)}: ${r.error.message}`]);return;}
    update(r.scene);
    setSelected(id);
    setNotice([describeAttach(r.scene,r.connection,r.moved,registry)]);
  };
  const component=scene.components.find(c=>c.id===selected);
  function patch(changes:Partial<ComponentInstance>, mergeKey?:string) {
    update({...scene,components:scene.components.map(c=>c.id===selected?{...c,...changes}:c)},mergeKey);
  }
  // A whole gizmo drag shares one gesture key, so it merges into a single undo step.
  /** Every pose change goes through here: members of an assembly move together, rigidly (ADR-0008). */
  function moveMember(id:string,position:Vector3Like,rotation:QuaternionLike,mergeKey?:string){update(moveAssembly(scene,id,position,rotation),mergeKey);}
  const transform:TransformHandler=(id,position,rotation,gesture)=>moveMember(id,position,rotation,gesture);
  const [importText,setImportText]=useState('');
  const [importNote,setImportNote]=useState('');
  const [importErrors,setImportErrors]=useState<string[]>([]);
  /** Replaces the scene only when the text validates; a successful import is one undo step. */
  function loadScene(text:string){
    const result=importSceneText(text,registry);
    if(!result.ok){setImportErrors(result.errors);setImportNote('');return;}
    update(result.scene);setSelected(undefined);setImportErrors([]);setImportNote(result.message);
  }
  function importFile(e:React.ChangeEvent<HTMLInputElement>){
    const input=e.currentTarget, file=input.files?.[0];
    input.value=''; // allow re-importing the same file
    if(!file) return;
    if(file.size>MAX_SCENE_FILE_BYTES){setImportErrors([`File is larger than ${MAX_SCENE_FILE_BYTES} bytes.`]);setImportNote('');return;}
    file.text().then(loadScene,(error:Error)=>{setImportErrors([`Could not read file: ${error.message}`]);setImportNote('');});
  }
  function exportScene(){
    const url=URL.createObjectURL(new Blob([serializeScene(scene)],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download='scene.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  const serialized=useMemo(()=>serializeScene(scene),[scene]);
  const [clipboard,setClipboard]=useState<ComponentClipboard>();
  const pasteCount=useRef(0);
  const [clipNote,setClipNote]=useState('');
  const plural=(n:number)=>`${n} component${n===1?'':'s'}`;
  function copyIds(ids:string[]){
    setClipboard(copyComponents(scene,ids));
    pasteCount.current=0;
    setClipNote(`Copied ${plural(ids.length)}.`);
  }
  /** Pastes beside the original (copy width + 0.5 m along +X, further each time) as one undo step. */
  function paste(){
    if(!clipboard||isLocked) return;
    pasteCount.current+=1;
    const step=clipboardWidth(clipboard,registry.resolvers)+0.5;
    const pasted=pasteComponents(scene,clipboard,{createId:newId,offset:{x:step*pasteCount.current,y:0,z:0}});
    const checked=validateScene(pasted.scene,registry.resolvers);
    if(!checked.ok){setClipNote(`Could not paste: ${checked.errors[0].message}`);return;}
    update(checked.scene);
    const root=checked.scene.components.find(c=>pasted.pastedIds.includes(c.id)&&!(c.parentId&&pasted.pastedIds.includes(c.parentId)));
    setSelected(root?.id);
    const copiedIds=new Set(clipboard.components.map(c=>c.id));
    const hadBindings=(scene.tagBindings??[]).some(b=>b.kind==='property'?copiedIds.has(b.instanceId):clipboard.connections.some(c=>c.id===b.connectionId));
    setClipNote(`Pasted ${plural(pasted.pastedIds.length)}.${hadBindings?' Tag bindings are not copied.':''}`);
  }
  // Explicit, user-triggered: ports at the same point facing each other become connections (ADR-0002).
  const touching=useMemo(()=>findTouchingPorts(scene,registry.resolvers),[scene]);
  const [touchingNote,setTouchingNote]=useState('');
  function connectTouching(){
    const result=connectTouchingPorts(scene,{...registry.resolvers,createId:newId});
    if(!result.ok){setTouchingNote(`Could not connect: ${result.error.message}`);return;}
    update(result.scene);
    announceConnections(scene,result.scene);
    const names=componentNames(scene, registry);
    const skipped=result.rejected.map(r=>`${names.get(r.from.instanceId)} "${r.from.portId}" / ${names.get(r.to.instanceId)} "${r.to.portId}" (${r.reason})`);
    // Show at most five problems so a big scene cannot flood the panel.
    const listed=skipped.length>5?[...skipped.slice(0,5),`…and ${skipped.length-5} more`]:skipped;
    setTouchingNote(`Connected ${result.added} touching port pair${result.added===1?'':'s'}.${listed.length?` Not joined: ${listed.join('; ')}.`:''}`);
  }
  const now=useNow(1000);
  const live=useTelemetry(scene,telemetry,now,registry);
  /** Sets or clears the tag for one target; each committed edit is its own undo step. */
  /** Wiring and association edits (ADR-0027): core validates; a refusal becomes a notice, never a change. */
  function edgeResult(result:{ok:true;scene:ScadaScene}|{ok:false;error:{message:string}},refusal:string){
    if(result.ok) update(result.scene);
    else setNotice([`${refusal}: ${result.error.message}`]);
  }
  /** A wire's relationship and properties, validated as on load before it is committed. */
  function editConnection(id:string,changes:{relationship?:Relationship;properties?:SceneConnection['properties']}){
    const connections=scene.connections.map(c=>{
      if(c.id!==id) return c;
      const {relationship:_r,properties:_p,...rest}=c;
      return {...rest,...(changes.relationship?{relationship:changes.relationship}:{}),...(changes.properties?{properties:changes.properties}:{})};
    });
    const result=validateScene({...scene,connections},registry.resolvers);
    if(result.ok) update({...scene,connections});
    else setNotice([`Cannot change the connection: ${result.errors[0].message}`]);
  }
  function setBinding(match:(b:TagBinding)=>boolean, make:(tagId:string)=>TagBinding, tagId:string){
    const others=(scene.tagBindings??[]).filter(b=>!match(b));
    const tag=tagId.trim();
    const existing=scene.tagBindings?.find(match);
    if((existing?.tagId??'')===tag) return;
    const tagBindings=tag?[...others,existing?{...existing,tagId:tag}:make(tag)]:others;
    const {tagBindings:_,...rest}=scene;
    update(tagBindings.length?{...rest,tagBindings}:rest);
  }
  const toolButton=(mode:TransformMode,label:string)=><button aria-pressed={transformMode===mode} onClick={()=>setTransformMode(mode)}>{label}</button>;
  /** Folded section titles, remembered while switching between components. */
  const [folded,setFolded]=useState<ReadonlySet<string>>(()=>new Set());
  const section=(title:string,children:React.ReactNode,disabled=false)=><details className="s3-section" open={!folded.has(title)}
    onToggle={e=>{const open=e.currentTarget.open;setFolded(f=>{if(open===!f.has(title))return f;const next=new Set(f);if(open)next.delete(title);else next.add(title);return next;});}}>
    <summary>{title}</summary>{disabled?<fieldset disabled>{children}</fieldset>:children}
  </details>;
  const connectedPorts=(c:ComponentInstance)=>new Set(connectionsOf(scene,c.id).flatMap(x=>[x.from,x.to]).filter(e=>e.instanceId===c.id).map(e=>e.portId));
  const hasSettings=(c:ComponentInstance)=>Object.keys(registry.definitionFor(c.type).parameters??{}).length>0||registry.definitionFor(c.type).bindable?.level!==undefined||c.type==='valve';
  const hasBindings=(c:ComponentInstance)=>Object.keys(registry.definitionFor(c.type).bindable??{}).length>0||connectionsOf(scene,c.id).length>0;
  return <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} className="scada3d-editor" style={{display:'grid',gridTemplateColumns:'220px minmax(0,1fr) 260px',gridTemplateRows:'minmax(0,1fr)',height:'100%',minHeight:500,color:'#ebf2fa',background:'#142437',fontFamily:'system-ui',outline:'none'}}>
    <style>{EDITOR_CSS}</style>
    <aside style={{padding:14,borderRight:'1px solid #3c5366',overflowY:'auto',minHeight:0}}>
      <button aria-pressed={isLocked} onClick={()=>setLocked(!isLocked)} className="s3-block" style={{marginTop:0}}>{isLocked?'Unlock editing':'Lock editing'}</button>
      {/* Outside the locked fieldset: while locked the dialog opens read only (ADR-0027). */}
      <button onClick={()=>setTagsOpen(true)} className="s3-block" title="Data sources, variables, suggestions and review">Tags…</button>
      {tagsOpen&&<TagEditor scene={scene} registry={registry} readOnly={isLocked} onCommit={next=>update(next)} onSelectComponent={setSelected} onClose={()=>setTagsOpen(false)}/>}
      <fieldset disabled={isLocked}>
      <div className="s3-row">
        <button onClick={()=>travel(undo)} disabled={!canUndo(history)} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={()=>travel(redo)} disabled={!canRedo(history)} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">Redo</button>
      </div>
      <div role="group" aria-label="Transform tool" className="s3-row">{toolButton('translate','Move')}{toolButton('rotate','Rotate')}</div>
      <button onClick={connectTouching} disabled={touching.matches.length===0} title="Join ports that sit at the same point and face each other" className="s3-block">Connect touching ports ({touching.matches.length})</button>
      <p aria-live="polite" style={{fontSize:12,margin:'4px 0 0'}}>{touchingNote}</p>
      <button onClick={paste} disabled={!clipboard} title="Paste (Ctrl+V)" className="s3-block">Paste ({clipboard?.components.length??0})</button>
      <p aria-live="polite" style={{fontSize:12,margin:'4px 0 8px'}}>{clipNote}</p>
      {section('Components',<div className="s3-palette">{registry.list().map(d=>d.type).map(k=><button key={k} draggable onDragStart={e=>{e.dataTransfer.setData('scada-kind',k);e.dataTransfer.effectAllowed='copy';dragKind.current=k;}} onDragEnd={endDrag} onClick={()=>add(k)}>{registry.definitionFor(k).label} +</button>)}
        {componentPresets.map(p=><button key={p.id} draggable onDragStart={e=>{e.dataTransfer.setData('scada-kind',p.type);e.dataTransfer.effectAllowed='copy';dragKind.current=p.type;dragPreset.current=p.properties;}} onDragEnd={endDrag} onClick={()=>add(p.type,p.properties)}>{p.label} +</button>)}</div>)}
      </fieldset>
      <SceneList scene={scene} selected={selected} onSelect={select} locked={isLocked}/>
      <label className="s3-stack">View <select aria-label="View mode" value={viewMode} onChange={e=>setViewMode(e.target.value as ViewMode)}>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>
      <div style={{marginTop:12}}>{section('Underlay',<UnderlayControls scene={scene} onChange={(underlay,mergeKey)=>{const {underlay:_,...rest}=scene;update(underlay?{...rest,underlay}:rest,mergeKey);}}/>,isLocked)}</div>
      <div style={{marginTop:12}}>{section('Scene file',<>
        <small>Scene JSON</small><textarea aria-label="Scene JSON" readOnly value={serialized} style={{height:150}}/>
        <div className="s3-row">
          <button onClick={exportScene}>Export JSON</button>
          <input type="file" accept=".json,application/json" aria-label="Import scene file" disabled={isLocked} onChange={importFile} style={{fontSize:12,maxWidth:'100%'}}/>
        </div>
        <textarea aria-label="Import JSON text" placeholder="Paste scene JSON to import" disabled={isLocked} value={importText} onChange={e=>setImportText(e.target.value)} style={{height:60,marginTop:6}}/>
        <button onClick={()=>loadScene(importText)} disabled={isLocked||!importText.trim()} style={{marginTop:6}}>Load text</button>
        <p aria-live="polite" style={{fontSize:12,margin:'6px 0'}}>{importNote}</p>
        {importErrors.length>0&&<ul role="alert" aria-label="Import errors" style={{fontSize:12,color:'#ff9aa2',paddingLeft:16,margin:0}}>{importErrors.map((line,i)=><li key={i}>{line}</li>)}</ul>}
      </>)}</div>
    </aside>
    <main onDragOver={e=>{if(!dragKind.current||isLocked)return;e.preventDefault();setPreview(planAt(e,'drop-preview'));}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setPreview(undefined);}}
      onDrop={drop} style={{minWidth:0,position:'relative'}}>
      <Scada3DViewer scene={scene} viewMode={viewMode} viewOverrides={viewOverrides} selectedId={selected} onSelect={select} preview={preview} onCamera={c=>{camera.current=c;}} transformMode={transformMode} onTransform={isLocked?undefined:transform} flow={flow} telemetry={telemetry} simulation={simulation} collisions={collisions} openJoints={openJoints} instancing={instancing} joints={joints} floor={floor} walkthrough={walkthrough} walkPlacing={walkPlacing} registry={registry}/>
      {isLocked&&<div style={{position:'absolute',bottom:10,right:110,padding:'4px 10px',borderRadius:4,background:'#0b1725e6',border:'1px solid #ffd166',color:'#ffd166',fontSize:12,pointerEvents:'none'}}>🔒 Editing locked</div>}
      {notice.length>0&&<ConnectionNotice lines={notice} onDismiss={()=>setNotice([])}/>}
      <div role="status" aria-live="polite" style={{position:'absolute',top:10,left:12,padding:preview?'6px 10px':0,borderRadius:4,background:'#0b1725cc',fontSize:13,pointerEvents:'none'}}>{preview?describeDrop(preview,scene,registry)+previewOverlap:''}</div>
    </main>
    <aside style={{padding:14,borderLeft:'1px solid #3c5366',overflowY:'auto',minHeight:0}}>
      <h3>Properties</h3>
      {component ? <>
        <h4>{registry.definitionFor(component.type).label}</h4>
        {section('Transform',<>
          <small>Position (metres)</small>
          {(['x','y','z'] as const).map(axis=><MetreField key={axis} label={axis.toUpperCase()} value={component.position[axis]} onValue={n=>moveMember(component.id,{...component.position,[axis]:n},component.rotation,`position:${component.id}:${axis}`)}/>)}
          <RotationFields rotation={component.rotation} onChange={(rotation,mergeKey)=>moveMember(component.id,component.position,rotation,mergeKey&&`rotation:${component.id}:${mergeKey}`)}/>
        </>,isLocked)}
        {hasSettings(component)&&section('Settings',<>
          {Object.entries(registry.definitionFor(component.type).parameters??{}).map(([name,spec])=>isChoiceParameter(spec)?<ChoiceField key={`${component.id}:${name}`} name={name} spec={spec} component={component} scene={scene} onChange={(changes)=>patch(changes)}/>:<ParameterField key={`${component.id}:${name}`} name={name} spec={spec} component={component} connectedPorts={connectedPorts(component)} onChange={(changes)=>patch(changes,`parameter:${component.id}:${name}`)}/>)}
          {registry.definitionFor(component.type).bindable?.level!==undefined&&<>
            <label className="s3-stack">Liquid level % <input type="range" min="0" max="100" value={Math.round((liquidFill(component.properties.level).fraction??0)*100)} onChange={e=>patch({properties:{...component.properties,level:Number(e.target.value)}},`level:${component.id}`)}/></label>
            <LevelNote level={component.properties.level}/>
            <label className="s3-stack">Temperature °C <input type="number" step="1" value={typeof component.properties.temperature==='number'?component.properties.temperature:''} onChange={e=>{const {temperature:_,...rest}=component.properties;patch({properties:e.target.value===''?rest:{...rest,temperature:Number(e.target.value)}},`temperature:${component.id}`);}}/></label>
          </>}
          {component.type==='valve'&&<label className="s3-row"><input type="checkbox" checked={component.properties.open!==false} onChange={e=>patch({properties:{...component.properties,open:e.target.checked}})}/> Valve open</label>}
        </>,isLocked)}
        {section('Connections',<>
          <AssemblyControls component={component} scene={scene} onChange={next=>update(next)} onNotice={setNotice}/>
          <SeatControls component={component} scene={scene} onSeat={connectionId=>{const r=seatOnConnection(scene,connectionId,component.id,registry.resolvers);if(r.ok){update(r.scene);setNotice([describeSeat(scene,connectionId,component.id,r.moved,registry)]);}}}/>
        </>,isLocked)}
        {/* Read only, so open while locked too (ADR-0027). */}
        {section('Ports',<PortsInspector key={component.id} rows={describePorts(scene,component.id,registry)} onGo={setSelected} editing={isLocked?undefined:{
          candidates:portId=>wiringCandidates(scene,component.id,portId,registry),
          onWire:(portId,to)=>edgeResult(connectPorts(scene,{id:newId(),from:{instanceId:component.id,portId},to:{instanceId:to.componentId,portId:to.portId}},registry.resolvers),'Cannot wire'),
          onDisconnect:id=>edgeResult(disconnectEdge(scene,id),'Cannot disconnect'),
          onEditConnection:editConnection,
        }}/>)}
        {section('Related',<RelationsExplorer key={component.id} relations={describeRelations(scene,component.id,registry)} onGo={setSelected} editing={isLocked?undefined:{
          others:scene.components.filter(c=>c.id!==component.id).map(c=>({id:c.id,label:c.name??c.id})),
          onAdd:(relationship,to)=>edgeResult(addAssociation(scene,{id:newId(),relationship,from:component.id,to},registry.resolvers),'Cannot add the relationship'),
          onRemove:id=>edgeResult(removeAssociation(scene,id),'Cannot remove the relationship'),
        }}/>)}
        {hasBindings(component)&&section('Tag bindings',<BindingsEditor component={component} scene={scene} live={live?.properties} onSet={setBinding}/>,isLocked)}
        {section('View',<label className="s3-stack">Component view <select aria-label="Component view" value={viewOverrides[component.id]??''} onChange={e=>{const value=e.target.value as ViewMode|'';setViewOverrides(({[component.id]:_,...rest})=>value?{...rest,[component.id]:value}:rest);}}><option value="">Use global</option>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>)}
        {section('Actions',<>
          <div className="s3-row">
            <button onClick={()=>copyIds([component.id])} title="Copy (Ctrl+C)">Copy component</button>
            {assemblyOf(scene,component.id).length>1&&<button onClick={()=>copyIds(assemblyOf(scene,component.id))} title="Copy the parent and all its children (Ctrl+Shift+C)">Copy assembly</button>}
          </div>
          <button className="s3-danger s3-block" onClick={()=>removeSelected(component.id)} disabled={isLocked} style={{marginTop:10}}>Remove</button>
        </>)}
      </>:<p>Select equipment in the canvas.</p>}
    </aside>
  </div>;
}

/** The full editor: palette, canvas, properties, undo/redo, import/export. `registry` as for the viewer. */
export function Scada3DEditor(props: Parameters<typeof EditorBody>[0]) {
  return <RegistryContext.Provider value={props.registry ?? builtInRegistry}><EditorBody {...props}/></RegistryContext.Provider>;
}

// One document, several views (ADR-0026).
export { ScadaWorkspace } from './workspace.js';
export type { ScadaWorkspaceProps, WorkspaceLayout } from './workspace.js';
