import type { ComponentDefinition, ComponentKind } from '@scada3d/core';
export const componentCatalog: Record<ComponentKind, ComponentDefinition> = {
  tank: { kind:'tank', label:'Vertical Tank', defaultSize:[2,3,2], ports:[
    {id:'inlet',kind:'fluid',position:[-1,0.8,0],direction:[-1,0,0],nominalSize:0.15},
    {id:'outlet',kind:'fluid',position:[1,-0.9,0],direction:[1,0,0],nominalSize:0.15}] },
  pipe: { kind:'pipe', label:'Straight Pipe', defaultSize:[2,0.3,0.3], ports:[
    {id:'in',kind:'fluid',position:[-1,0,0],direction:[-1,0,0],nominalSize:0.15},
    {id:'out',kind:'fluid',position:[1,0,0],direction:[1,0,0],nominalSize:0.15}] },
  tee: { kind:'tee', label:'T-Junction', defaultSize:[2,1,0.3], ports:[
    {id:'left',kind:'fluid',position:[-1,0,0],direction:[-1,0,0],nominalSize:0.15},
    {id:'right',kind:'fluid',position:[1,0,0],direction:[1,0,0],nominalSize:0.15},
    {id:'branch',kind:'fluid',position:[0,1,0],direction:[0,1,0],nominalSize:0.15}] },
  valve: { kind:'valve', label:'Ball Valve', defaultSize:[1.2,0.7,0.5], ports:[
    {id:'in',kind:'fluid',position:[-0.6,0,0],direction:[-1,0,0],nominalSize:0.15},
    {id:'out',kind:'fluid',position:[0.6,0,0],direction:[1,0,0],nominalSize:0.15}] },
  pump: { kind:'pump', label:'Centrifugal Pump', defaultSize:[1.5,1,1], ports:[] },
  sensor: { kind:'sensor', label:'Sensor', defaultSize:[0.3,0.6,0.3], ports:[] },
  motor: { kind:'motor', label:'Motor', defaultSize:[1,0.8,0.8], ports:[] }
};
