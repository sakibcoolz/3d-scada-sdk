import React from 'react';
import { createRoot } from 'react-dom/client';
import { Scada3DEditor } from '@scada3d/react';
function App(){return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><header style={{padding:'12px 20px',background:'#0b1725',color:'white',fontFamily:'system-ui'}}><b>3D SCADA SDK</b> <span style={{opacity:.6}}> / R&D Playground</span></header><div style={{flex:1,minHeight:0}}><Scada3DEditor/></div></div>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
