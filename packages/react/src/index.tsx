import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DoubleSide, type Camera } from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Line } from '@react-three/drei';
import { createEmptyScene, portToWorld, removeComponent, routeScene, type ComponentInstance, type ComponentKind, type PipeRoute, type ScadaScene, type Vector3Tuple } from '@scada3d/core';
import { componentCatalog, pipeOuterRadius } from '@scada3d/components';
import { createEquipmentGeometries, createRouteGeometries, disposeGeometries } from './geometry';
import { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop';

export { applyDrop, describeDrop, dropPosition, planDrop, screenToPlane, type DropPlan } from './drop';

function Equipment({ component, glass, selected, onSelect }: { component:ComponentInstance; glass:boolean; selected:boolean; onSelect:()=>void }) {
  const definition = componentCatalog[component.type];
  const geometries = useMemo(() => createEquipmentGeometries(definition), [definition]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  const level = Math.max(0, Math.min(100, Number(component.properties.level ?? 45))) / 100;
  const flowing = component.properties.flowing === true;
  const open = component.properties.open !== false;
  // Materials are keyed on glass mode so toggling recreates them: Three.js only recompiles the
  // opaque/transparent shader variant when a material is new or flagged needsUpdate.
  const shellProps = {color:selected?'#63b3ed':'#7b9eb6',metalness:glass?0:0.65,roughness:0.35,transparent:glass,opacity:glass?0.21:1,depthWrite:!glass,side:DoubleSide};
  return <group position={component.position} quaternion={component.rotation} scale={component.scale} onClick={e=>{e.stopPropagation();onSelect();}}>
    {definition.parts.map((part, i) => {
      const geometry = geometries[i];
      if (part.role === 'liquid' && part.shape === 'cylinder') {
        // Scale the liquid column from its bottom face so the surface tracks level.
        const height = Math.max(0.001, level);
        const bottom = part.center[1] - part.length / 2;
        return <mesh key={i} geometry={geometry} scale={[1, height, 1]} position={[0, bottom * (1 - height), 0]}><meshStandardMaterial color="#2a9dce" transparent opacity={0.65} depthWrite={false}/></mesh>;
      }
      if (part.role === 'valve-ball') return <mesh key={i} geometry={geometry}><meshStandardMaterial color={open?'#48b983':'#e76e75'}/></mesh>;
      if (part.role === 'valve-handle') return <mesh key={i} geometry={geometry} rotation={[0, open ? 0 : Math.PI / 2, 0]}><meshStandardMaterial color="#e3d5a5"/></mesh>;
      return <mesh key={i} geometry={geometry}><meshStandardMaterial key={glass ? 'glass' : 'solid'} {...shellProps}/></mesh>;
    })}
    {flowing && (component.type==='pipe'||component.type==='tee') && <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[pipeOuterRadius*0.5,pipeOuterRadius*0.5,1.9,16]}/><meshStandardMaterial color="#30caff" emissive="#137eaa" emissiveIntensity={.4}/></mesh>}
    {definition.ports.map(port=><mesh key={port.id} position={port.position}><sphereGeometry args={[.05,10,10]}/><meshBasicMaterial color="#ffd166"/></mesh>)}
  </group>;
}

function RoutePipe({ route, glass }: { route: PipeRoute; glass: boolean }) {
  // Rebuild geometry only when the routed centreline changes, not on every scene update.
  const shape = route.status === 'ok' ? route.points.flat().join(',') : '';
  const geometries = useMemo(() => (route.status === 'ok' ? createRouteGeometries(route, pipeOuterRadius) : []), [shape]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  if (route.status !== 'ok') {
    // Invalid route: dashed red line between the ports so the problem is visible, no pipe drawn.
    return 'from' in route ? <Line points={[route.from, route.to]} color="#e76e75" dashed dashSize={0.15} gapSize={0.1} lineWidth={2}/> : null;
  }
  return <>{geometries.map((geometry, i) => <mesh key={i} geometry={geometry}><meshStandardMaterial key={glass ? 'glass' : 'solid'} color="#8fa9bc" metalness={glass?0:0.6} roughness={0.35} transparent={glass} opacity={glass?0.21:1} depthWrite={!glass}/></mesh>)}</>;
}

const resolvePorts = (type: ComponentKind) => componentCatalog[type].ports;

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
    <Equipment component={plan.component} glass selected onSelect={() => {}}/>
    {marker && <mesh position={marker}><sphereGeometry args={[0.14, 16, 16]}/><meshBasicMaterial color={plan.snap.ok ? '#48b983' : '#e76e75'} transparent opacity={0.85}/></mesh>}
  </>;
}

export function Scada3DViewer({scene,glass=false,onSelect,selectedId,preview,onCamera}: {scene:ScadaScene;glass?:boolean;onSelect?:(id:string)=>void;selectedId?:string;preview?:DropPlan;onCamera?:(camera:Camera)=>void}) {
  const routes = useMemo(() => routeScene(scene, { resolvePorts }), [scene]);
  return <Canvas camera={{position:[7,6,9],fov:50}} style={{background:'#101d2d',width:'100%',height:'100%'}}>
    <ambientLight intensity={1.4}/><directionalLight position={[5,10,8]} intensity={2}/>
    <Grid infiniteGrid fadeDistance={35} sectionColor="#50718b" cellColor="#263e52"/>
    {scene.components.map(c=><Equipment key={c.id} component={c} glass={glass} selected={selectedId===c.id} onSelect={()=>onSelect?.(c.id)}/>)}
    {routes.map(route=><RoutePipe key={route.connectionId} route={route} glass={glass}/>)}
    {preview && <DropPreview scene={scene} plan={preview}/>}
    {onCamera && <CameraBridge onCamera={onCamera}/>}
    <OrbitControls makeDefault/><GizmoHelper alignment="bottom-right" margin={[70,70]}><GizmoViewport/></GizmoHelper>
  </Canvas>;
}

const defaultProperties = { level: 45, open: true, flowing: false };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function Scada3DEditor({initialScene,onChange}:{initialScene?:ScadaScene;onChange?:(scene:ScadaScene)=>void}) {
  const [scene,setScene]=useState<ScadaScene>(initialScene??createEmptyScene());
  const [selected,setSelected]=useState<string>();
  const [glass,setGlass]=useState(false);
  function update(next:ScadaScene){setScene(next);onChange?.(next);}
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
    const result=applyDrop(scene,plan,newId);
    if(result.ok){update(result.scene);setSelected(plan.component.id);}
  }
  const component=scene.components.find(c=>c.id===selected);
  function patch(changes:Partial<ComponentInstance>) {
    update({...scene,components:scene.components.map(c=>c.id===selected?{...c,...changes}:c)});
  }
  return <div style={{display:'grid',gridTemplateColumns:'190px minmax(0,1fr) 245px',height:'100%',minHeight:500,color:'#ebf2fa',background:'#142437',fontFamily:'system-ui'}}>
    <aside style={{padding:14,borderRight:'1px solid #3c5366'}}>
      <h3>Components</h3>{(Object.keys(componentCatalog) as ComponentKind[]).map(k=><button key={k} draggable onDragStart={e=>{e.dataTransfer.setData('scada-kind',k);e.dataTransfer.effectAllowed='copy';dragKind.current=k;}} onDragEnd={endDrag} onClick={()=>add(k)} style={{display:'block',width:'100%',marginBottom:8,padding:9,cursor:'grab'}}>{componentCatalog[k].label} +</button>)}
      <button onClick={()=>setGlass(!glass)}>{glass?'Normal view':'Glass / X-ray view'}</button>
    </aside>
    <main onDragOver={e=>{if(!dragKind.current)return;e.preventDefault();setPreview(planAt(e,'drop-preview'));}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setPreview(undefined);}}
      onDrop={drop} style={{minWidth:0,position:'relative'}}>
      <Scada3DViewer scene={scene} glass={glass} selectedId={selected} onSelect={setSelected} preview={preview} onCamera={c=>{camera.current=c;}}/>
      <div role="status" aria-live="polite" style={{position:'absolute',top:10,left:12,padding:preview?'6px 10px':0,borderRadius:4,background:'#0b1725cc',fontSize:13,pointerEvents:'none'}}>{preview?describeDrop(preview,scene):''}</div>
    </main>
    <aside style={{padding:14,borderLeft:'1px solid #3c5366'}}>
      <h3>Properties</h3>
      {component ? <>
        <p>{componentCatalog[component.type].label}</p>
        <small>Position (metres)</small>
        {(['X','Y','Z'] as const).map((axis,i)=><label key={axis} style={{display:'block',marginTop:8}}>{axis} <input type="number" step=".1" style={{width:100}} value={component.position[i]} onChange={e=>{const pos=[...component.position] as Vector3Tuple;pos[i]=Number(e.target.value);patch({position:pos});}}/></label>)}
        {component.type==='tank'&&<label style={{display:'block',marginTop:14}}>Liquid level % <input type="range" min="0" max="100" value={Number(component.properties.level??45)} onChange={e=>patch({properties:{...component.properties,level:Number(e.target.value)}})}/></label>}
        {component.type==='valve'&&<label><input type="checkbox" checked={component.properties.open!==false} onChange={e=>patch({properties:{...component.properties,open:e.target.checked}})}/> Valve open</label>}
        {(component.type==='pipe'||component.type==='tee')&&<label><input type="checkbox" checked={component.properties.flowing===true} onChange={e=>patch({properties:{...component.properties,flowing:e.target.checked}})}/> Flow indicator</label>}
        <p><button onClick={()=>{const result=removeComponent(scene,component.id);if(result.ok)update(result.scene);setSelected(undefined);}}>Remove</button></p>
      </>:<p>Select equipment in the canvas.</p>}
      <hr/><small>Scene JSON</small><textarea aria-label="Scene JSON" readOnly value={JSON.stringify(scene,null,2)} style={{width:'100%',height:170,boxSizing:'border-box'}}/>
    </aside>
  </div>;
}
