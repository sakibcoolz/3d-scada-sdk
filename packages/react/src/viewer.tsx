// The 3D viewer and what it shares with the editor: equipment, pipes, joints, flow and telemetry layers,
// collision and open-joint display, Walk and VR. It never imports the editor, so `ScadaRuntime` can be
// built without any editing code path (ADR-0028).
import React, { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasTexture, Color, DoubleSide, LatheGeometry, Vector2, Matrix4, MeshStandardMaterial, Plane, Quaternion, SphereGeometry, SRGBColorSpace, Vector3, type BufferGeometry, type Camera, type WebGLRenderer, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls, Grid, GizmoHelper, GizmoViewport, Line, TransformControls } from '@react-three/drei';
import { connectProvider, findOpenJoints, type OpenJoint, findCollisions, createObservationStore, displayScene, type DataProvider, portToWorld, resolveFlow, resolveTelemetry, type Observation, type PropertyState, routeScene, sampleRouteCenterline, type FlowReading, type FlowState, type ValueSource, type ComponentInstance, type ConnectionPort, type PipeRoute, type SceneUnderlay, type QuaternionLike, type Vector3Like, type ScadaScene, type SceneViews, type Vector3Tuple } from '@sakibcoolz/core';
import { builtInRegistry, flangePairParts, flangeParts, liquidProfile, weldParts, outerRadiusFor, pipeOuterRadius, sizeOfPort, type ComponentRegistry, type GeometryPart, type IndustrialComponentDefinition } from '@sakibcoolz/components';
import { RegistryContext, useRegistry } from './registryContext.js';
import { createEquipmentGeometries, createJointPartGeometry, createRouteGeometry, disposeGeometries } from './geometry.js';
import type { DropPlan } from './drop.js';
import { usePlateTexture } from './plateText.js';
import { cutBelow } from './liquidCut.js';
import { spatialChunks } from './instancing.js';
import { jointPlacements, type JointPlacement } from './jointLayer.js';
import { wireColors, wireSegments } from './wires.js';
import { sanitizeSvg } from '@sakibcoolz/asset-import';
import { componentNames, describeOpenJoints } from './connectionNotice.js';
import { summarizeTelemetry } from './telemetryView.js';
import { effectiveViewMode, heatColor, HEAT_RANGE_C, liquidFill, shellLook, type ViewMode } from './appearance.js';
import { FLOW_MARKER_SPACING, FLOW_MARKER_SPEED, flowAppearance, pathLengths, pointAtInto, summarizeFlow } from './flowVisual.js';
import { FLOOR_THICKNESS, floorSlab } from './floor.js';
import { enterVr, useVrSupport, useXrPresenting, XrWalk } from './xrWalk.js';
import { DesktopWalk, type WalkerState, type WalkPlaceInput } from './walkMode.js';

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
export function Underlay({ underlay }: { underlay: SceneUnderlay }) {
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
export function useNow(intervalMs: number): number {
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
export function useTelemetryFeed(telemetry: TelemetryInput | undefined, ref: React.Ref<ScadaHandle> | undefined, extra?: Omit<ScadaHandle, 'setTagValues'>): TelemetryInput | undefined {
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
export function useTelemetry(scene: ScadaScene, telemetry: TelemetryInput | undefined, now: number, registry: ComponentRegistry) {
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

/** Display names such as "Ball Valve 2": catalog label plus a per-type counter in scene order. */
/** Ids of the components that `id` overlaps. */
export function collidingWith(scene: ScadaScene, id: string, registry: ComponentRegistry): string[] {
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

/**
 * Read-only or interactive 3D view of a scene. Every prop is optional except `scene`; `registry`
 * (ADR-0022) supplies host component types alongside the built-in kinds.
 */
export function Scada3DViewer(props: Parameters<typeof ViewerBody>[0]) {
  return <RegistryContext.Provider value={props.registry ?? builtInRegistry}><ViewerBody {...props}/></RegistryContext.Provider>;
}
