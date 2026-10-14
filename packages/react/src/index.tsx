import React, { useEffect, useMemo, useState } from 'react';
import { DoubleSide } from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import type { ComponentInstance, ComponentKind, ScadaScene, Vector3Tuple } from '@scada3d/core';
import { componentCatalog, pipeOuterRadius } from '@scada3d/components';
import { createEquipmentGeometries, disposeGeometries } from './geometry';

function Equipment({ component, glass, selected, onSelect }: { component:ComponentInstance; glass:boolean; selected:boolean; onSelect:()=>void }) {
  const definition = componentCatalog[component.kind];
  const geometries = useMemo(() => createEquipmentGeometries(definition), [definition]);
  useEffect(() => () => disposeGeometries(geometries), [geometries]);
  const level = Math.max(0, Math.min(100, Number(component.properties.level ?? 45))) / 100;
  const flowing = component.properties.flowing === true;
  const open = component.properties.open !== false;
  const shellProps = {color:selected?'#63b3ed':'#7b9eb6',metalness:glass?0:0.65,roughness:0.35,transparent:glass,opacity:glass?0.21:1,depthWrite:!glass,side:DoubleSide};
  return <group position={component.position} rotation={component.rotation} onClick={e=>{e.stopPropagation();onSelect();}}>
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
      return <mesh key={i} geometry={geometry}><meshStandardMaterial {...shellProps}/></mesh>;
    })}
    {flowing && (component.kind==='pipe'||component.kind==='tee') && <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[pipeOuterRadius*0.5,pipeOuterRadius*0.5,1.9,16]}/><meshStandardMaterial color="#30caff" emissive="#137eaa" emissiveIntensity={.4}/></mesh>}
    {definition.ports.map(port=><mesh key={port.id} position={port.position}><sphereGeometry args={[.05,10,10]}/><meshBasicMaterial color="#ffd166"/></mesh>)}
  </group>;
}

export function Scada3DViewer({scene,glass=false,onSelect,selectedId}: {scene:ScadaScene;glass?:boolean;onSelect?:(id:string)=>void;selectedId?:string}) {
  return <Canvas camera={{position:[7,6,9],fov:50}} style={{background:'#101d2d',width:'100%',height:'100%'}}>
    <ambientLight intensity={1.4}/><directionalLight position={[5,10,8]} intensity={2}/>
    <Grid infiniteGrid fadeDistance={35} sectionColor="#50718b" cellColor="#263e52"/>
    {scene.components.map(c=><Equipment key={c.id} component={c} glass={glass} selected={selectedId===c.id} onSelect={()=>onSelect?.(c.id)}/>)}
    <OrbitControls makeDefault/><GizmoHelper alignment="bottom-right" margin={[70,70]}><GizmoViewport/></GizmoHelper>
  </Canvas>;
}

export function Scada3DEditor({initialScene,onChange}:{initialScene?:ScadaScene;onChange?:(scene:ScadaScene)=>void}) {
  const [scene,setScene]=useState<ScadaScene>(initialScene??{version:1,components:[],connections:[]});
  const [selected,setSelected]=useState<string>();
  const [glass,setGlass]=useState(false);
  function update(next:ScadaScene){setScene(next);onChange?.(next);}
  function add(kind:ComponentKind) {
    const id=globalThis.crypto?.randomUUID?.()??String(Date.now());
    update({...scene,components:[...scene.components,{id,kind,position:[scene.components.length*2.4,1.8,0],rotation:[0,0,0],properties:{level:45,open:true,flowing:false}}]});setSelected(id);
  }
  const component=scene.components.find(c=>c.id===selected);
  function patch(changes:Partial<ComponentInstance>) {
    update({...scene,components:scene.components.map(c=>c.id===selected?{...c,...changes}:c)});
  }
  return <div style={{display:'grid',gridTemplateColumns:'190px minmax(0,1fr) 245px',height:'100%',minHeight:500,color:'#ebf2fa',background:'#142437',fontFamily:'system-ui'}}>
    <aside style={{padding:14,borderRight:'1px solid #3c5366'}}>
      <h3>Components</h3>{(Object.keys(componentCatalog) as ComponentKind[]).map(k=><button key={k} draggable onDragStart={e=>e.dataTransfer.setData('scada-kind',k)} onClick={()=>add(k)} style={{display:'block',width:'100%',marginBottom:8,padding:9,cursor:'grab'}}>{componentCatalog[k].label} +</button>)}
      <button onClick={()=>setGlass(!glass)}>{glass?'Normal view':'Glass / X-ray view'}</button>
    </aside>
    <main onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const kind=e.dataTransfer.getData('scada-kind') as ComponentKind;if(kind in componentCatalog)add(kind);}} style={{minWidth:0}}>
      <Scada3DViewer scene={scene} glass={glass} selectedId={selected} onSelect={setSelected}/>
    </main>
    <aside style={{padding:14,borderLeft:'1px solid #3c5366'}}>
      <h3>Properties</h3>
      {component ? <>
        <p>{componentCatalog[component.kind].label}</p>
        <small>Position (metres)</small>
        {(['X','Y','Z'] as const).map((axis,i)=><label key={axis} style={{display:'block',marginTop:8}}>{axis} <input type="number" step=".1" style={{width:100}} value={component.position[i]} onChange={e=>{const pos=[...component.position] as Vector3Tuple;pos[i]=Number(e.target.value);patch({position:pos});}}/></label>)}
        {component.kind==='tank'&&<label style={{display:'block',marginTop:14}}>Liquid level % <input type="range" min="0" max="100" value={Number(component.properties.level??45)} onChange={e=>patch({properties:{...component.properties,level:Number(e.target.value)}})}/></label>}
        {component.kind==='valve'&&<label><input type="checkbox" checked={component.properties.open!==false} onChange={e=>patch({properties:{...component.properties,open:e.target.checked}})}/> Valve open</label>}
        {(component.kind==='pipe'||component.kind==='tee')&&<label><input type="checkbox" checked={component.properties.flowing===true} onChange={e=>patch({properties:{...component.properties,flowing:e.target.checked}})}/> Flow indicator</label>}
        <p><button onClick={()=>{update({...scene,components:scene.components.filter(c=>c.id!==selected),connections:scene.connections.filter(c=>c.from.instanceId!==selected&&c.to.instanceId!==selected)});setSelected(undefined);}}>Remove</button></p>
      </>:<p>Select equipment in the canvas.</p>}
      <hr/><small>Scene JSON</small><textarea aria-label="Scene JSON" readOnly value={JSON.stringify(scene,null,2)} style={{width:'100%',height:170,boxSizing:'border-box'}}/>
    </aside>
  </div>;
}
