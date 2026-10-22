import { createComponentRegistry, pipeSizes } from '@sakibcoolz/components';

// `?custom` registers this example host type (ADR-0022): an inline filter housing, built from the
// same primitive parts as the catalog, with DN150 fluid ports. No SDK change is involved.
const bore = pipeSizes.DN150.bore;
export const exampleRegistry = createComponentRegistry({
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
});
