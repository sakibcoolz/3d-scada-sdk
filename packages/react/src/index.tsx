import React, { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasTexture, Color, DoubleSide, LatheGeometry, Vector2, Matrix4, MeshStandardMaterial, Plane, Quaternion, SphereGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Camera, type WebGLRenderer, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, TransformControls } from '@react-three/drei';
import { assemblyOf, clipboardWidth, connectProvider, copyComponents, pasteComponents, validateScene, type ComponentClipboard, connectionsOf, lockConnectedAsChildren, moveAssembly, unlockFromParent, connectTouchingPorts, attachComponents, portsCompatible, findOpenJoints, seatOnConnection, type OpenJoint, createEmptyScene, findCollisions, findTouchingPorts, createObservationStore, displayScene, type DataProvider, portToWorld, removeComponent, resolveFlow, resolveTelemetry, type Observation, type PropertyState, type TagBinding, routeScene, sampleRouteCenterline, serializeScene, type FlowReading, type FlowState, type ValueSource, type ComponentInstance, type ComponentType, type ConnectionPort, type PipeRoute, type SceneUnderlay, type QuaternionLike, type QuaternionTuple, type Vector3Like, type ScadaScene, type SceneViews, type Vector3Tuple } from '@sakibcoolz/core';
import { builtInRegistry, componentPresets, flangePairParts, flangeParts, isChoiceParameter, liquidProfile, weldParts, outerRadiusFor, pipeOuterRadius, sizeOfPort, type ChoiceParameterSpec, type ComponentRegistry, type GeometryPart, type IndustrialComponentDefinition, type NumberParameterSpec } from '@sakibcoolz/components';
import { RegistryContext, useRegistry } from './registryContext.js';
import { createEquipmentGeometries, createJointPartGeometry, createRouteGeometry, disposeGeometries } from './geometry.js';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop.js';
import { usePlateTexture } from './plateText.js';
import { cutBelow } from './liquidCut.js';
import { EDITOR_CSS, formatMetres } from './editorStyles.js';
import { spatialChunks } from './instancing.js';
import { jointPlacements, type JointPlacement } from './jointLayer.js';
import { wireColors, wireSegments } from './wires.js';
import { sanitizeSvg } from '@sakibcoolz/asset-import';
import { componentNames, describeAttach, describeLock, describeNewConnections, describeOpenJoints, describeSeat } from './connectionNotice.js';

import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history.js';
import { importSceneText, MAX_SCENE_FILE_BYTES } from './sceneFile.js';
import { describeProperty, summarizeTelemetry } from './telemetryView.js';
import { PortsInspector, RelationsExplorer } from './inspector.js';
import { describePorts } from './ports.js';
import { describeRelations } from './relations.js';
import { nudge } from './keyboard.js';
import { degreesFromRotation, rotationFromDegrees, turnAboutWorldAxis } from './rotationForm.js';
import { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, viewModes, type ViewMode } from './appearance.js';
import { FLOW_MARKER_SPACING, FLOW_MARKER_SPEED, flowAppearance, pathLengths, pointAtInto, summarizeFlow } from './flowVisual.js';
import { FLOOR_THICKNESS, floorSlab } from './floor.js';
import { enterVr, useVrSupport, useXrPresenting, XrWalk } from './xrWalk.js';
import { DesktopWalk, type WalkerState, type WalkPlaceInput } from './walkMode.js';

// Public API of @sakibcoolz/react: the two components, their prop/handle types and scene import helpers.
// Editor internals (drop planning, history, visual helpers) stay private. See docs/API.md.
export { formatSceneErrors, importSceneText, MAX_SCENE_FILE_BYTES, type SceneImport } from './sceneFile.js';
export { viewModes, type ViewMode } from './appearance.js';

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
/** Valve ball colour when its bound open/closed tag cannot be trusted. */
const VALVE_UNKNOWN = '#8a96a3';

/** A component was clicked; `additive` when Shift was held. */
export type SelectHandler = (id: string, options?: { additive: boolean }) => void;

/** When the viewer draws plain equipment as instanced meshes (T-046). */
export type InstancingMode = 'auto' | 'off' | 'always';
/** `instancing="auto"` instances scenes with at least this many components. */
const INSTANCING_THRESHOLD = 100;

const definitionKeys = new WeakMap<object, number>();
let nextDefinitionKey = 0;
const definitionKey = (d: object) => definitionKeys.get(d) ?? (definitionKeys.set(d, ++nextDefinitionKey), nextDefinitionKey);

/**
 * Plain equipment (not selected, not colliding, normal view mode) drawn as one instanced mesh per
 * part of each definition: thousands of identical valves become a handful of draws. Valve state
 * and tank heat are per-instance colours; liquid level and handle angle are per-instance matrices.
 */
function InstancedEquipment({ components, unknown, onSelect }: { components: readonly ComponentInstance[]; unknown: ReadonlyMap<string, ReadonlySet<string>>; onSelect?: SelectHandler }) {
  const registry = useRegistry();
  const groups = useMemo(() => {
    const byDefinition = new Map<IndustrialComponentDefinition, ComponentInstance[]>();
    for (const c of components) {
      const d = registry.definitionFor(c.type, c.properties);
      byDefinition.set(d, [...(byDefinition.get(d) ?? []), c]);
    }
    return [...byDefinition];
  }, [components]);
  return <>{groups.map(([definition, members]) => <InstancedDefinition key={definitionKey(definition)} definition={definition} members={members} unknown={unknown} onSelect={onSelect}/>)}</>;
}

const InstancedDefinition = React.memo(function InstancedDefinition({ definition, members, unknown, onSelect }: { definition: IndustrialComponentDefinition; members: ComponentInstance[]; unknown: ReadonlyMap<string, ReadonlySet<string>>; onSelect?: SelectHandler }) {
  const geometries = useSharedGeometries(definition);
  const chunks = useMemo(() => spatialChunks(members), [members]);
  return <>{chunks.map((chunk, c) => definition.parts.map((part, i) => <InstancedPart key={`${c}:${i}:${chunk.length}`} part={part} geometry={geometries[i]} members={chunk} unknown={unknown} onSelect={onSelect}/>))}</>;
});

const instanceScratch = { local: new Matrix4(), world: new Matrix4(), position: new Vector3(), rotation: new Quaternion(), scale: new Vector3(), color: new Color() };
const normalShell = shellLook('normal');

function InstancedPart({ part, geometry, members, unknown, onSelect }: { part: IndustrialComponentDefinition['parts'][number]; geometry: BufferGeometry; members: ComponentInstance[]; unknown: ReadonlyMap<string, ReadonlySet<string>>; onSelect?: SelectHandler }) {
  const mesh = useRef<InstancedMesh>(null);
  const role = part.role;
  const plateText = part.shape === 'box' ? part.text : undefined;
  const plateMap = usePlateTexture(plateText);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const { local, world, position, rotation, scale, color } = instanceScratch;
    members.forEach((c, k) => {
      world.compose(position.set(c.position.x, c.position.y, c.position.z), rotation.set(c.rotation.x, c.rotation.y, c.rotation.z, c.rotation.w), scale.set(c.scale.x, c.scale.y, c.scale.z));
      local.identity();
      if (role === 'liquid' && part.shape === 'cylinder') {
        // Same as the individual mesh: scale the column from its bottom face; no level, no liquid.
        const fraction = liquidFill(c.properties.level).fraction ?? 0;
        const height = Math.max(0.001, fraction);
        local.makeScale(1, fraction > 0 ? height : 0, 1).setPosition(0, (part.center[1] - part.length / 2) * (1 - height), 0);
        m.setColorAt(k, color.set(heatColor(c.properties.temperature) ?? LIQUID_COLOR));
      } else if (role === 'valve-handle') {
        local.makeRotationY(c.properties.open !== false ? 0 : Math.PI / 2);
      } else if (role === 'valve-ball') {
        m.setColorAt(k, color.set(unknown.get(c.id)?.has('open') ? VALVE_UNKNOWN : c.properties.open !== false ? '#48b983' : '#e76e75'));
      }
      m.setMatrixAt(k, world.multiply(local));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [members, unknown, role, part]);
  const material = role === 'liquid' ? <meshStandardMaterial color="#ffffff" transparent opacity={0.65} depthWrite={false}/>
    : role === 'valve-ball' ? <meshStandardMaterial color="#ffffff"/>
    : role === 'valve-handle' ? <meshStandardMaterial color="#e3d5a5"/>
    : role === 'gauge' ? <meshStandardMaterial color="#d8eefc" transparent opacity={0.3} depthWrite={false} roughness={0.1}/>
    : role === 'plate' ? <meshStandardMaterial key={plateText} color={plateMap ? '#ffffff' : '#e8edf2'} map={plateMap ?? null} roughness={0.6}/>
    : role === 'scale' ? <meshStandardMaterial color="#3d4a56" roughness={0.8}/>
    : <meshStandardMaterial color="#7b9eb6" metalness={normalShell.metalness} roughness={0.35} side={DoubleSide}/>;
  return <instancedMesh ref={mesh} args={[geometry, undefined, members.length]} userData={{ role, componentIds: members.map((c) => c.id), ...(plateText ? { plateText } : {}) }}
    onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined && members[e.instanceId]) onSelect?.(members[e.instanceId].id, { additive: e.nativeEvent.shiftKey }); }}>
    {material}
  </instancedMesh>;
}

/** Liquid in a lathe-shaped vessel (conical tank), rebuilt for each level so it follows the walls. */
function LatheLiquid({ points, fraction, color, tag }: { points: [number, number][]; fraction: number; color: string; tag: Record<string, string> }) {
  // Rounded to 0.1 % so a live feed does not rebuild the mesh for invisible changes.
  const step = Math.round(fraction * 1000) / 1000;
  const geometry = useMemo(() => {
    const profile = liquidProfile(points, step);
    return profile.length ? new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 32) : undefined;
  }, [points, step]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return <mesh geometry={geometry} visible={!!geometry} userData={{ ...tag, levelFraction: step }}>
    <meshStandardMaterial color={color} transparent opacity={0.65} depthWrite={false}/>
  </mesh>;
}

/** A name plate; its `text` (the capacity) is drawn on it as a texture. */
function Plate({ geometry, text, userData }: { geometry: BufferGeometry; text?: string; userData: Record<string, string> }) {
  const map = usePlateTexture(text);
  return <mesh geometry={geometry} userData={text ? { ...userData, plateText: text } : userData}>
    <meshStandardMaterial key={text} color={map ? '#ffffff' : '#e8edf2'} map={map ?? null} roughness={0.6}/>
  </mesh>;
}

/** Liquid that fills a horizontal or round shape (horizontal and spherical tanks): drawn as a cut. */
const isCutLiquid = (part: GeometryPart) => part.role === 'liquid' && (part.shape === 'sphere' || (part.shape === 'lathe' && (part.axis ?? 'y') !== 'y'));

/** Liquid in a horizontal or spherical tank: the full liquid shape cut flat at the level (ADR-0018). */
function CutLiquid({ geometry, fraction, color, tag }: { geometry: BufferGeometry; fraction: number; color: string; tag: Record<string, string> }) {
  // Rounded to 0.1 % so a live feed does not rebuild the mesh for invisible changes.
  const step = Math.round(fraction * 1000) / 1000;
  const cut = useMemo(() => {
    if (!(step > 0)) return undefined;
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox!;
    return step >= 1 ? geometry.clone() : cutBelow(geometry, min.y + step * (max.y - min.y));
  }, [geometry, step]);
  useEffect(() => () => cut?.dispose(), [cut]);
  return <mesh geometry={cut} visible={!!cut} userData={{ ...tag, levelFraction: step }}>
    <meshStandardMaterial color={color} transparent opacity={0.65} depthWrite={false}/>
  </mesh>;
}

function Equipment({ component, viewMode, selected, onSelect, objectRef, unknown, colliding }: { component:ComponentInstance; viewMode:ViewMode; selected:boolean; onSelect:(additive:boolean)=>void; objectRef?:(object:Object3D|null)=>void; /** Bound properties whose live value cannot be trusted. */ unknown?:ReadonlySet<string>; /** Overlaps another solid component. */ colliding?:boolean }) {
  const registry = useRegistry();
  // Per-instance definition: parametric types (pipe length) change ports, bounds and parts.
  const definition = registry.definitionFor(component.type, component.properties);
  const geometries = useSharedGeometries(definition);
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
  return <group ref={objectRef} position={[component.position.x, component.position.y, component.position.z]} quaternion={[component.rotation.x, component.rotation.y, component.rotation.z, component.rotation.w]} scale={[component.scale.x, component.scale.y, component.scale.z]} onClick={e=>{e.stopPropagation();onSelect(e.nativeEvent.shiftKey);}}>
    {definition.parts.map((part, i) => {
      const geometry = geometries[i];
      if (part.role === 'liquid' && part.shape === 'cylinder') {
        // Scale the liquid column from its bottom face so the surface tracks level; no level, no liquid.
        const height = Math.max(0.001, fill.fraction ?? 0);
        const bottom = part.center[1] - part.length / 2;
        return <mesh key={i} geometry={geometry} userData={tag('liquid')} visible={(fill.fraction ?? 0) > 0} scale={[1, height, 1]} position={[0, bottom * (1 - height), 0]}><meshStandardMaterial color={liquidColor} transparent opacity={0.65} depthWrite={false}/></mesh>;
      }
      if (part.role === 'liquid' && part.shape === 'box') {
        // A basin's liquid: scaled from its floor like the cylinder column.
        const height = Math.max(0.001, fill.fraction ?? 0);
        const bottom = part.center[1] - part.size[1] / 2;
        return <mesh key={i} geometry={geometry} userData={tag('liquid')} visible={(fill.fraction ?? 0) > 0} scale={[1, height, 1]} position={[0, bottom * (1 - height), 0]}><meshStandardMaterial color={liquidColor} transparent opacity={0.65} depthWrite={false}/></mesh>;
      }
      if (isCutLiquid(part)) return <CutLiquid key={i} geometry={geometry} fraction={fill.fraction ?? 0} color={liquidColor} tag={tag('liquid')}/>;
      if (part.role === 'liquid' && part.shape === 'lathe') return <LatheLiquid key={i} points={part.points} fraction={fill.fraction ?? 0} color={liquidColor} tag={tag('liquid')}/>;
      if (part.role === 'gauge') return <mesh key={i} geometry={geometry} userData={tag('gauge')}><meshStandardMaterial color="#d8eefc" transparent opacity={0.3} depthWrite={false} roughness={0.1}/></mesh>;
      if (part.role === 'plate') return <Plate key={i} geometry={geometry} text={part.shape === 'box' ? part.text : undefined} userData={tag('plate')}/>;
      if (part.role === 'scale') return <mesh key={i} geometry={geometry} userData={tag('scale')}><meshStandardMaterial color="#3d4a56" roughness={0.8}/></mesh>;
      if (part.role === 'valve-ball') return <mesh key={i} geometry={geometry} userData={tag('valve-ball')}><meshStandardMaterial color={unknown?.has('open')?VALVE_UNKNOWN:open?'#48b983':'#e76e75'}/></mesh>;
      if (part.role === 'valve-handle') return <mesh key={i} geometry={geometry} userData={tag('valve-handle')} rotation={[0, open ? 0 : Math.PI / 2, 0]}><meshStandardMaterial color="#e3d5a5"/></mesh>;
      return <mesh key={i} geometry={geometry} userData={tag('shell')}>
        <meshStandardMaterial key={viewMode} {...shellProps}/>
        {look.edges && <Edges userData={tag('edges')} threshold={20} color="#9fd3ff"/>}
      </mesh>;
    })}
  </group>;
}

/** Drawn outer radius for a port: its catalog size, DN150 if it has none. */
function portRadius(port: ConnectionPort): number {
  const size = sizeOfPort(port);
  return size ? outerRadiusFor(size) : pipeOuterRadius;
}


const RoutePipe = React.memo(function RoutePipe({ route, radius, material }: { route: PipeRoute; /** Outer radius of the connected ports' size. */ radius: number; material: Material }) {
  // Rebuild geometry only when the routed centreline changes, not on every scene update.
  const shape = route.status === 'ok' ? route.points.flat().join(',') : '';
  const geometry = useMemo(() => (route.status === 'ok' ? createRouteGeometry(route, radius) : undefined), [shape, radius]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (route.status !== 'ok') {
    // Invalid route: dashed red line between the ports so the problem is visible, no pipe drawn.
    return 'from' in route ? <Line points={[route.from, route.to]} color="#e76e75" dashed dashSize={0.15} gapSize={0.1} lineWidth={2}/> : null;
  }
  return geometry ? <mesh geometry={geometry} material={material}/> : null;
});

/** One material for every routed pipe; follows glass/x-ray transparency, cutaway leaves pipes whole. */
function useRouteMaterial(viewMode: ViewMode): Material {
  const material = useMemo(() => {
    const look = shellLook(viewMode === 'cutaway' ? 'normal' : viewMode);
    return new MeshStandardMaterial({ color: '#8fa9bc', metalness: look.metalness, roughness: 0.35, transparent: look.transparent, opacity: look.opacity, depthWrite: look.depthWrite });
  }, [viewMode]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/**
 * Part geometries shared by every component with the same definition (definitions are cached per
 * shape, so identical parts share one GPU buffer). Disposed when the last user unmounts.
 */
const sharedGeometries = new Map<object, { geometries: BufferGeometry[]; users: number }>();
function useSharedGeometries(definition: IndustrialComponentDefinition): BufferGeometry[] {
  const geometries = useMemo(() => {
    let entry = sharedGeometries.get(definition);
    if (!entry) sharedGeometries.set(definition, (entry = { geometries: createEquipmentGeometries(definition), users: 0 }));
    return entry.geometries;
  }, [definition]);
  useEffect(() => {
    const entry = sharedGeometries.get(definition);
    if (!entry || entry.geometries !== geometries) return;
    entry.users++;
    return () => {
      entry.users--;
      // Wait a tick: a remount of the same shape picks the entry up again instead of rebuilding it.
      queueMicrotask(() => {
        if (entry.users === 0 && sharedGeometries.get(definition) === entry) {
          sharedGeometries.delete(definition);
          disposeGeometries(entry.geometries);
        }
      });
    };
  }, [definition, geometries]);
  return geometries;
}

/**
 * What a view needs to let a walker place new parts at the crosshair (T-065). The host (the
 * editor) owns placement: it plans the drop at the reported floor point, shows it as `preview`, and
 * applies it on `onPlace`.
 */
export interface WalkPlacing {
  /** The parts menu, in order. */
  parts: readonly { key: string; label: string }[];
  /** Label of the part being held, if any. */
  holding?: string;
  /** A part was chosen from the menu, or placing stopped (undefined). */
  onHold: (key: string | undefined) => void;
  /** The floor point under the crosshair while holding, or undefined. */
  onAimFloor: (point: Vector3Tuple | undefined) => void;
  /** Place the held part at the last reported point. */
  onPlace: () => void;
}

/** The parts menu opened with P while walking. */
function WalkPartsMenu({ parts, holding, onChoose, onClose }: { parts: WalkPlacing['parts']; holding?: string; onChoose: (key: string) => void; onClose: () => void }) {
  return <div role="dialog" aria-label="Place a part" style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(560px, calc(100% - 32px))',maxHeight:'70%',overflow:'auto',padding:12,borderRadius:6,background:'#0b1725f2',border:'1px solid #7fd6ff',color:'#e6f7ff',fontSize:13,boxShadow:'0 8px 30px #0008'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
      <b>Place a part</b>
      <span style={{opacity:0.75,fontSize:12}}>Pick one, then click to place it at the crosshair · Esc or P closes</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',gap:6}}>
      {parts.map(p=><button key={p.key} type="button" aria-pressed={holding===p.label} onClick={()=>onChoose(p.key)} style={{...walkButtonStyle(true),fontWeight:500,textAlign:'left'}}>{p.label}</button>)}
    </div>
    <div style={{marginTop:8,textAlign:'right'}}><button type="button" onClick={onClose} style={{...walkButtonStyle(true),fontWeight:500}}>Close</button></div>
  </div>;
}

const walkButtonStyle = (ready: boolean): React.CSSProperties => ({padding:'6px 14px',borderRadius:4,border:'1px solid #7fd6ff',background:ready?'#0f3a52':'transparent',color:ready?'#e6f7ff':'#7d93a6',fontSize:13,fontWeight:600,cursor:ready?'pointer':'not-allowed'});

/** Crosshair, position and keys while walking on the desktop. */
function WalkHud({ walker, onExit, picking, holding, canPlace }: { walker?: WalkerState; onExit: () => void; /** Names under the crosshair and selected, when the view can pick. */ picking?: { aim?: string; selected?: string }; /** Label of the part being placed. */ holding?: string; canPlace?: boolean }) {
  return <>
    <div aria-hidden style={{position:'absolute',top:'50%',left:'50%',width:6,height:6,margin:-3,borderRadius:3,background:holding?'#ffd166':picking?.aim?'#3ccf7e':'#e6f7ffcc',boxShadow:'0 0 0 1px #0b1725',pointerEvents:'none'}}/>
    {holding?<div role="status" aria-label="Aim" aria-live="polite" style={{position:'absolute',top:'calc(50% + 14px)',left:'50%',transform:'translateX(-50%)',padding:'3px 8px',borderRadius:4,background:'#0b1725cc',color:'#ffe9b0',fontSize:12,whiteSpace:'nowrap',pointerEvents:'none',textAlign:'center'}}>
      Placing <b>{holding}</b> · aim at the floor, click places · X or right-click stops · P changes the part
    </div>:picking&&<div role="status" aria-label="Aim" aria-live="polite" style={{position:'absolute',top:'calc(50% + 14px)',left:'50%',transform:'translateX(-50%)',padding:'3px 8px',borderRadius:4,background:'#0b1725cc',color:'#e6f7ff',fontSize:12,whiteSpace:'nowrap',pointerEvents:'none',textAlign:'center'}}>
      {picking.aim?<><b>{picking.aim}</b> · click selects{picking.selected&&picking.selected!==picking.aim?<> · C connects to {picking.selected}</>:''}</>:picking.selected?`Selected: ${picking.selected} · aim at a part, C connects`:'Aim at a part and click to select it'}
      {picking.selected&&<div style={{opacity:0.8,marginTop:2}}>{picking.selected}: R turns · Delete removes · PageUp/PageDown raise and lower · Ctrl+Z undoes</div>}
    </div>}
    <div role="status" aria-label="Walk status" aria-live="polite" style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',display:'flex',gap:12,alignItems:'center',padding:'6px 12px',borderRadius:4,background:'#0b1725e6',border:'1px solid #7fd6ff',color:'#e6f7ff',fontSize:12,whiteSpace:'nowrap'}}>
      <span>{walker?`Walking · x ${walker.x.toFixed(1)} m, z ${walker.z.toFixed(1)} m · eye ${walker.eye.toFixed(1)} m · heading ${walker.heading}°`:'Walking'}</span>
      <span style={{opacity:0.75}}>WASD or arrows move · Space up · Alt down · mouse looks · Shift faster{canPlace?' · P places a part':''} · Esc leaves</span>
      <button type="button" onClick={onExit} style={{...walkButtonStyle(true),padding:'2px 8px',fontSize:12}}>Leave walk</button>
    </div>
  </>;
}

/** Enter/exit the WebXR walkthrough. Disabled, with the reason, where the browser cannot open VR. */
function VrButton({ gl, presenting }: { gl: WebGLRenderer; presenting: boolean }) {
  const support = useVrSupport();
  const [error, setError] = useState<string>();
  const ready = support === 'yes';
  const click = () => {
    setError(undefined);
    if (presenting) { void gl.xr.getSession()?.end(); return; }
    enterVr(gl).catch((e: unknown) => setError(`Could not start VR: ${e instanceof Error ? e.message : String(e)}`));
  };
  const why = support === 'checking' ? 'Checking for a VR headset…' : 'VR needs a WebXR headset browser (such as Meta Quest) and an HTTPS page.';
  return <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
    <button type="button" aria-label={presenting ? 'Exit VR' : 'Enter VR'} disabled={!ready} title={ready ? undefined : why} onClick={click} style={walkButtonStyle(ready)}>
      {presenting ? 'Exit VR' : ready ? '🥽 Enter VR' : 'VR unavailable'}
    </button>
    {error&&<div role="alert" style={{padding:'4px 8px',borderRadius:4,background:'#3b0d12e6',color:'#ffd5d8',fontSize:12}}>{error}</div>}
  </div>;
}

/** The floor slab: its top sits just under y = 0 so the grid and underlay draw on it. Clicks pass through. */
function Floor({ scene }: { scene: ScadaScene }) {
  const registry = useRegistry();
  const slab = useMemo(() => floorSlab(scene, undefined, undefined, registry), [scene, registry]);
  return <mesh position={[slab.centre.x, -0.004 - FLOOR_THICKNESS / 2, slab.centre.z]} userData={{ role: 'floor' }} raycast={() => null}>
    <boxGeometry args={[slab.width, FLOOR_THICKNESS, slab.depth]}/>
    <meshStandardMaterial color="#3b4a59" roughness={0.95} metalness={0}/>
  </mesh>;
}

/** Longest side of the underlay texture, pixels. */
const UNDERLAY_TEXTURE = 2048;

/**
 * The scene's reference drawing on the ground (ADR-0012). The markup is sanitized again here and
 * drawn through an <img>, which never runs scripts or fetches anything, onto a canvas texture.
 */
function Underlay({ underlay }: { underlay: SceneUnderlay }) {
  const clean = useMemo(() => sanitizeSvg(underlay.svg), [underlay.svg]);
  const [texture, setTexture] = useState<CanvasTexture>();
  useEffect(() => {
    if (!clean.ok) return;
    const [, , w, h] = clean.svg.viewBox;
    const scale = UNDERLAY_TEXTURE / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const url = URL.createObjectURL(new Blob([clean.markup], { type: 'image/svg+xml' }));
    const image = new Image();
    let made: CanvasTexture | undefined;
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      made = new CanvasTexture(canvas);
      made.colorSpace = SRGBColorSpace;
      setTexture(made);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); made?.dispose(); setTexture(undefined); };
  }, [clean]);
  if (!clean.ok || !texture) return null;
  const [, , w, h] = clean.svg.viewBox;
  const depth = (underlay.width * h) / w;
  return <mesh position={[underlay.position.x, 0.002, underlay.position.z]} rotation={[-Math.PI / 2, 0, (underlay.rotation * Math.PI) / 180]} userData={{ role: 'underlay' }} raycast={() => null} renderOrder={-1}>
    <planeGeometry args={[underlay.width, depth]}/>
    <meshBasicMaterial map={texture} transparent opacity={underlay.opacity} depthWrite={false} toneMapped={false}/>
  </mesh>;
}

/** Detail by joint count, so very large plants stay fast: bolts, then hubs, faces and welds drop out. */
const MAX_JOINTS_WITH_BOLTS = 2000;
const MAX_JOINTS_WITH_DETAIL = 8000;
/** Geometry per joint part, shared by every viewer (a handful of shapes per size). */
const jointGeometries = new Map<string, BufferGeometry>();
const jointMatrix = new Matrix4();

/** Joint frames grouped into compact chunks by their position (median splits, ≤ 256 each). */
function chunkByPosition(matrices: number[][]): number[][][] {
  const out: number[][][] = [];
  const split = (items: number[][]) => {
    if (items.length <= 256) { if (items.length) out.push(items); return; }
    const extent = [12, 13, 14].map((i) => Math.max(...items.map((m) => m[i])) - Math.min(...items.map((m) => m[i])));
    const axis = [12, 13, 14][extent.indexOf(Math.max(...extent))];
    const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
    split(sorted.slice(0, sorted.length >> 1));
    split(sorted.slice(sorted.length >> 1));
  };
  split(matrices);
  return out;
}

/**
 * Joint hardware (ADR-0015): bolted ASME flange pairs, single flanges on free flanged ports and
 * butt-weld beads, one instanced mesh per part of each joint type and size. Display only.
 */
/** Power, signal and network connections as thin straight lines, coloured by domain (ADR-0023). Display only. */
function WireLayer({ scene }: { scene: ScadaScene }) {
  const registry = useRegistry();
  const segments = useMemo(() => wireSegments(scene, registry), [scene, registry]);
  return <>{segments.map((w) => <Line key={`wire:${w.connectionId}`} points={[w.from, w.to]} color={wireColors[w.domain]} lineWidth={2} userData={{ wireConnectionId: w.connectionId, domain: w.domain }}/>)}</>;
}

function JointHardware({ scene, routes }: { scene: ScadaScene; routes: readonly PipeRoute[] }) {
  const registry = useRegistry();
  const groups = useMemo(() => {
    const placements = jointPlacements(scene, routes, registry);
    const bolts = placements.length <= MAX_JOINTS_WITH_BOLTS;
    const detail = placements.length <= MAX_JOINTS_WITH_DETAIL;
    const byKind = new Map<string, JointPlacement[]>();
    for (const p of placements) byKind.set(`${p.style}:${p.size}`, [...(byKind.get(`${p.style}:${p.size}`) ?? []), p]);
    return [...byKind].flatMap(([kind, list]) => {
      const { style, size } = list[0];
      const parts = style === 'pair' ? flangePairParts(size) : style === 'single' ? flangeParts(size) : weldParts(size);
      return parts.flatMap((part, i) => {
        if (part.role === 'bolt' && !bolts) return [];
        // Above the detail limit only the flange rings remain (the widest flange part of each side).
        if (!detail && (part.role === 'weld' || part.shape !== 'cylinder' || i % 3 !== 1)) return [];
        const key = `${kind}:${i}`;
        let geometry = jointGeometries.get(key);
        if (!geometry) jointGeometries.set(key, (geometry = createJointPartGeometry(part)));
        // Spatial chunks so off-screen hardware is culled, as for instanced equipment.
        return chunkByPosition(list.map((p) => p.matrix)).map((matrices, c) => ({ key: `${key}:${c}`, geometry: geometry!, role: part.role, matrices }));
      });
    });
  }, [scene, routes]);
  return <>{groups.map((g) => <JointMesh key={`${g.key}:${g.matrices.length}`} geometry={g.geometry} role={g.role} matrices={g.matrices}/>)}</>;
}

function JointMesh({ geometry, role, matrices }: { geometry: BufferGeometry; role: string; matrices: number[][] }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    matrices.forEach((e, i) => m.setMatrixAt(i, jointMatrix.fromArray(e)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  const color = role === 'bolt' ? '#4f5a64' : role === 'weld' ? '#6c7883' : '#8c9cab';
  return <instancedMesh ref={mesh} args={[geometry, undefined, matrices.length]} userData={{ role, joint: true }} raycast={() => null}>
    <meshStandardMaterial color={color} metalness={0.7} roughness={role === 'weld' ? 0.7 : 0.4}/>
  </instancedMesh>;
}

const PORT_MARKER_RADIUS = 0.05;
// Port markers are 5 cm dots: a coarse sphere looks the same and keeps 2,000 of them cheap.
const portMarkerGeometry = new SphereGeometry(1, 8, 6);
const beadGeometry = new SphereGeometry(1, 12, 8);
const instanceMatrix = new Matrix4();

/**
 * Yellow markers on free ports (connected ones sit inside a joint), all in one instanced draw.
 * Clicks pass through to the equipment.
 */
function PortMarkers({ scene }: { scene: ScadaScene }) {
  const registry = useRegistry();
  const positions = useMemo(() => {
    const used = new Set(scene.connections.flatMap((c) => [`${c.from.instanceId}\u0000${c.from.portId}`, `${c.to.instanceId}\u0000${c.to.portId}`]));
    return scene.components.flatMap((c) => (registry.resolvers.resolvePorts(c.type, c.properties) ?? []).filter((p) => !used.has(`${c.id}\u0000${p.id}`)).map((p) => portToWorld(c, p).position));
  }, [scene]);
  const mesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    positions.forEach((p, i) => m.setMatrixAt(i, instanceMatrix.makeScale(PORT_MARKER_RADIUS, PORT_MARKER_RADIUS, PORT_MARKER_RADIUS).setPosition(p[0], p[1], p[2])));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [positions]);
  if (positions.length === 0) return null;
  return <instancedMesh key={positions.length} ref={mesh} args={[portMarkerGeometry, undefined, positions.length]} userData={{ role: 'port-markers' }} raycast={() => null}>
    <meshBasicMaterial color="#ffd166"/>
  </instancedMesh>;
}



/**
 * Flow along one routed pipe: beads slightly wider than the pipe that travel from→to or to→from,
 * sit still when stopped, or a dashed overlay when the flow is unknown. Motion uses frame delta.
 */
/** Sampled centreline per route object: routes change only with the scene, flow states every second. */
const centerlines = new WeakMap<object, { centerline: Vector3Tuple[]; lengths: number[]; total: number }>();
function centerlineOf(route: Extract<PipeRoute, { status: 'ok' }>) {
  let entry = centerlines.get(route);
  if (!entry) {
    const centerline = sampleRouteCenterline(route);
    const lengths = pathLengths(centerline);
    centerlines.set(route, (entry = { centerline, lengths, total: lengths[lengths.length - 1] }));
  }
  return entry;
}

type Run = { id: string; centerline: Vector3Tuple[]; lengths: number[]; total: number; count: number; scale: number; sign: number };

/**
 * Flow beads for every route in as few draws as possible: one instanced mesh per colour/opacity,
 * updated in place each frame without allocating. Unknown states get a dashed line per route.
 */
function FlowLayer({ routes, stateById, radiusOf }: { routes: readonly PipeRoute[]; stateById: ReadonlyMap<string, FlowState>; radiusOf: (connectionId: string) => number }) {
  const { groups, dashed } = useMemo(() => {
    const groups = new Map<string, { color: string; opacity: number; runs: Run[]; instances: number }>();
    const dashed: { id: string; points: Vector3Tuple[]; color: string; opacity: number }[] = [];
    for (const route of routes) {
      const state = route.status === 'ok' ? stateById.get(route.connectionId) : undefined;
      if (route.status !== 'ok' || !state) continue;
      const { centerline, lengths, total } = centerlineOf(route);
      if (!(total > 0)) continue;
      const look = flowAppearance(state);
      if (look.dashed) { dashed.push({ id: route.connectionId, points: centerline, color: look.color, opacity: look.opacity }); continue; }
      const key = `${look.color}:${look.opacity}`;
      const group = groups.get(key) ?? { color: look.color, opacity: look.opacity, runs: [], instances: 0 };
      const count = Math.max(1, Math.floor(total / FLOW_MARKER_SPACING + 1e-9));
      group.runs.push({ id: route.connectionId, centerline, lengths, total, count, scale: radiusOf(route.connectionId) * 1.25, sign: look.motion === 'forward' ? 1 : look.motion === 'reverse' ? -1 : 0 });
      group.instances += count;
      groups.set(key, group);
    }
    return { groups: [...groups.entries()], dashed };
  }, [routes, stateById, radiusOf]);
  // Distance travelled per route, kept across re-renders so beads do not jump when the scene changes.
  const travelledByRoute = useRef(new Map<string, number>()).current;
  return <>
    {groups.map(([key, group]) => <FlowBeads key={`${key}:${group.instances}`} color={group.color} opacity={group.opacity} runs={group.runs} instances={group.instances} travelledByRoute={travelledByRoute}/>)}
    {/* Drawn over the pipe (no depth test) so missing or untrusted data is never hidden by geometry. */}
    {dashed.map(d => <Line key={d.id} points={d.points} color={d.color} dashed dashSize={0.15} gapSize={0.1} lineWidth={3} transparent opacity={d.opacity} depthTest={false} renderOrder={10}/>)}
  </>;
}

const beadPoint: Vector3Tuple = [0, 0, 0];

function FlowBeads({ color, opacity, runs, instances, travelledByRoute }: { color: string; opacity: number; runs: Run[]; instances: number; /** Per viewer, so two viewers of one scene do not double the speed. */ travelledByRoute: Map<string, number> }) {
  const mesh = useRef<InstancedMesh>(null);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    let k = 0;
    for (const run of runs) {
      const travelled = ((travelledByRoute.get(run.id) ?? 0) + run.sign * FLOW_MARKER_SPEED * delta) % run.total;
      travelledByRoute.set(run.id, travelled);
      const step = run.total / run.count;
      for (let i = 0; i < run.count; i++) {
        let d = (i * step + travelled) % run.total;
        if (d < 0) d += run.total;
        pointAtInto(run.centerline, run.lengths, d, beadPoint);
        m.setMatrixAt(k++, instanceMatrix.makeScale(run.scale, run.scale, run.scale).setPosition(beadPoint[0], beadPoint[1], beadPoint[2]));
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[beadGeometry, undefined, instances]} frustumCulled={false} userData={{ role: 'flow-markers' }}>
    <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity}/>
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

/**
 * Simulated state from a host-run simulator (e.g. `@sakibcoolz/simulation`, ADR-0010). While it is
 * set, tank levels and connection flows come only from here, never mixed with telemetry or `flow`.
 */
export interface SimulationInput {
  /** Tank level per component id, percent. */
  levels?: Readonly<Record<string, number>>;
  /** Readings per connection; drawn as SIMULATED whatever their own `source` says. */
  flows?: readonly FlowReading[];
  model?: { name: string; version: number };
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
  /**
   * Editor only: replaces the scene's 2D layouts (ADR-0026) as one undo step, e.g. after a symbol
   * was dragged in a 2D view. Returns false when editing is locked or on a viewer.
   */
  setViews?(views: SceneViews | undefined): boolean;
}

/**
 * Combines directly passed observations, a provider subscription and values pushed through the
 * handle into one telemetry input. Telemetry is active when the prop is given or values were pushed.
 */
function useTelemetryFeed(telemetry: TelemetryInput | undefined, ref: React.Ref<ScadaHandle> | undefined, extra?: Omit<ScadaHandle, 'setTagValues'>): TelemetryInput | undefined {
  const [store] = useState(() => createObservationStore());
  const provider = telemetry?.provider;
  useEffect(() => (provider ? connectProvider(store, provider) : undefined), [store, provider]);
  useImperativeHandle(ref, () => ({ setTagValues: (observations) => void store.set(observations), ...extra }), [store, extra]);
  const fed = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useMemo(() => {
    if (!telemetry && fed.length === 0) return undefined;
    const { provider: _, ...rest } = telemetry ?? {};
    return { ...rest, observations: [...(telemetry?.observations ?? []), ...fed] };
  }, [telemetry, fed]);
}


/** Resolves telemetry against a clock refreshed every second, so values age into STALE. */
function useTelemetry(scene: ScadaScene, telemetry: TelemetryInput | undefined, now: number, registry: ComponentRegistry) {
  return useMemo(
    () => (telemetry ? resolveTelemetry(scene, telemetry.observations ?? [], { now, source: telemetry.source, staleAfterMs: telemetry.staleAfterMs, resolveBindable: registry.resolvers.resolveBindable }) : undefined),
    [scene, telemetry, now, registry],
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
  const registry = useRegistry();
  const candidate = plan.snap.ok ? plan.snap.candidate : plan.snap.nearest;
  const owner = candidate && scene.components.find((c) => c.id === candidate.target.instanceId);
  const port = owner && registry.definitionFor(owner.type, owner.properties).ports.find((p) => p.id === candidate.target.portId);
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

function ViewerBody({scene,viewMode='normal',viewOverrides,onSelect,selectedId,preview,onCamera,transformMode,onTransform,flow,telemetry:telemetryInput,simulation,collisions=true,openJoints=true,instancing='auto',joints=true,floor=false,walkthrough=false,walkPlacing,registry=builtInRegistry,ref}: {scene:ScadaScene;viewMode?:ViewMode;viewOverrides?:Readonly<Record<string,ViewMode>>;/** Clicked component; `additive` is true when Shift was held (the editor attaches). */onSelect?:SelectHandler;selectedId?:string;preview?:DropPlan;onCamera?:(camera:Camera)=>void;transformMode?:TransformMode;onTransform?:TransformHandler;flow?:FlowInput;telemetry?:TelemetryInput;/** Simulated levels and flows; replaces telemetry and `flow` for those values while set. */simulation?:SimulationInput;/** Highlight overlapping solid components in red. Default true. */collisions?:boolean;/** Mark and list connections whose ports do not meet, in amber. Default true. */openJoints?:boolean;/** Draw plain equipment instanced: 'auto' (default) from 100 components, 'off' or 'always'. */instancing?:InstancingMode;/** Draw flanges, bolts and weld beads at joints (ADR-0015). Default true. */joints?:boolean;/** Draw a concrete floor slab under the equipment. Display only. Default false. */floor?:boolean;/** Offer a first-person walkthrough: Walk on the desktop (mouse look, WASD) and Enter VR on a WebXR headset. View only. Default false. */walkthrough?:boolean;/** Placing new parts at the Walk crosshair (T-065); the editor supplies it. */walkPlacing?:WalkPlacing;/** Component types to draw and edit (ADR-0022): `createComponentRegistry(...)` adds host types. Built-in kinds by default. */registry?:ComponentRegistry;ref?:React.Ref<ScadaHandle>}) {
  const telemetry = useTelemetryFeed(telemetryInput, ref);
  const collision = useMemo(() => (collisions ? findCollisions(scene, { resolveBounds: registry.resolvers.resolveBounds }) : undefined), [scene, collisions, registry]);
  const previewCollides = useMemo(() => !!(collisions && preview && collidingWith({ ...scene, components: [...scene.components, preview.component] }, preview.component.id, registry).length), [scene, preview, collisions, registry]);
  const names = useMemo(() => componentNames(scene, registry), [scene, registry]);
  const routes = useMemo(() => routeScene(scene, registry.resolvers), [scene, registry]);
  const routeMaterial = useRouteMaterial(viewMode);
  // Pipe radius per connection, indexed once per scene (a search per route would be quadratic).
  const radiusOf = useMemo(() => {
    const components = new Map(scene.components.map((c) => [c.id, c]));
    const radii = new Map(scene.connections.map((c) => {
      const component = components.get(c.from.instanceId);
      const port = component && registry.resolvers.resolvePorts(component.type, component.properties)?.find((p) => p.id === c.from.portId);
      return [c.id, port ? portRadius(port) : pipeOuterRadius] as const;
    }));
    return (id: string) => radii.get(id) ?? pipeOuterRadius;
  }, [scene]);
  const open = useMemo(() => (openJoints ? findOpenJoints(scene, { ...registry.resolvers, routes }) : []), [scene, routes, openJoints]);
  const now = useNow(1000);
  const live = useTelemetry(scene, telemetry, now, registry);
  // What is drawn: live values over authored ones; never saved.
  const shown = useMemo(() => {
    // Simulated levels replace measured ones; the two are never mixed (ADR-0010).
    const simulatedLevel = (p: PropertyState) => simulation?.levels !== undefined && p.property === 'level' && Object.hasOwn(simulation.levels, p.instanceId);
    const measured = live ? displayScene(scene, live.properties.filter((p) => !simulatedLevel(p))) : scene;
    const levels = simulation?.levels;
    if (!levels) return measured;
    return { ...measured, components: measured.components.map((c) => (registry.definitionFor(c.type).bindable?.level !== undefined && Object.hasOwn(levels, c.id) ? { ...c, properties: { ...c.properties, level: levels[c.id] } } : c)) };
  }, [scene, live, simulation?.levels]);
  // Keyed on content: telemetry re-resolves every second, but untrusted properties rarely change,
  // and a new map would make every instanced part rebuild its matrices.
  const unknownKey = (live?.properties ?? []).filter((p) => p.status === 'unknown').map((p) => `${p.instanceId}\u0000${p.property}`).join('\u0001');
  const unknownByComponent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of unknownKey ? unknownKey.split('\u0001') : []) {
      const [id, property] = entry.split('\u0000');
      map.set(id, new Set([...(map.get(id) ?? []), property]));
    }
    return map;
  }, [unknownKey]);
  const hasFlowBindings = scene.tagBindings?.some((b) => b.kind === 'flow') ?? false;
  // Power, signal and network wires carry no process flow (ADR-0023): they get no flow state.
  const wired = useMemo(() => new Set(wireSegments(scene, registry).map((w) => w.connectionId)), [scene, registry]);
  const flowStates = useMemo(() => {
    const piped = (states: FlowState[]) => states.filter((s) => !wired.has(s.connectionId));
    if (simulation?.flows) {
      const readings = simulation.flows.map((r) => ({ ...r, source: 'SIMULATED' as const }));
      return piped(resolveFlow(scene, readings, { now, source: 'SIMULATED' }).states);
    }
    if (!flow && !(live && hasFlowBindings)) return undefined;
    // One source per view: explicit readings and tag-derived readings use the same source filter.
    const readings = [...(flow?.readings ?? []), ...(live?.flowReadings ?? [])];
    return piped(resolveFlow(scene, readings, { now, source: flow?.source ?? telemetry?.source, staleAfterMs: flow?.staleAfterMs ?? telemetry?.staleAfterMs }).states);
  }, [scene, flow, live, hasFlowBindings, now, telemetry, simulation?.flows, wired]);
  const stateById = useMemo(() => new Map(flowStates?.map((s) => [s.connectionId, s])), [flowStates]);
  const showHeatLegend = shown.components.some((c) => heatColor(c.properties.temperature) !== undefined);
  const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
  // Plain equipment of large scenes is instanced; selected, colliding and non-normal views keep their own meshes.
  const instanced = useMemo(() => {
    const on = instancing === 'always' || (instancing === 'auto' && shown.components.length >= INSTANCING_THRESHOLD);
    // Lathe, cut and basin liquids are rebuilt or scaled per level, so those vessels keep their own meshes.
    return on ? shown.components.filter((c) => c.id !== selectedId && !collision?.collidingIds.has(c.id) && effectiveViewMode(viewMode, viewOverrides?.[c.id]) === 'normal' && !registry.definitionFor(c.type, c.properties).parts.some((p) => p.shape === 'lathe' || (p.role === 'liquid' && p.shape !== 'cylinder'))) : [];
  }, [instancing, shown, selectedId, collision, viewMode, viewOverrides]);
  const instancedIds = useMemo(() => new Set(instanced.map((c) => c.id)), [instanced]);
  const gesture = useRef(0);
  const descriptionId = useId();
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const [gl, setGl] = useState<WebGLRenderer>();
  const presenting = useXrPresenting(gl);
  const [walker, setWalker] = useState<WalkerState>();
  const [walking, setWalking] = useState(false);
  const [aim, setAim] = useState<string>();
  const [partsMenu, setPartsMenu] = useState(false);
  const partsMenuOpen = useRef(false);
  const placing = useRef(walkPlacing);
  placing.current = walkPlacing;
  const setMenu = (open: boolean, relock: boolean) => {
    partsMenuOpen.current = open;
    setPartsMenu(open);
    if (open) { if (document.pointerLockElement) document.exitPointerLock(); return; }
    if (relock && gl) { try { void Promise.resolve(gl.domElement.requestPointerLock()).catch(() => undefined); } catch { /* drag to look instead */ } }
  };
  useEffect(() => { if (!walkthrough || presenting) setWalking(false); }, [walkthrough, presenting]);
  useEffect(() => {
    if (walking) return;
    setWalker(undefined);
    setAim(undefined);
    partsMenuOpen.current = false;
    setPartsMenu(false);
    if (placing.current?.holding) placing.current.onHold(undefined);
  }, [walking]);
  const walkPlace: WalkPlaceInput | undefined = walkPlacing && {
    menuOpen: partsMenuOpen,
    placing: !!walkPlacing.holding,
    onToggleMenu: () => setMenu(!partsMenuOpen.current, true),
    onStop: () => walkPlacing.onHold(undefined),
    onPlace: walkPlacing.onPlace,
    onAimFloor: walkPlacing.onAimFloor,
  };
  const firstPerson = presenting || walking;
  return <div role="region" aria-label="3D scene view" aria-describedby={descriptionId} style={{position:'relative',width:'100%',height:'100%'}}>
  <p id={descriptionId} style={visuallyHidden}>{count(scene.components.length, 'component')}, {count(scene.connections.length, 'connection')}.</p>
  <Canvas camera={{position:[7,6,9],fov:50}} onCreated={({gl})=>{gl.localClippingEnabled=true;setGl(gl);}} style={{background:'#101d2d',width:'100%',height:'100%'}}>
    <ambientLight intensity={1.4}/><directionalLight position={[5,10,8]} intensity={2}/>
    {presenting&&<color attach="background" args={['#101d2d']}/>}
    {(floor||firstPerson)&&<Floor scene={scene}/>}
    {walkthrough&&<XrWalk scene={scene} onPick={onSelect?(id,connect)=>onSelect(id,{additive:connect}):undefined}/>}
    {walking&&<DesktopWalk scene={scene} onExit={()=>setWalking(false)} onMove={setWalker} onPick={onSelect?(id,connect)=>onSelect(id,{additive:connect}):undefined} onAim={onSelect?setAim:undefined} place={walkPlace}/>}
    <Grid infiniteGrid fadeDistance={35} sectionColor="#50718b" cellColor="#263e52"/>
    {scene.underlay&&<Underlay underlay={scene.underlay}/>}
    {instanced.length>0&&<InstancedEquipment components={instanced} unknown={unknownByComponent} onSelect={onSelect}/>}
    {shown.components.filter(c=>!instancedIds.has(c.id)).map(c=><Equipment key={c.id} component={c} unknown={unknownByComponent.get(c.id)} colliding={collision?.collidingIds.has(c.id)} viewMode={effectiveViewMode(viewMode,viewOverrides?.[c.id])} selected={selectedId===c.id} onSelect={additive=>onSelect?.(c.id,{additive})} objectRef={selectedId===c.id?setSelectedObject:undefined}/>)}
    {!firstPerson && onTransform && transformMode && selectedId && selectedObject && <GizmoControls object={selectedObject} mode={transformMode} rotationSnap={ROTATION_SNAP} translationSnap={TRANSLATION_SNAP}
      onMouseDown={()=>{gesture.current++;}}
      onObjectChange={()=>{const {position:p,quaternion:q}=selectedObject;onTransform(selectedId,{x:p.x,y:p.y,z:p.z},{x:q.x,y:q.y,z:q.z,w:q.w},`transform:${selectedId}:${gesture.current}`);}}/>}
    {routes.map(route=><RoutePipe key={route.connectionId} route={route} material={routeMaterial} radius={radiusOf(route.connectionId)}/>)}
    <WireLayer scene={shown}/>
    <PortMarkers scene={shown}/>
    {joints&&<JointHardware scene={shown} routes={routes}/>}
    {open.map(o=><OpenJointMarkers key={`open:${o.connectionId}`} scene={scene} open={o}/>)}
    {flowStates && <FlowLayer routes={routes} stateById={stateById} radiusOf={radiusOf}/>}
    {preview && <DropPreview scene={scene} plan={preview} colliding={previewCollides}/>}
    {onCamera && <CameraBridge onCamera={onCamera}/>}
    <OrbitControls makeDefault/>{!firstPerson&&<GizmoHelper alignment="bottom-right" margin={[70,70]}><GizmoViewport/></GizmoHelper>}
  </Canvas>
  {walkthrough&&gl&&!walking&&<div style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',display:'flex',gap:8,alignItems:'flex-start'}}>
    <button type="button" aria-label="Walk" onClick={()=>setWalking(true)} style={walkButtonStyle(true)}>🚶 Walk</button>
    <VrButton gl={gl} presenting={presenting}/>
  </div>}
  {walking&&<WalkHud walker={walker} onExit={()=>setWalking(false)} picking={onSelect?{aim:aim&&names.get(aim),selected:selectedId&&names.get(selectedId)}:undefined} holding={walkPlacing?.holding} canPlace={!!walkPlacing}/>}
  {walking&&walkPlacing&&partsMenu&&<WalkPartsMenu parts={walkPlacing.parts} holding={walkPlacing.holding} onChoose={key=>{walkPlacing.onHold(key);setMenu(false,true);}} onClose={()=>setMenu(false,true)}/>}
  {simulation?<div aria-label="Simulation badge" style={{position:'absolute',top:10,right:12,padding:'4px 10px',borderRadius:4,background:'#b58cff',color:'#10051f',fontWeight:700,fontSize:12,letterSpacing:1,pointerEvents:'none'}}>SIMULATED{simulation.model?` · ${simulation.model.name} v${simulation.model.version}`:''}</div>
    :(flow?.source??telemetry?.source)==='SIMULATED'&&<div style={{position:'absolute',top:10,right:12,padding:'4px 10px',borderRadius:4,background:'#b58cff',color:'#10051f',fontWeight:700,fontSize:12,letterSpacing:1,pointerEvents:'none'}}>SIMULATED FLOW</div>}
  {((collision&&collision.pairs.length>0)||open.length>0)&&<div style={{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',display:'flex',flexDirection:'column',gap:4,alignItems:'center',pointerEvents:'none'}}>
    {collision&&collision.pairs.length>0&&<CollisionList pairs={collision.pairs} names={names} order={scene.components.map(c=>c.id)}/>}
    {open.length>0&&<OpenJointList open={open} names={names}/>}
  </div>}
  {showHeatLegend&&<div style={{position:'absolute',top:simulation||(flow?.source??telemetry?.source)==='SIMULATED'?44:10,right:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>
    <div style={{height:8,borderRadius:2,marginBottom:4,background:`linear-gradient(90deg, ${heatColor(HEAT_RANGE_C.min)}, ${heatColor(HEAT_RANGE_C.max)})`}}/>
    Temperature tint {HEAT_RANGE_C.min}–{HEAT_RANGE_C.max} °C (display only, not simulated)
  </div>}
  {live&&live.properties.length>0&&<div aria-label="Telemetry summary" aria-live="polite" style={{position:'absolute',bottom:flowStates?36:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeTelemetry(live.properties)}</div>}
  {flowStates&&<div aria-label="Flow summary" aria-live="polite" style={{position:'absolute',bottom:10,left:12,padding:'4px 8px',borderRadius:4,background:'#0b1725cc',color:'#ebf2fa',fontSize:12,pointerEvents:'none'}}>{summarizeFlow(flowStates)}</div>}
  </div>;
}

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
function CommitField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="s3-stack" style={{fontSize:12}}>{label} <input aria-label={label} value={draft} placeholder="tag id"
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
function collidingWith(scene: ScadaScene, id: string, registry: ComponentRegistry): string[] {
  return findCollisions(scene, { resolveBounds: registry.resolvers.resolveBounds }).pairs.flatMap((p) => (p.a === id ? [p.b] : p.b === id ? [p.a] : []));
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
  return <div aria-label="Collisions" aria-live="polite" style={{padding:'4px 10px',borderRadius:4,background:'#3b0d12e6',color:'#ffd5d8',border:`1px solid ${COLLISION_COLOR}`,fontSize:12,pointerEvents:'none',whiteSpace:'pre-line'}}>{shown.join('\n')}</div>;
}

const OPEN_JOINT_COLOR = '#ffb020';

/** Overlay listing connections whose ports do not meet (at most five lines). */
function OpenJointList({ open, names }: { open: readonly OpenJoint[]; names: Map<string, string> }) {
  return <div aria-label="Open joints" aria-live="polite" style={{padding:'4px 10px',borderRadius:4,background:'#2e2108e6',color:'#ffe3b0',border:`1px solid ${OPEN_JOINT_COLOR}`,fontSize:12,pointerEvents:'none',whiteSpace:'pre-line'}}>{describeOpenJoints(open, names).join('\n')}</div>;
}

/** Amber rings at both ends of an open joint, a little wider than the pipe so a small gap shows. */
function OpenJointMarkers({ scene, open }: { scene: ScadaScene; open: OpenJoint }) {
  const registry = useRegistry();
  const ends = [open.from, open.to].flatMap((e) => {
    const c = scene.components.find((x) => x.id === e.instanceId);
    const port = c && registry.resolvers.resolvePorts(c.type, c.properties)?.find((p) => p.id === e.portId);
    return c && port ? [{ at: portToWorld(c, port).position, radius: portRadius(port) }] : [];
  });
  return <>{ends.map(({ at, radius }, i) => <mesh key={i} position={at} userData={{ componentId: open.connectionId, role: 'open-joint' }}><sphereGeometry args={[radius * 1.35, 16, 12]}/><meshBasicMaterial color={OPEN_JOINT_COLOR} transparent opacity={0.7} depthWrite={false}/></mesh>)}</>;
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
        {section('Ports',<PortsInspector rows={describePorts(scene,component.id,registry)} onGo={setSelected}/>)}
        {section('Related',<RelationsExplorer relations={describeRelations(scene,component.id,registry)} onGo={setSelected}/>)}
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

/**
 * Read-only or interactive 3D view of a scene. Every prop is optional except `scene`; `registry`
 * (ADR-0022) supplies host component types alongside the built-in kinds.
 */
export function Scada3DViewer(props: Parameters<typeof ViewerBody>[0]) {
  return <RegistryContext.Provider value={props.registry ?? builtInRegistry}><ViewerBody {...props}/></RegistryContext.Provider>;
}

/** The full editor: palette, canvas, properties, undo/redo, import/export. `registry` as for the viewer. */
export function Scada3DEditor(props: Parameters<typeof EditorBody>[0]) {
  return <RegistryContext.Provider value={props.registry ?? builtInRegistry}><EditorBody {...props}/></RegistryContext.Provider>;
}

// One document, several views (ADR-0026).
export { ScadaWorkspace } from './workspace.js';
export type { ScadaWorkspaceProps, WorkspaceLayout } from './workspace.js';
