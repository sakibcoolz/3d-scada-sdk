import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import type { ComponentInstance, ComponentKind, ScadaScene, Vector3Tuple } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

function Equipment({ component, glass, selected, onSelect }: { component:ComponentInstance; glass:boolean; selected:boolean; onSelect:()=>void }) {
  const level = Math.max(0, Math.min(100, Number(component.properties.level ?? 45))) / 100;
  const flowing = component.properties.flowing === true;
  const open = component.properties.open !== false;
  const shellProps = {color:selected?'#63b3ed':'#7b9eb6',metalness:glass?0:0.65,roughness:0.35,transparent:glass,opacity:glass?0.21:1,depthWrite:!glass};
  return <group position={component.position} rotation={component.rotation} onClick={e=>{e.stopPropagation();onSelect();}}>
    {component.kind === 'tank' && <>
      <mesh><cylinderGeometry args={[1,1,3,40,1,true]}/><meshStandardMaterial {...shellProps} side={2}/></mesh>
      <mesh position={[0,-1.5,0]}><cylinderGeometry args={[1,1,.07,40]}/><meshStandardMaterial {...shellProps}/></mesh>
      <mesh position={[0,1.5,0]}><cylinderGeometry args={[1,1,.07,40]}/><meshStandardMaterial {...shellProps}/></mesh>
      <mesh position={[0,-1.5+level*1.5,0]}><cylinderGeometry args={[.94,.94,Math.max(.002,level*3),40]}/><meshStandardMaterial color="#2a9dce" transparent opacity={0.65} depthWrite={false}/></mesh>
    </>}
    {component.kind === 'pipe' && <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.18,.18,2,24]}/><meshStandardMaterial {...shellProps}/></mesh>}
    {component.kind === 'tee' && <>
      <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.18,.18,2,24]}/><meshStandardMaterial {...shellProps}/></mesh>
      <mesh position={[0,.5,0]}><cylinderGeometry args={[.18,.18,1,24]}/><meshStandardMaterial {...shellProps}/></mesh>
    </>}
    {component.kind === 'valve' && <>
      <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.16,.16,1.2,24]}/><meshStandardMaterial {...shellProps}/></mesh>
      <mesh><sphereGeometry args={[.33,24,16]}/><meshStandardMaterial color={open?'#48b983':'#e76e75'}/></mesh>
      <mesh position={[0,.47,0]} rotation={[0,open?0:Math.PI/2,0]}><boxGeometry args={[.75,.08,.11]}/><meshStandardMaterial color="#e3d5a5"/></mesh>
    </>}
    {component.kind === 'pump' && <mesh><sphereGeometry args={[.6,24,16]}/><meshStandardMaterial {...shellProps}/></mesh>}
    {component.kind === 'motor' && <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.38,.38,1,24]}/><meshStandardMaterial {...shellProps}/></mesh>}
    {component.kind === 'sensor' && <mesh><boxGeometry args={[.3,.6,.3]}/><meshStandardMaterial {...shellProps}/></mesh>}
    {flowing && (component.kind==='pipe'||component.kind==='tee') && <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.08,.08,1.9,16]}/><meshStandardMaterial color="#30caff" emissive="#137eaa" emissiveIntensity={.4}/></mesh>}
    {componentCatalog[component.kind].ports.map(port=><mesh key={port.id} position={port.position}><sphereGeometry args={[.1,10,10]}/><meshBasicMaterial color="#ffd166"/></mesh>)}
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
