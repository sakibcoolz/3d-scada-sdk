import React from 'react';
import { createRoot } from 'react-dom/client';
import { validateScene, type ScadaScene } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';
import { Scada3DEditor } from '@scada3d/react';
import { demoScene } from './demo';

// `?demo` opens the MVP demo network, validated like any imported scene.
function initialScene(): ScadaScene | undefined {
  if (!new URLSearchParams(location.search).has('demo')) return undefined;
  const result = validateScene(demoScene, { resolvePorts: (type) => componentCatalog[type].ports });
  if (!result.ok) {
    console.error('Demo scene is invalid', result.errors);
    return undefined;
  }
  return result.scene;
}

function App(){return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><header style={{padding:'12px 20px',background:'#0b1725',color:'white',fontFamily:'system-ui'}}><b>3D SCADA SDK</b> <span style={{opacity:.6}}> / R&D Playground</span></header><div style={{flex:1,minHeight:0}}><Scada3DEditor initialScene={initialScene()}/></div></div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
