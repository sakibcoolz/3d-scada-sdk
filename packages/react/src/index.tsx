import React, { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DoubleSide, Object3D as Object3DImpl, Plane, Vector3, type Camera, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, TransformControls } from '@react-three/drei';
import { assemblyOf, clipboardWidth, connectProvider, copyComponents, pasteComponents, validateScene, type ComponentClipboard, connectionsOf, lockConnectedAsChildren, moveAssembly, unlockFromParent, connectTouchingPorts, createEmptyScene, findCollisions, findTouchingPorts, createObservationStore, displayScene, type DataProvider, portToWorld, removeComponent, resolveFlow, resolveTelemetry, type Observation, type PropertyState, type TagBinding, routeScene, sampleRouteCenterline, serializeScene, type FlowReading, type FlowState, type ValueSource, type ComponentInstance, type ComponentKind, type PipeRoute, type QuaternionLike, type QuaternionTuple, type Vector3Like, type ScadaScene, type Vector3Tuple } from '@scada3d/core';
import { catalogResolvers, componentCatalog, definitionFor, pipeOuterRadius, type ParameterSpec } from '@scada3d/components';
import { createEquipmentGeometries, createRouteGeometries, disposeGeometries } from './geometry';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop';
import { componentNames, describeLock, describeNewConnections } from './connectionNotice';

import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history';
import { importSceneText, MAX_SCENE_FILE_BYTES } from './sceneFile';
import { describeProperty, summarizeTelemetry } from './telemetryView';
import { nudge } from './keyboard';
import { degreesFromRotation, rotationFromDegrees, turnAboutWorldAxis } from './rotationForm';
import { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, viewModes, type ViewMode } from './appearance';
import { FLOW_MARKER_SPACING, FLOW_MARKER_SPEED, flowAppearance, markerDistances, pathLengths, pointAt, summarizeFlow } from './flowVisual';

// Public API of @scada3d/react: the two components, their prop/handle types and scene import helpers.
// Editor internals (drop planning, history, visual helpers) stay private. See docs/API.md.
export { formatSceneErrors, importSceneText, MAX_SCENE_FILE_BYTES, type SceneImport } from './sceneFile';
export { viewModes, type ViewMode } from './appearance';

/**
 * drei's TransformControls builds a new three-stdlib gizmo (about 17 geometries plus materials) on
 * every mount, and its dispose() only removes listeners. Free the gizmo's GPU resources on unmount.
 * `attach()` does not reparent the target, so this traversal never reaches the component's meshes.
 */
function GizmoControls(props: React.ComponentProps<typeof TransformControls>) {
  const ref = useRef<React.ComponentRef<typeof TransformControls>>(null);
  useEffect(() => {
    const controls = ref.current;
    return () => {
      controls?.traverse((node) => {
        const mesh = node as Partial<Mesh>;
        mesh.geometry?.dispose();
        for (const material of ([] as Material[]).concat(mesh.material ?? [])) material.dispose();
      });
    };
  }, []);
  return <TransformControls ref={ref} {...props}/>;
}

/** Readable by assistive technology, not shown on screen. */
const visuallyHidden: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', margin: -1, padding: 0, border: 0 };

const LIQUID_COLOR = '#2a9dce';
/** Shell colour of components whose solid bodies overlap (display only). */
const COLLISION_COLOR = '#e5484d';
const { resolveBounds, resolvePorts, resolveBindable } = catalogResolvers;
/** Valve ball colour when its bound open/closed tag cannot be trusted. */
const VALVE_UNKNOWN = '#8a96a3';

function Equipment({ component, viewMode, selected, onSelect, objectRef, unknown, colliding }: { component:ComponentInstance; viewMode:ViewMode; selected:boolean; onSelect:()=>void; objectRef?:(object:Object3D|null)=>void; /** Bound properties whose live value cannot be trusted. */ unknown?:ReadonlySet<string>; /** Overlaps another solid component. */ colliding?:boolean }) {
  // Per-instance definition: parametric types (pipe length) change ports, bounds and parts.
  const definition = definitionFor(component.type, component.properties);
  const geometries = useMemo(() => createEquipmentGeometries(definition), [definition]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  const fill = liquidFill(component.properties.level);
  const liquidColor = heatColor(component.properties.temperature) ?? LIQUID_COLOR;
  const open = component.properties.open !== false;
  const look = shellLook(viewMode);
  // Cutaway removes the front (+Z) half of the shell in world space, through the component origin.
  const clippingPlanes = useMemo(() => (look.clip ? [new Plane(new Vector3(0, 0, -1), component.position.z)] : null), [look.clip, component.position.z]);
  const tag = (role: string) => ({ componentId: component.id, role });
  // Materials are keyed on view mode so switching recreates them: Three.js only recompiles the
  // opaque/transparent/clipped shader variant when a material is new or flagged needsUpdate.
  const shellProps = {color:colliding?COLLISION_COLOR:selected?'#63b3ed':'#7b9eb6',metalness:look.metalness,roughness:0.35,transparent:look.transparent,opacity:look.opacity,depthWrite:look.depthWrite,side:DoubleSide,clippingPlanes};
  return <group ref={objectRef} position={[component.position.x, component.position.y, component.position.z]} quaternion={[component.rotation.x, component.rotation.y, component.rotation.z, component.rotation.w]} scale={[component.scale.x, component.scale.y, component.scale.z]} onClick={e=>{e.stopPropagation();onSelect();}}>
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
  /** Observations passed directly, e.g. from the host's own state. */
  observations?: readonly Observation[];
  /** Optional host data provider; subscribed on mount and unsubscribed on unmount. The SDK opens no connection itself. */
  provider?: DataProvider;
  /** Which observations to use; measured and simulated are never mixed. Default MEASURED. */
  source?: ValueSource;
  staleAfterMs?: number;
}

/** Imperative handle of `Scada3DViewer` and `Scada3DEditor`. */
export interface ScadaHandle {
  /** Pushes observations, e.g. from a host callback; newest per tag wins and older ones are ignored. */
  setTagValues(observations: readonly Observation[]): void;
}

/**
 * Combines directly passed observations, a provider subscription and values pushed through the
 * handle into one telemetry input. Telemetry is active when the prop is given or values were pushed.
 */
function useTelemetryFeed(telemetry: TelemetryInput | undefined, ref: React.Ref<ScadaHandle> | undefined): TelemetryInput | undefined {
  const [store] = useState(() => createObservationStore());
  const provider = telemetry?.provider;
  useEffect(() => (provider ? connectProvider(store, provider) : undefined), [store, provider]);
  useImperativeHandle(ref, () => ({ setTagValues: (observations) => void store.set(observations) }), [store]);
  const fed = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useMemo(() => {
    if (!telemetry && fed.length === 0) return undefined;
    const { provider: _, ...rest } = telemetry ?? {};
    return { ...rest, observations: [...(telemetry?.observations ?? []), ...fed] };
  }, [telemetry, fed]);
}


/** Resolves telemetry against a clock refreshed every second, so values age into STALE. */
function useTelemetry(scene: ScadaScene, telemetry: TelemetryInput | undefined, now: number) {
  return useMemo(
    () => (telemetry ? resolveTelemetry(scene, telemetry.observations ?? [], { now, source: telemetry.source, staleAfterMs: telemetry.staleAfterMs, resolveBindable }) : undefined),
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
function DropPreview({ scene, plan, colliding }: { scene: ScadaScene; plan: DropPlan; colliding: boolean }) {
  const candidate = plan.snap.ok ? plan.snap.candidate : plan.snap.nearest;
  const owner = candidate && scene.components.find((c) => c.id === candidate.target.instanceId);
  const port = owner && definitionFor(owner.type, owner.properties).ports.find((p) => p.id === candidate.target.portId);
  const marker = owner && port ? portToWorld(owner, port).position : undefined;
  return <>
    <Equipment component={plan.component} viewMode="glass" selected colliding={colliding} onSelect={() => {}}/>
    {marker && <mesh position={marker}><sphereGeometry args={[0.14, 16, 16]}/><meshBasicMaterial color={plan.snap.ok ? '#48b983' : '#e76e75'} transparent opacity={0.85}/></mesh>}
  </>;
}

export type TransformMode = 'translate' | 'rotate';

/**
 * Called on every gizmo change. `gesture` is the same for all changes of one drag, so the editor
 * can merge a whole drag into one undo step.
 */
export type TransformHandler = (id: string, position: Vector3Like, rotation: QuaternionLike, gesture: string) => void;

/** Rotation snaps to quarter turns so ports stay on world axes for orthogonal routing. */
const ROTATION_SNAP = Math.PI / 2;
const TRANSLATION_SNAP = 0.05;

export function Scada3DViewer({scene,viewMode='normal',viewOverrides,onSelect,selectedId,preview,onCamera,transformMode,onTransform,flow,telemetry:telemetryInput,collisions=true,ref}: {scene:ScadaScene;viewMode?:ViewMode;viewOverrides?:Readonly<Record<string,ViewMode>>;onSelect?:(id:string)=>void;selectedId?:string;preview?:DropPlan;onCamera?:(camera:Camera)=>void;transformMode?:TransformMode;onTransform?:TransformHandler;flow?:FlowInput;telemetry?:TelemetryInput;/** Highlight overlapping solid components in red. Default true. */collisions?:boolean;ref?:React.Ref<ScadaHandle>}) {
  const telemetry = useTelemetryFeed(telemetryInput, ref);
  const collision = useMemo(() => (collisions ? findCollisions(scene, { resolveBounds }) : undefined), [scene, collisions]);
  const previewCollides = useMemo(() => !!(collisions && preview && collidingWith({ ...scene, components: [...scene.components, preview.component] }, preview.component.id).length), [scene, preview, collisions]);
  const names = useMemo(() => componentNames(scene), [scene]);
  const routes = useMemo(() => routeScene(scene, catalogResolvers), [scene]);
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
  const descriptionId = useId();
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  return <div role="region" aria-label="3D scene view" aria-describedby={descriptionId} style={{position:'relative',width:'100%',height:'100%'}}>
  <p id={descriptionId} style={visuallyHidden}>{count(scene.components.length, 'component')}, {count(scene.connections.length, 'connection')}.</p>
  <Canvas camera={{position:[7,6,9],fov:50}} onCreated={({gl})=>{gl.localClippingEnabled=true;}} style={{background:'#101d2d',width:'100%',height:'100%'}}>
    <ambientLight intensity={1.4}/><directionalLight position={[5,10,8]} intensity={2}/>
    <Grid infiniteGrid fadeDistance={35} sectionColor="#50718b" cellColor="#263e52"/>
    {shown.components.map(c=><Equipment key={c.id} component={c} unknown={unknownByComponent.get(c.id)} colliding={collision?.collidingIds.has(c.id)} viewMode={effectiveViewMode(viewMode,viewOverrides?.[c.id])} selected={selectedId===c.id} onSelect={()=>onSelect?.(c.id)} objectRef={selectedId===c.id?setSelectedObject:undefined}/>)}
    {onTransform && transformMode && selectedId && selectedObject && <GizmoControls object={selectedObject} mode={transformMode} rotationSnap={ROTATION_SNAP} translationSnap={TRANSLATION_SNAP}
      onMouseDown={()=>{gesture.current++;}}
      onObjectChange={()=>{const {position:p,quaternion:q}=selectedObject;onTransform(selectedId,{x:p.x,y:p.y,z:p.z},{x:q.x,y:q.y,z:q.z,w:q.w},`transform:${selectedId}:${gesture.current}`);}}/>}
    {routes.map(route=><RoutePipe key={route.connectionId} route={route} viewMode={viewMode}/>)}
    {flowStates && routes.map(route=>{const state=stateById.get(route.connectionId);return route.status==='ok'&&state?<FlowMarkers key={`flow:${route.connectionId}`} route={route} state={state}/>:null;})}
    {preview && <DropPreview scene={scene} plan={preview} colliding={previewCollides}/>}
    {onCamera && <CameraBridge onCamera={onCamera}/>}
    <OrbitControls makeDefault/><GizmoHelper alignment="bottom-right" margin={[70,70]}><GizmoViewport/></GizmoHelper>
  </Canvas>
  {(flow?.source??telemetry?.source)==='SIMULATED'&&<div style={{position:'absolute',top:10,right:12,padding:'4px 10px',borderRadius:4,background:'#b58cff',color:'#10051f',fontWeight:700,fontSize:12,letterSpacing:1,pointerEvents:'none'}}>SIMULATED FLOW</div>}
  {collision&&collision.pairs.length>0&&<CollisionList pairs={collision.pairs} names={names} order={scene.components.map(c=>c.id)}/>}
  {showHeatLegend&&<div style={{position:'absolute',top:flow?.source==='SIMULATED'?44:10,right:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>
    <div style={{height:8,borderRadius:2,marginBottom:4,background:`linear-gradient(90deg, ${heatColor(HEAT_RANGE_C.min)}, ${heatColor(HEAT_RANGE_C.max)})`}}/>
    Temperature tint {HEAT_RANGE_C.min}–{HEAT_RANGE_C.max} °C (display only, not simulated)
  </div>}
  {live&&live.properties.length>0&&<div aria-label="Telemetry summary" aria-live="polite" style={{position:'absolute',bottom:flowStates?36:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeTelemetry(live.properties)}</div>}
  {flowStates&&<div aria-label="Flow summary" aria-live="polite" style={{position:'absolute',bottom:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeFlow(flowStates)}</div>}
  </div>;
}

/** Authored starting properties for a newly added component of each type. */
function defaultProperties(type: ComponentKind): ComponentInstance['properties'] {
  if (type === 'tank') return { level: 45 };
  if (type === 'valve') return { open: true };
  const parameters = componentCatalog[type].parameters ?? {};
  return Object.fromEntries(Object.entries(parameters).map(([name, spec]) => [name, spec.default]));
}
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

/** Display names such as "Ball Valve 2": catalog label plus a per-type counter in scene order. */
/** Ids of the components that `id` overlaps. */
function collidingWith(scene: ScadaScene, id: string): string[] {
  return findCollisions(scene, { resolveBounds }).pairs.flatMap((p) => (p.a === id ? [p.b] : p.b === id ? [p.a] : []));
}

/** Overlay listing overlapping pairs, named in scene order (at most five lines). */
function CollisionList({ pairs, names, order }: { pairs: readonly { a: string; b: string }[]; names: Map<string, string>; order: string[] }) {
  const index = new Map(order.map((id, i) => [id, i]));
  const lines = pairs.map((p) => {
    const [first, second] = [p.a, p.b].sort((x, y) => (index.get(x) ?? 0) - (index.get(y) ?? 0));
    return `${names.get(first)} and ${names.get(second)} overlap`;
  });
  const shown = lines.slice(0, 5);
  if (lines.length > 5) shown.push(`…and ${lines.length - 5} more`);
  return <div aria-label="Collisions" aria-live="polite" style={{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',padding:'4px 10px',borderRadius:4,background:'#3b0d12e6',color:'#ffd5d8',border:`1px solid ${COLLISION_COLOR}`,fontSize:12,pointerEvents:'none',whiteSpace:'pre-line'}}>{shown.join('\n')}</div>;
}

/** Keyboard-reachable list of everything in the scene; selecting here equals clicking in the canvas. */
function SceneList({ scene, selected, onSelect, locked }: { scene: ScadaScene; selected?: string; onSelect: (id: string) => void; locked?: boolean }) {
  const names = componentNames(scene);
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
      {entries.map(e => <button key={e.id} aria-pressed={selected === e.id} onClick={() => onSelect(e.id)}
        style={{display:'block',width:`calc(100% - ${e.depth*14}px)`,marginLeft:e.depth*14,textAlign:'left',marginTop:3,fontWeight:selected===e.id?700:400}}>{e.name}</button>)}
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
  name: string; spec: ParameterSpec; component: ComponentInstance; connectedPorts: ReadonlySet<string>;
  onChange: (changes: Pick<ComponentInstance, 'position' | 'properties'>) => void;
}) {
  const current = typeof component.properties[name] === 'number' ? component.properties[name] as number : spec.default;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const value = draft ?? String(current);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= spec.min && n <= spec.max;
  function apply(next: number) {
    const properties = { ...component.properties, [name]: next };
    const ports = definitionFor(component.type, component.properties).ports;
    const connected = ports.filter((p) => connectedPorts.has(p.id));
    const anchorId = (connected.length === 1 ? connected[0] : ports[0])?.id;
    const anchor = (props: ComponentInstance['properties']) => definitionFor(component.type, props).ports.find((p) => p.id === anchorId);
    const before = anchor(component.properties), after = anchor(properties);
    let position = component.position;
    if (before && after) {
      const [b, a] = [portToWorld(component, before).position, portToWorld(component, after).position];
      position = { x: position.x + b[0] - a[0], y: position.y + b[1] - a[1], z: position.z + b[2] - a[2] };
    }
    onChange({ position, properties });
  }
  const label = `${spec.label} (${spec.unit})`;
  return <label style={{display:'block',marginTop:10}}>{label} <input aria-label={label} type="number" min={spec.min} max={spec.max} step={spec.step} style={{width:80}} value={value}
      onFocus={()=>setDraft(String(current))} onBlur={()=>setDraft(undefined)}
      onChange={e=>{setDraft(e.target.value);const v=Number(e.target.value);if(e.target.value.trim()!==''&&Number.isFinite(v)&&v>=spec.min&&v<=spec.max)apply(v);}}/>
    {!valid&&<small role="alert" style={{display:'block',color:'#ff9aa2'}}>{spec.label} must be between {spec.min} and {spec.max} {spec.unit}.</small>}
  </label>;
}

/** Parent/child locks for the selected component (ADR-0008). */
function AssemblyControls({ component, scene, onChange, onNotice }: { component: ComponentInstance; scene: ScadaScene; onChange: (next: ScadaScene) => void; onNotice: (lines: string[]) => void }) {
  const names = componentNames(scene);
  const children = scene.components.filter((c) => c.parentId === component.id).length;
  const assemblySize = assemblyOf(scene, component.id).length;
  const hasConnections = connectionsOf(scene, component.id).length > 0;
  return <div style={{marginTop:10}}>
    <small>Assembly</small>
    {component.parentId && <p style={{fontSize:12,margin:'4px 0'}}>Locked to {names.get(component.parentId)}</p>}
    {children > 0 && <p style={{fontSize:12,margin:'4px 0'}}>Parent of {children} component{children === 1 ? '' : 's'}</p>}
    {assemblySize === 1 && <p style={{fontSize:12,margin:'4px 0'}}>Not in an assembly. Moving it moves only this component.</p>}
    <button disabled={!hasConnections} title="Make this the parent of everything connected to it; then they all move together"
      onClick={() => { const r = lockConnectedAsChildren(scene, component.id); if (r.ok) { onChange(r.scene); onNotice([describeLock(r.scene, component.id)]); } }}>Lock connected as children</button>
    {component.parentId && <button onClick={() => onChange(unlockFromParent(scene, component.id))}>Unlock from parent</button>}
    {children > 0 && <button onClick={() => onChange(unlockFromParent(scene, component.id))}>Unlock assembly</button>}
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

export function Scada3DEditor({initialScene,onChange,flow,telemetry:telemetryInput,collisions=true,locked,defaultLocked=false,onLockedChange,ref}:{initialScene?:ScadaScene;onChange?:(scene:ScadaScene)=>void;flow?:FlowInput;telemetry?:TelemetryInput;/** Highlight overlapping solid components in red. Default true. */collisions?:boolean;/** Controlled lock: when set, the host decides; the toggle calls onLockedChange. */locked?:boolean;/** Initial lock state when `locked` is not controlled. Default false. */defaultLocked?:boolean;onLockedChange?:(locked:boolean)=>void;ref?:React.Ref<ScadaHandle>}) {
  // The editor owns the feed; the viewer below only receives the merged observations.
  const telemetry=useTelemetryFeed(telemetryInput,ref);
  const [history,setHistory]=useState<History>(()=>createHistory(initialScene??createEmptyScene()));
  const scene=history.present;
  const [selected,setSelected]=useState<string>();
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
  useEffect(()=>{if(notice.length===0)return;const t=setTimeout(()=>setNotice([]),NOTICE_MS);return()=>clearTimeout(t);},[notice]);
  function announceConnections(before:ScadaScene,after:ScadaScene){const lines=describeNewConnections(before,after);if(lines.length)setNotice(lines);}
  const camera=useRef<Camera|undefined>(undefined);
  const dragKind=useRef<ComponentKind|undefined>(undefined);
  const [preview,setPreview]=useState<DropPlan>();
  // Placement is never blocked; the status line just warns about an overlap.
  const previewOverlap=useMemo(()=>{
    if(!collisions||!preview) return '';
    const withPreview={...scene,components:[...scene.components,preview.component]};
    const names=componentNames(withPreview);
    const hits=collidingWith(withPreview,preview.component.id).map(id=>names.get(id));
    return hits.length?` — overlaps ${hits.join(', ')}`:'';
  },[collisions,preview,scene]);
  // Keyboard/click add: rest on the ground in a row, never auto-connect.
  function add(type:ComponentKind) {
    const id=newId();
    const position=dropPosition(definitionFor(type,defaultProperties(type)),[scene.components.length*2.4,0,0]);
    update({...scene,components:[...scene.components,{id,type,position,rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},properties:defaultProperties(type)}]});setSelected(id);
  }
  function planAt(e:React.DragEvent<HTMLElement>, id:string):DropPlan|undefined {
    const kind=dragKind.current, canvas=e.currentTarget.querySelector('canvas');
    if(!kind||!camera.current||!canvas) return undefined;
    const hit=screenToPlane({x:e.clientX,y:e.clientY},canvas.getBoundingClientRect(),camera.current);
    return hit ? planDrop(scene,kind,hit,{createId:()=>id,properties:defaultProperties(kind)}) : undefined;
  }
  function endDrag(){dragKind.current=undefined;setPreview(undefined);}
  function drop(e:React.DragEvent<HTMLElement>) {
    e.preventDefault();
    if(isLocked){endDrag();return;}
    const plan=planAt(e,newId());
    endDrag();
    if(!plan) return;
    // Component and its snapped connection land as one undo step.
    const result=applyDrop(scene,plan,newId);
    if(result.ok){update(result.scene);setSelected(plan.component.id);announceConnections(scene,result.scene);}
  }
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
    const step=clipboardWidth(clipboard,catalogResolvers)+0.5;
    const pasted=pasteComponents(scene,clipboard,{createId:newId,offset:{x:step*pasteCount.current,y:0,z:0}});
    const checked=validateScene(pasted.scene,catalogResolvers);
    if(!checked.ok){setClipNote(`Could not paste: ${checked.errors[0].message}`);return;}
    update(checked.scene);
    const root=checked.scene.components.find(c=>pasted.pastedIds.includes(c.id)&&!(c.parentId&&pasted.pastedIds.includes(c.parentId)));
    setSelected(root?.id);
    const copiedIds=new Set(clipboard.components.map(c=>c.id));
    const hadBindings=(scene.tagBindings??[]).some(b=>b.kind==='property'?copiedIds.has(b.instanceId):clipboard.connections.some(c=>c.id===b.connectionId));
    setClipNote(`Pasted ${plural(pasted.pastedIds.length)}.${hadBindings?' Tag bindings are not copied.':''}`);
  }
  // Explicit, user-triggered: ports at the same point facing each other become connections (ADR-0002).
  const touching=useMemo(()=>findTouchingPorts(scene,catalogResolvers),[scene]);
  const [touchingNote,setTouchingNote]=useState('');
  function connectTouching(){
    const result=connectTouchingPorts(scene,{...catalogResolvers,createId:newId});
    if(!result.ok){setTouchingNote(`Could not connect: ${result.error.message}`);return;}
    update(result.scene);
    announceConnections(scene,result.scene);
    const names=componentNames(scene);
    const skipped=result.rejected.map(r=>`${names.get(r.from.instanceId)} "${r.from.portId}" / ${names.get(r.to.instanceId)} "${r.to.portId}" (${r.reason})`);
    // Show at most five problems so a big scene cannot flood the panel.
    const listed=skipped.length>5?[...skipped.slice(0,5),`…and ${skipped.length-5} more`]:skipped;
    setTouchingNote(`Connected ${result.added} touching port pair${result.added===1?'':'s'}.${listed.length?` Not joined: ${listed.join('; ')}.`:''}`);
  }
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
  return <div ref={root} tabIndex={-1} onKeyDown={onKeyDown} style={{display:'grid',gridTemplateColumns:'190px minmax(0,1fr) 245px',gridTemplateRows:'minmax(0,1fr)',height:'100%',minHeight:500,color:'#ebf2fa',background:'#142437',fontFamily:'system-ui',outline:'none'}}>
    <aside style={{padding:14,borderRight:'1px solid #3c5366',overflowY:'auto',minHeight:0}}>
      <button aria-pressed={isLocked} onClick={()=>setLocked(!isLocked)} style={{display:'block',width:'100%',marginBottom:8,padding:6,fontWeight:isLocked?700:400}}>{isLocked?'Unlock editing':'Lock editing'}</button>
      <fieldset disabled={isLocked} style={{border:'none',padding:0,margin:0}}>
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <button onClick={()=>travel(undo)} disabled={!canUndo(history)} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={()=>travel(redo)} disabled={!canRedo(history)} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">Redo</button>
      </div>
      <div role="group" aria-label="Transform tool" style={{display:'flex',gap:6}}>{toolButton('translate','Move')}{toolButton('rotate','Rotate')}</div>
      <button onClick={connectTouching} disabled={touching.matches.length===0} title="Join ports that sit at the same point and face each other" style={{display:'block',width:'100%',marginTop:8}}>Connect touching ports ({touching.matches.length})</button>
      <p aria-live="polite" style={{fontSize:12,margin:'4px 0 0'}}>{touchingNote}</p>
      <button onClick={paste} disabled={!clipboard} title="Paste (Ctrl+V)" style={{display:'block',width:'100%',marginTop:6}}>Paste ({clipboard?.components.length??0})</button>
      <p aria-live="polite" style={{fontSize:12,margin:'4px 0 0'}}>{clipNote}</p>
      <h3>Components</h3>{(Object.keys(componentCatalog) as ComponentKind[]).map(k=><button key={k} draggable onDragStart={e=>{e.dataTransfer.setData('scada-kind',k);e.dataTransfer.effectAllowed='copy';dragKind.current=k;}} onDragEnd={endDrag} onClick={()=>add(k)} style={{display:'block',width:'100%',marginBottom:8,padding:9,cursor:'grab'}}>{componentCatalog[k].label} +</button>)}
      </fieldset>
      <SceneList scene={scene} selected={selected} onSelect={setSelected} locked={isLocked}/>
      <label style={{display:'block'}}>View <select aria-label="View mode" value={viewMode} onChange={e=>setViewMode(e.target.value as ViewMode)}>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>
    </aside>
    <main onDragOver={e=>{if(!dragKind.current||isLocked)return;e.preventDefault();setPreview(planAt(e,'drop-preview'));}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setPreview(undefined);}}
      onDrop={drop} style={{minWidth:0,position:'relative'}}>
      <Scada3DViewer scene={scene} viewMode={viewMode} viewOverrides={viewOverrides} selectedId={selected} onSelect={setSelected} preview={preview} onCamera={c=>{camera.current=c;}} transformMode={transformMode} onTransform={isLocked?undefined:transform} flow={flow} telemetry={telemetry} collisions={collisions}/>
      {isLocked&&<div style={{position:'absolute',bottom:10,right:110,padding:'4px 10px',borderRadius:4,background:'#0b1725e6',border:'1px solid #ffd166',color:'#ffd166',fontSize:12,pointerEvents:'none'}}>🔒 Editing locked</div>}
      {notice.length>0&&<ConnectionNotice lines={notice} onDismiss={()=>setNotice([])}/>}
      <div role="status" aria-live="polite" style={{position:'absolute',top:10,left:12,padding:preview?'6px 10px':0,borderRadius:4,background:'#0b1725cc',fontSize:13,pointerEvents:'none'}}>{preview?describeDrop(preview,scene)+previewOverlap:''}</div>
    </main>
    <aside style={{padding:14,borderLeft:'1px solid #3c5366',overflowY:'auto',minHeight:0}}>
      <h3>Properties</h3>
      {component ? <>
        <p>{componentCatalog[component.type].label}</p>
        <fieldset disabled={isLocked} style={{border:'none',padding:0,margin:0}}>
        <small>Position (metres)</small>
        {(['x','y','z'] as const).map(axis=><label key={axis} style={{display:'block',marginTop:8}}>{axis.toUpperCase()} <input type="number" step=".1" style={{width:100}} value={component.position[axis]} onChange={e=>moveMember(component.id,{...component.position,[axis]:Number(e.target.value)},component.rotation,`position:${component.id}:${axis}`)}/></label>)}
        <RotationFields rotation={component.rotation} onChange={(rotation,mergeKey)=>moveMember(component.id,component.position,rotation,mergeKey&&`rotation:${component.id}:${mergeKey}`)}/>
        <AssemblyControls component={component} scene={scene} onChange={next=>update(next)} onNotice={setNotice}/>
        {Object.entries(componentCatalog[component.type].parameters??{}).map(([name,spec])=><ParameterField key={`${component.id}:${name}`} name={name} spec={spec} component={component} connectedPorts={new Set(connectionsOf(scene,component.id).flatMap(c=>[c.from,c.to]).filter(e=>e.instanceId===component.id).map(e=>e.portId))} onChange={(changes)=>patch(changes,`parameter:${component.id}:${name}`)}/>)}
        {component.type==='tank'&&<>
          <label style={{display:'block',marginTop:14}}>Liquid level % <input type="range" min="0" max="100" value={Math.round((liquidFill(component.properties.level).fraction??0)*100)} onChange={e=>patch({properties:{...component.properties,level:Number(e.target.value)}},`level:${component.id}`)}/></label>
          <LevelNote level={component.properties.level}/>
          <label style={{display:'block',marginTop:8}}>Temperature °C <input type="number" step="1" style={{width:70}} value={typeof component.properties.temperature==='number'?component.properties.temperature:''} onChange={e=>{const {temperature:_,...rest}=component.properties;patch({properties:e.target.value===''?rest:{...rest,temperature:Number(e.target.value)}},`temperature:${component.id}`);}}/></label>
        </>}
        {component.type==='valve'&&<label><input type="checkbox" checked={component.properties.open!==false} onChange={e=>patch({properties:{...component.properties,open:e.target.checked}})}/> Valve open</label>}
        <BindingsEditor component={component} scene={scene} live={live?.properties} onSet={setBinding}/>
        </fieldset>
        <label style={{display:'block',marginTop:8}}>Component view <select aria-label="Component view" value={viewOverrides[component.id]??''} onChange={e=>{const value=e.target.value as ViewMode|'';setViewOverrides(({[component.id]:_,...rest})=>value?{...rest,[component.id]:value}:rest);}}><option value="">Use global</option>{viewModes.map(m=><option key={m} value={m}>{viewLabels[m]}</option>)}</select></label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
          <button onClick={()=>copyIds([component.id])} title="Copy (Ctrl+C)">Copy component</button>
          {assemblyOf(scene,component.id).length>1&&<button onClick={()=>copyIds(assemblyOf(scene,component.id))} title="Copy the parent and all its children (Ctrl+Shift+C)">Copy assembly</button>}
        </div>
        <p><button onClick={()=>removeSelected(component.id)} disabled={isLocked}>Remove</button></p>
      </>:<p>Select equipment in the canvas.</p>}
      <hr/><small>Scene JSON</small><textarea aria-label="Scene JSON" readOnly value={serialized} style={{width:'100%',height:170,boxSizing:'border-box'}}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
        <button onClick={exportScene}>Export JSON</button>
        <input type="file" accept=".json,application/json" aria-label="Import scene file" disabled={isLocked} onChange={importFile} style={{fontSize:12,maxWidth:'100%'}}/>
      </div>
      <textarea aria-label="Import JSON text" placeholder="Paste scene JSON to import" disabled={isLocked} value={importText} onChange={e=>setImportText(e.target.value)} style={{width:'100%',height:60,marginTop:6,boxSizing:'border-box'}}/>
      <button onClick={()=>loadScene(importText)} disabled={isLocked||!importText.trim()}>Load text</button>
      <p aria-live="polite" style={{fontSize:12,margin:'6px 0'}}>{importNote}</p>
      {importErrors.length>0&&<ul role="alert" aria-label="Import errors" style={{fontSize:12,color:'#ff9aa2',paddingLeft:16,margin:0}}>{importErrors.map((line,i)=><li key={i}>{line}</li>)}</ul>}
    </aside>
  </div>;
}
