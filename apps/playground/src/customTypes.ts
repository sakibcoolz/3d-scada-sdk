import { pipeSizes, type ComponentTypeDefinition } from '@sakibcoolz/components';

// `?custom` adds these example host types (ADR-0022): an inline filter housing with DN150 fluid
// ports, and a controller and a drive with signal and network terminals (ADR-0023), built from the
// same primitive parts as the catalog. No SDK change is involved.
const bore = pipeSizes.DN150.bore;
export const exampleTypes: ComponentTypeDefinition[] = [{
  type: 'com.example.filter',
  version: '1',
  category: 'process',
  label: 'Inline Filter (example)',
  ports: [
    { id: 'in', kind: 'fluid', position: [-0.5, 0, 0], direction: [-1, 0, 0], nominalSize: bore },
    { id: 'out', kind: 'fluid', position: [0.5, 0, 0], direction: [1, 0, 0], nominalSize: bore },
  ],
  bounds: { min: [-0.5, -0.35, -0.2], max: [0.5, 0.45, 0.2] },
  parts: [
    { shape: 'cylinder', role: 'shell', center: [0, 0.05, 0], axis: 'y', radius: 0.2, length: 0.8 },
    { shape: 'cylinder', role: 'shell', center: [0, 0, 0], axis: 'x', radius: 0.0842, length: 1 },
    { shape: 'box', role: 'plate', center: [0, 0.2, 0.205], size: [0.18, 0.1, 0.01], text: 'FILTER' },
  ],
}, {
  type: 'com.example.controller',
  version: '1',
  category: 'control',
  label: 'Controller (example)',
  ports: [
    { id: 'do0', kind: 'signal', name: 'Run output', terminal: 'DO0.0', position: [0.3, 0.6, 0], direction: [1, 0, 0], signal: { type: 'DO' } },
    { id: 'eth', kind: 'network', terminal: 'X1', position: [0, 1.2, 0], direction: [0, 1, 0], network: { medium: 'ethernet', protocols: ['modbus-tcp'] }, maxConnections: 4 },
  ],
  bounds: { min: [-0.3, 0, -0.2], max: [0.3, 1.2, 0.2] },
  parts: [{ shape: 'box', role: 'shell', center: [0, 0.6, 0], size: [0.6, 1.2, 0.4], text: 'PLC' }],
}, {
  type: 'com.example.drive',
  version: '1',
  category: 'electrical',
  label: 'Drive (example)',
  ports: [
    { id: 'run', kind: 'signal', name: 'Run command', terminal: 'DI1', position: [-0.25, 0.6, 0], direction: [-1, 0, 0], signal: { type: 'DI' } },
    { id: 'eth', kind: 'network', terminal: 'X2', position: [0, 1, 0], direction: [0, 1, 0], network: { medium: 'ethernet', protocols: ['modbus-tcp'] } },
  ],
  bounds: { min: [-0.25, 0, -0.2], max: [0.25, 1, 0.2] },
  parts: [{ shape: 'box', role: 'shell', center: [0, 0.5, 0], size: [0.5, 1, 0.4], text: 'VFD' }],
}];
