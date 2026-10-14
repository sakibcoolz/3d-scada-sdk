import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DoubleSide, Object3D as Object3DImpl, Plane, Vector3, type Camera, type InstancedMesh, type Object3D } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, TransformControls } from '@react-three/drei';
import { createEmptyScene, displayScene, portToWorld, removeComponent, resolveFlow, resolveTelemetry, type Observation, type PropertyState, type TagBinding, routeScene, sampleRouteCenterline, serializeScene, type FlowReading, type FlowState, type ValueSource, type ComponentInstance, type ComponentKind, type PipeRoute, type QuaternionTuple, type ScadaScene, type Vector3Tuple } from '@scada3d/core';
import { componentCatalog, pipeOuterRadius } from '@scada3d/components';
import { createEquipmentGeometries, createRouteGeometries, disposeGeometries } from './geometry';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop';

import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history';
import { importSceneText, MAX_SCENE_FILE_BYTES } from './sceneFile';
import { describeProperty, summarizeTelemetry } from './telemetryView';
import { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, viewModes, type ViewMode } from './appearance';
import { FLOW_MARKER_SPACING, FLOW_MARKER_SPEED, flowAppearance, markerDistances, pathLengths, pointAt, summarizeFlow } from './flowVisual';

export { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop';
export { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history';
export { formatSceneErrors, importSceneText, MAX_SCENE_FILE_BYTES, type SceneImport } from './sceneFile';
export { flowAppearance, summarizeFlow, type FlowAppearance } from './flowVisual';
export { describeProperty, summarizeTelemetry } from './telemetryView';
export { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, viewModes, type LiquidFill, type ShellLook, type ViewMode } from './appearance';

const LIQUID_COLOR = '#2a9dce';
/** Valve ball colour when its bound open/closed tag cannot be trusted. */
const VALVE_UNKNOWN = '#8a96a3';

function Equipment({ component, viewMode, selected, onSelect, objectRef, unknown }: { component:ComponentInstance; viewMode:ViewMode; selected:boolean; onSelect:()=>void; objectRef?:(object:Object3D|null)=>void; /** Bound properties whose live value cannot be trusted. */ unknown?:ReadonlySet<string> }) {
  const definition = componentCatalog[component.type];
  const geometries = useMemo(() => createEquipmentGeometries(definition), [definition]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  const fill = liquidFill(component.properties.level);
  const liquidColor = heatColor(component.properties.temperature) ?? LIQUID_COLOR;
  const open = component.properties.open !== false;
  const look = shellLook(viewMode);
  // Cutaway removes the front (+Z) half of the shell in world space, through the component origin.
  const clippingPlanes = useMemo(() => (look.clip ? [new Plane(new Vector3(0, 0, -1), component.position[2])] : null), [look.clip, component.position[2]]);
  const tag = (role: string) => ({ componentId: component.id, role });
  // Materials are keyed on view mode so switching recreates them: Three.js only recompiles the
  // opaque/transparent/clipped shader variant when a material is new or flagged needsUpdate.
  const shellProps = {color:selected?'#63b3ed':'#7b9eb6',metalness:look.metalness,roughness:0.35,transparent:look.transparent,opacity:look.opacity,depthWrite:look.depthWrite,side:DoubleSide,clippingPlanes};
  return <group ref={objectRef} position={component.position} quaternion={component.rotation} scale={component.scale} onClick={e=>{e.stopPropagation();onSelect();}}>
    {definition.parts.map((part, i) => {
      const geometry = geometries[i];
      if (part.role === 'liquid' && part.shape === 'cylinder') {
        // Scale the liquid column from its bottom face so the surface tracks level; no level, no liquid.
        const height = Math.max(0.001, fill.fraction ?? 0);
        const bottom = part.center[1] - part.length / 2;
        return <mesh key={i} geometry={geometry} userData={tag('liquid')} visible={(fill.fraction ?? 0) > 0} scale={[1, height, 1]} position={[0, bottom * (1 - height), 0]}><meshStandardMaterial color={liquidColor} transparent opacity={0.65} depthWrite={false}/></mesh>;
      }
      if (part.role === 'valve-ball') return <mesh key={i} geometry={geometry} userData={tag('valve-ball')}><meshStandardMaterial color={unknown?.has('open')?VALVE_UNKNOWN:open?'#48b983':'#e76e75'}/></mesh>;
      if (part.role === 'valve-handle') return <mesh key={i} geometry={geometry} userData={tag('valve-handle')} rotation={[0, open ? 0 : Math.PI / 2, 0]}><meshStandardMaterial color="#e3d5a5"/></mesh>;
      return <mesh key={i} geometry={geometry} userData={tag('shell')}>
        <meshStandardMaterial key={viewMode} {...shellProps}/>
        {look.edges && <Edges userData={tag('edges')} threshold={20} color="#9fd3ff"/>}
      </mesh>;
    })}
    {definition.ports.map(port=><mesh key={port.id} position={port.position}><sphereGeometry args={[.05,10,10]}/><meshBasicMaterial color="#ffd166"/></mesh>)}
  </group>;
}

function RoutePipe({ route, viewMode }: { route: PipeRoute; viewMode: ViewMode }) {
  // Rebuild geometry only when the routed centreline changes, not on every scene update.
  const shape = route.status === 'ok' ? route.points.flat().join(',') : '';
  const geometries = useMemo(() => (route.status === 'ok' ? createRouteGeometries(route, pipeOuterRadius) : []), [shape]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  if (route.status !== 'ok') {
    // Invalid route: dashed red line between the ports so the problem is visible, no pipe drawn.
    return 'from' in route ? <Line points={[route.from, route.to]} color="#e76e75" dashed dashSize={0.15} gapSize={0.1} lineWidth={2}/> : null;
  }
  // Routed pipes follow glass/x-ray transparency; cutaway leaves them whole.
  const look = shellLook(viewMode === 'cutaway' ? 'normal' : viewMode);
  return <>{geometries.map((geometry, i) => <mesh key={i} geometry={geometry}><meshStandardMaterial key={viewMode} color="#8fa9bc" metalness={look.metalness} roughness={0.35} transparent={look.transparent} opacity={look.opacity} depthWrite={look.depthWrite}/></mesh>)}</>;
}

const resolvePorts = (type: ComponentKind) => componentCatalog[type].ports;

const markerDummy = new Object3DImpl();

/**
 * Flow along one routed pipe: beads slightly wider than the pipe that travel from→to or to→from,
 * sit still when stopped, or a dashed overlay when the flow is unknown. Motion uses frame delta.
 */
function FlowMarkers({ route, state }: { route: Extract<PipeRoute, { status: 'ok' }>; state: FlowState }) {
  const shape = route.points.flat().join(',');
  const centerline = useMemo(() => sampleRouteCenterline(route), [shape]);
  const lengths = useMemo(() => pathLengths(centerline), [centerline]);
  const total = lengths[lengths.length - 1];
  const count = markerDistances(total, FLOW_MARKER_SPACING, 0).length;
  const appearance = flowAppearance(state);
  const mesh = useRef<InstancedMesh>(null);
  const travelled = useRef(0);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const sign = appearance.motion === 'forward' ? 1 : appearance.motion === 'reverse' ? -1 : 0;
    travelled.current = (travelled.current + sign * FLOW_MARKER_SPEED * delta) % total;
    markerDistances(total, FLOW_MARKER_SPACING, travelled.current).forEach((d, i) => {
      markerDummy.position.set(...pointAt(centerline, lengths, d));
      markerDummy.updateMatrix();
      mesh.current!.setMatrixAt(i, markerDummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (total <= 0) return null;
  if (appearance.dashed) {
    // Drawn over the pipe (no depth test) so missing or untrusted data is never hidden by geometry.
    return <Line points={centerline} color={appearance.color} dashed dashSize={0.15} gapSize={0.1} lineWidth={3} transparent opacity={appearance.opacity} depthTest={false} renderOrder={10}/>;
  }
  return <instancedMesh key={`${count}:${appearance.color}:${appearance.opacity}`} ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <sphereGeometry args={[pipeOuterRadius * 1.25, 12, 8]}/>
    <meshBasicMaterial color={appearance.color} transparent={appearance.opacity < 1} opacity={appearance.opacity}/>
  </instancedMesh>;
}

/** Current time, refreshed every `intervalMs`, so staleness advances without new readings. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Host-supplied flow input. Omit it to show no flow at all. */
export interface FlowInput {
  readings: readonly FlowReading[];
  /** Which readings to show; measured and simulated are never mixed. Default MEASURED. */
  source?: ValueSource;
  staleAfterMs?: number;
}

/** Host-supplied tag observations for the scene's tag bindings. Omit it to show authored values. */
export interface TelemetryInput {
  observations: readonly Observation[];
  /** Which observations to use; measured and simulated are never mixed. Default MEASURED. */
  source?: ValueSource;
  staleAfterMs?: number;
}

const resolveBindable = (type: ComponentKind) => componentCatalog[type].bindable;

/** Resolves telemetry against a clock refreshed every second, so values age into STALE. */
function useTelemetry(scene: ScadaScene, telemetry: TelemetryInput | undefined, now: number) {
  return useMemo(
    () => (telemetry ? resolveTelemetry(scene, telemetry.observations, { now, source: telemetry.source, staleAfterMs: telemetry.staleAfterMs, resolveBindable }) : undefined),
    [scene, telemetry, now],
  );
}

/** Hands the active R3F camera to code outside the canvas (used for pointer-to-plane raycasts). */
function CameraBridge({ onCamera }: { onCamera: (camera: Camera) => void }) {
  const camera = useThree((state) => state.camera);
  useEffect(() => onCamera(camera), [camera, onCamera]);
  return null;
}

/** Ghost of the component being dropped, and a marker on the port it would (or cannot) connect to. */
function DropPreview({ scene, plan }: { scene: ScadaScene; plan: DropPlan }) {
  const candidate = plan.snap.ok ? plan.snap.candidate : plan.snap.nearest;
  const owner = candidate && scene.components.find((c) => c.id === candidate.target.instanceId);
  const port = owner && componentCatalog[owner.type].ports.find((p) => p.id === candidate.target.portId);
  const marker = owner && port ? portToWorld(owner, port).position : undefined;
  return <>
    <Equipment component={plan.component} viewMode="glass" selected onSelect={() => {}}/>
    {marker && <mesh position={marker}><sphereGeometry args={[0.14, 16, 16]}/><meshBasicMaterial color={plan.snap.ok ? '#48b983' : '#e76e75'} transparent opacity={0.85}/></mesh>}
  </>;
}

export type TransformMode = 'translate' | 'rotate';

/**
 * Called on every gizmo change. `gesture` is the same for all changes of one drag, so the editor
 * can merge a whole drag into one undo step.
 */
export type TransformHandler = (id: string, position: Vector3Tuple, rotation: QuaternionTuple, gesture: string) => void;

/** Rotation snaps to quarter turns so ports stay on world axes for orthogonal routing. */
const ROTATION_SNAP = Math.PI / 2;
const TRANSLATION_SNAP = 0.05;

export function Scada3DViewer({scene,viewMode='normal',viewOverrides,onSelect,selectedId,preview,onCamera,transformMode,onTransform,flow,telemetry}: {scene:ScadaScene;viewMode?:ViewMode;viewOverrides?:Readonly<Record<string,ViewMode>>;onSelect?:(id:string)=>void;selectedId?:string;preview?:DropPlan;onCamera?:(camera:Camera)=>void;transformMode?:TransformMode;onTransform?:TransformHandler;flow?:FlowInput;telemetry?:TelemetryInput}) {
  const routes = useMemo(() => routeScene(scene, { resolvePorts }), [scene]);
  const now = useNow(1000);
  const live = useTelemetry(scene, telemetry, now);
  // What is drawn: live values over authored ones; never saved.
  const shown = useMemo(() => (live ? displayScene(scene, live.properties) : scene), [scene, live]);
  const unknownByComponent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of live?.properties ?? []) if (p.status === 'unknown') map.set(p.instanceId, new Set([...(map.get(p.instanceId) ?? []), p.property]));
    return map;
  }, [live]);
  const hasFlowBindings = scene.tagBindings?.some((b) => b.kind === 'flow') ?? false;
  const flowStates = useMemo(() => {
    if (!flow && !(live && hasFlowBindings)) return undefined;
    // One source per view: explicit readings and tag-derived readings use the same source filter.
    const readings = [...(flow?.readings ?? []), ...(live?.flowReadings ?? [])];
    return resolveFlow(scene, readings, { now, source: flow?.source ?? telemetry?.source, staleAfterMs: flow?.staleAfterMs ?? telemetry?.staleAfterMs }).states;
  }, [scene, flow, live, hasFlowBindings, now, telemetry]);
  const stateById = useMemo(() => new Map(flowStates?.map((s) => [s.connectionId, s])), [flowStates]);
  const showHeatLegend = shown.components.some((c) => heatColor(c.properties.temperature) !== undefined);
  const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
  const gesture = useRef(0);
  return <div style={{position:'relative',width:'100%',height:'100%'}}>
  <Canvas camera={{position:[7,6,9],fov:50}} onCreated={({gl})=>{gl.localClippingEnabled=true;}} style={{background:'#101d2d',width:'100%',height:'100%'}}>
    <ambientLight intensity={1.4}/><directionalLight position={[5,10,8]} intensity={2}/>
    <Grid infiniteGrid fadeDistance={35} sectionColor="#50718b" cellColor="#263e52"/>
    {shown.components.map(c=><Equipment key={c.id} component={c} unknown={unknownByComponent.get(c.id)} viewMode={effectiveViewMode(viewMode,viewOverrides?.[c.id])} selected={selectedId===c.id} onSelect={()=>onSelect?.(c.id)} objectRef={selectedId===c.id?setSelectedObject:undefined}/>)}
    {onTransform && transformMode && selectedId && selectedObject && <TransformControls object={selectedObject} mode={transformMode} rotationSnap={ROTATION_SNAP} translationSnap={TRANSLATION_SNAP}
      onMouseDown={()=>{gesture.current++;}}
      onObjectChange={()=>onTransform(selectedId, selectedObject.position.toArray() as Vector3Tuple, selectedObject.quaternion.toArray() as QuaternionTuple, `transform:${selectedId}:${gesture.current}`)}/>}
    {routes.map(route=><RoutePipe key={route.connectionId} route={route} viewMode={viewMode}/>)}
    {flowStates && routes.map(route=>{const state=stateById.get(route.connectionId);return route.status==='ok'&&state?<FlowMarkers key={`flow:${route.connectionId}`} route={route} state={state}/>:null;})}
    {preview && <DropPreview scene={scene} plan={preview}/>}
    {onCamera && <CameraBridge onCamera={onCamera}/>}
    <OrbitControls makeDefault/><GizmoHelper alignment="bottom-right" margin={[70,70]}><GizmoViewport/></GizmoHelper>
  </Canvas>
  {(flow?.source??telemetry?.source)==='SIMULATED'&&<div style={{position:'absolute',top:10,right:12,padding:'4px 10px',borderRadius:4,background:'#b58cff',color:'#10051f',fontWeight:700,fontSize:12,letterSpacing:1,pointerEvents:'none'}}>SIMULATED FLOW</div>}
  {showHeatLegend&&<div style={{position:'absolute',top:flow?.source==='SIMULATED'?44:10,right:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>
    <div style={{height:8,borderRadius:2,marginBottom:4,background:`linear-gradient(90deg, ${heatColor(HEAT_RANGE_C.min)}, ${heatColor(HEAT_RANGE_C.max)})`}}/>
    Temperature tint {HEAT_RANGE_C.min}–{HEAT_RANGE_C.max} °C (display only, not simulated)
  </div>}
  {live&&live.properties.length>0&&<div aria-label="Telemetry summary" aria-live="polite" style={{position:'absolute',bottom:flowStates?36:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeTelemetry(live.properties)}</div>}
  {flowStates&&<div aria-label="Flow summary" aria-live="polite" style={{position:'absolute',bottom:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeFlow(flowStates)}</div>}
  </div>;
}

const defaultProperties = { level: 45, open: true };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** A text field that commits on Enter or blur, so typing a tag is one undo step. */
function CommitField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label style={{display:'block',marginTop:4,fontSize:12}}>{label} <input aria-label={label} value={draft} placeholder="tag id" style={{width:96}}
    onChange={e=>setDraft(e.target.value)} onBlur={()=>onCommit(draft)} onKeyDown={e=>{if(e.key==='Enter')onCommit(draft);}}/></label>;
}

/** Tag bindings for the selected component's bindable properties and its connections, plus live values. */
function BindingsEditor({ component, scene, live, onSet }: {
  component: ComponentInstance; scene: ScadaScene; live?: readonly PropertyState[];
  onSet: (match: (b: TagBinding) => boolean, make: (tagId: string) => TagBinding, tagId: string) => void;
}) {
  const bindable = componentCatalog[component.type].bindable ?? {};
  const connections = scene.connections.filter(c => c.from.instanceId === component.id || c.to.instanceId === component.id);
  const neighbourLabel = (c: typeof connections[number]) => {
    const otherId = c.from.instanceId === component.id ? c.to.instanceId : c.from.instanceId;
    const other = scene.components.find(x => x.id === otherId);
    return other ? componentCatalog[other.type].label : otherId;
  };
  const states = live?.filter(p => p.instanceId === component.id) ?? [];
  if (Object.keys(bindable).length === 0 && connections.length === 0) return null;
  return <div style={{marginTop:10}}>
    <small>Tag bindings</small>
    {Object.keys(bindable).map(property => {
      const match = (b: TagBinding) => b.kind === 'property' && b.instanceId === component.id && b.property === property;
      return <CommitField key={property} label={`Tag for ${property}`} value={scene.tagBindings?.find(match)?.tagId ?? ''}
        onCommit={tag => onSet(match, tagId => ({ id: newId(), tagId, kind: 'property', instanceId: component.id, property }), tag)}/>;
    })}
    {connections.map(c => {
      const match = (b: TagBinding) => b.kind === 'flow' && b.connectionId === c.id;
      return <CommitField key={c.id} label={`Flow tag for connection to ${neighbourLabel(c)}`} value={scene.tagBindings?.find(match)?.tagId ?? ''}
        onCommit={tag => onSet(match, tagId => ({ id: newId(), tagId, kind: 'flow', connectionId: c.id }), tag)}/>;
    })}
    {states.length > 0 && <ul aria-label="Live values" style={{fontSize:12,paddingLeft:16,margin:'6px 0'}}>
      {states.map(p => <li key={p.bindingId}>{describeProperty(p, bindable[p.property])}</li>)}
    </ul>}
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

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function Scada3DEditor({initialScene,onChange,flow,telemetry}:{initialScene?:ScadaScene;onChange?:(scene:ScadaScene)=>void;flow?:FlowInput;telemetry?:TelemetryInput}) {
  const [history,setHistory]=useState<History>(()=>createHistory(initialScene??createEmptyScene()));
  const scene=history.present;
  const [selected,setSelected]=useState<string>();
  const [viewMode,setViewMode]=useState<ViewMode>('normal');
  /** Per-component view modes: editor display state only, never saved into the scene. */
  const [viewOverrides,setViewOverrides]=useState<Record<string,ViewMode>>({});
  const [transformMode,setTransformMode]=useState<TransformMode>('translate');
  /** Every scene change goes through history; pass a mergeKey to fold a gesture into one undo step. */
  function update(next:ScadaScene, mergeKey?:string){setHistory(h=>commit(h,next,mergeKey));onChange?.(next);}
  function travel(step:(h:History)=>History){
    const next=step(history);
    if(next===history) return;
    setHistory(next);onChange?.(next.present);
    if(selected&&!next.present.components.some(c=>c.id===selected)) setSelected(undefined);
  }
  function onKeyDown(e:React.KeyboardEvent){
    if(isTextEntry(e.target)||!(e.ctrlKey||e.metaKey)) return;
    const key=e.key.toLowerCase();
    if(key==='z'&&!e.shiftKey){e.preventDefault();travel(undo);}
    else if((key==='z'&&e.shiftKey)||key==='y'){e.preventDefault();travel(redo);}
  }
  const camera=useRef<Camera|undefined>(undefined);
  const dragKind=useRef<ComponentKind|undefined>(undefined);
  const [preview,setPreview]=useState<DropPlan>();
  // Keyboard/click add: rest on the ground in a row, never auto-connect.
  function add(type:ComponentKind) {
    const id=newId();
    const position=dropPosition(componentCatalog[type],[scene.components.length*2.4,0,0]);
    update({...scene,components:[...scene.components,{id,type,position,rotation:[0,0,0,1],scale:[1,1,1],properties:{...defaultProperties}}]});setSelected(id);
  }
  function planAt(e:React.DragEvent<HTMLElement>, id:string):DropPlan|undefined {
    const kind=dragKind.current, canvas=e.currentTarget.querySelector('canvas');
    if(!kind||!camera.current||!canvas) return undefined;
    const hit=screenToPlane({x:e.clientX,y:e.clientY},canvas.getBoundingClientRect(),camera.current);
    return hit ? planDrop(scene,kind,hit,{createId:()=>id,properties:defaultProperties}) : undefined;
  }
  function endDrag(){dragKind.current=undefined;setPreview(undefined);}
  function drop(e:React.DragEvent<HTMLElement>) {
    e.preventDefault();
    const plan=planAt(e,newId());
    endDrag();
    if(!plan) return;
    // Component and its snapped connection land as one undo step.
    const result=applyDrop(scene,plan,newId);
    if(result.ok){update(result.scene);setSelected(plan.component.id);}
  }
  const component=scene.components.find(c=>c.id===selected);
  function patch(changes:Partial<ComponentInstance>, mergeKey?:string) {
    update({...scene,components:scene.components.map(c=>c.id===selected?{...c,...changes}:c)},mergeKey);
  }
  // A whole gizmo drag shares one gesture key, so it merges into a single undo step.
  const transform:TransformHandler=(id,position,rotation,gesture)=>
    update({...scene,components:scene.components.map(c=>c.id===id?{...c,position,rotation}:c)},gesture);
  const [importText,setImportText]=useState('');
  const [importNote,setImportNote]=useState('');
  const [importErrors,setImportErrors]=useState<string[]>([]);
  /** Replaces the scene only when the text validates; a successful import is one undo step. */
  function loadScene(text:string){
    const result=importSceneText(text);
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
  const now=useNow(1000);
  const live=useTelemetry(scene,telemetry,now);
  /** Sets or clears the tag for one target; each committed edit is its own undo step. */
  function setBinding(match:(b:TagBinding)=>boolean, make:(tagId:string)=>TagBinding, tagId:string){
    const others=(scene.tagBindings??[]).filter(b=>!match(b));
    const tag=tagId.trim();
    const existing=scene.tagBindings?.find(match);
    if((existing?.tagId??'')===tag) return;
    const tagBindings=tag?[...others,existing?{...existing,tagId:tag}:make(tag)]:others;
    const {tagBindings:_,...rest}=scene;
    update(tagBindings.length?{...rest,tagBindings}:rest);
  }
  const toolButton=(mode:TransformMode,label:string)=><button aria-pressed={transformMode===mode} onClick={()=>setTransformMode(mode)} style={{fontWeight:transformMode===mode?700:400}}>{label}</button>;
  return <div tabIndex={-1} onKeyDown={onKeyDown} style={{display:'grid',gridTemplateColumns:'190px minmax(0,1fr) 245px',height:'100%',minHeight:500,color:'#ebf2fa',background:'#142437',fontFamily:'system-ui',outline:'none'}}>
    <aside style={{padding:14,borderRight:'1px solid #3c5366'}}>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <button onClick={()=>travel(undo)} disabled={!canUndo(history)} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={()=>travel(redo)} disabled={!canRedo(history)} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">Redo</button>
      </div>
      <div role="group" aria-label="Transform tool" style={{display:'flex',gap:6}}>{toolButton('translate','Move')}{toolButton('rotate','Rotate')}</div>
      <h3>Components</h3>{(Object.keys(componentCatalog) as ComponentKind[]).map(k=><button key={k} draggable onDragStart={e=>{e.dataTransfer.setData('scada-kind',k);e.dataTransfer.effectAllowed='copy';dragKind.current=k;}} onDragEnd={endDrag} onClick={()=>add(k)} style={{display:'block',width:'100%',marginBottom:8,padding:9,cursor:'grab'}}>{componentCatalog[k].label} +</button>)}
      <label style={{display:'block'}}>View <select aria-label="View mode" value={viewMode} onChange={e=>setViewMode(e.target.value as ViewMode)}>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>
    </aside>
    <main onDragOver={e=>{if(!dragKind.current)return;e.preventDefault();setPreview(planAt(e,'drop-preview'));}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setPreview(undefined);}}
      onDrop={drop} style={{minWidth:0,position:'relative'}}>
      <Scada3DViewer scene={scene} viewMode={viewMode} viewOverrides={viewOverrides} selectedId={selected} onSelect={setSelected} preview={preview} onCamera={c=>{camera.current=c;}} transformMode={transformMode} onTransform={transform} flow={flow} telemetry={telemetry}/>
      <div role="status" aria-live="polite" style={{position:'absolute',top:10,left:12,padding:preview?'6px 10px':0,borderRadius:4,background:'#0b1725cc',fontSize:13,pointerEvents:'none'}}>{preview?describeDrop(preview,scene):''}</div>
    </main>
    <aside style={{padding:14,borderLeft:'1px solid #3c5366'}}>
      <h3>Properties</h3>
      {component ? <>
        <p>{componentCatalog[component.type].label}</p>
        <small>Position (metres)</small>
        {(['X','Y','Z'] as const).map((axis,i)=><label key={axis} style={{display:'block',marginTop:8}}>{axis} <input type="number" step=".1" style={{width:100}} value={component.position[i]} onChange={e=>{const pos=[...component.position] as Vector3Tuple;pos[i]=Number(e.target.value);patch({position:pos},`position:${component.id}:${axis}`);}}/></label>)}
        {component.type==='tank'&&<>
          <label style={{display:'block',marginTop:14}}>Liquid level % <input type="range" min="0" max="100" value={Math.round((liquidFill(component.properties.level).fraction??0)*100)} onChange={e=>patch({properties:{...component.properties,level:Number(e.target.value)}},`level:${component.id}`)}/></label>
          <LevelNote level={component.properties.level}/>
          <label style={{display:'block',marginTop:8}}>Temperature °C <input type="number" step="1" style={{width:70}} value={typeof component.properties.temperature==='number'?component.properties.temperature:''} onChange={e=>{const {temperature:_,...rest}=component.properties;patch({properties:e.target.value===''?rest:{...rest,temperature:Number(e.target.value)}},`temperature:${component.id}`);}}/></label>
        </>}
        {component.type==='valve'&&<label><input type="checkbox" checked={component.properties.open!==false} onChange={e=>patch({properties:{...component.properties,open:e.target.checked}})}/> Valve open</label>}
        <BindingsEditor component={component} scene={scene} live={live?.properties} onSet={setBinding}/>
        <label style={{display:'block',marginTop:8}}>Component view <select aria-label="Component view" value={viewOverrides[component.id]??''} onChange={e=>{const value=e.target.value as ViewMode|'';setViewOverrides(({[component.id]:_,...rest})=>value?{...rest,[component.id]:value}:rest);}}><option value="">Use global</option>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>
        <p><button onClick={()=>{const result=removeComponent(scene,component.id);if(result.ok)update(result.scene);setSelected(undefined);}}>Remove</button></p>
      </>:<p>Select equipment in the canvas.</p>}
      <hr/><small>Scene JSON</small><textarea aria-label="Scene JSON" readOnly value={serialized} style={{width:'100%',height:170,boxSizing:'border-box'}}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
        <button onClick={exportScene}>Export JSON</button>
        <input type="file" accept=".json,application/json" aria-label="Import scene file" onChange={importFile} style={{fontSize:12,maxWidth:'100%'}}/>
      </div>
      <textarea aria-label="Import JSON text" placeholder="Paste scene JSON to import" value={importText} onChange={e=>setImportText(e.target.value)} style={{width:'100%',height:60,marginTop:6,boxSizing:'border-box'}}/>
      <button onClick={()=>loadScene(importText)} disabled={!importText.trim()}>Load text</button>
      <p aria-live="polite" style={{fontSize:12,margin:'6px 0'}}>{importNote}</p>
      {importErrors.length>0&&<ul role="alert" aria-label="Import errors" style={{fontSize:12,color:'#ff9aa2',paddingLeft:16,margin:0}}>{importErrors.map((line,i)=><li key={i}>{line}</li>)}</ul>}
    </aside>
  </div>;
}
