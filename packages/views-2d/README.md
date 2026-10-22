# @sakibcoolz/views-2d

**2D diagrams over a [3D SCADA SDK](https://github.com/sakibcoolz/3d-scada-sdk) scene.** The process view (P&ID style) draws vessels, pumps, valves, pipes and instruments from the same document the 3D editor uses. Symbols are placed automatically until someone drags them. Each drop saves only the layout (`views.process`) and never copies the model.

```sh
npm install @sakibcoolz/views-2d @sakibcoolz/core @sakibcoolz/components react react-dom
```
ESM only · React 19 · plain SVG, no three.js · TypeScript types included · MIT

## Quick start

```tsx
import { ProcessView } from '@sakibcoolz/views-2d';

<ProcessView
  scene={scene}                       // a validated scene (core's validateScene / parseScene)
  registry={registry}                 // optional: createComponentRegistry(...yourTypes)
  selectedIds={selected}              // optional: share selection with other views
  onSelectionChange={setSelected}
  telemetry={{ provider }}            // optional: live values, same rules as the 3D view
  editable
  onChange={setScene}                 // receives the scene with the new symbol place saved
  style={{ height: 400 }}
/>
```

- **Interaction:** click to select, Shift-click to add, and Enter on a focused symbol. Drag the background to pan, and use the wheel or the + / − buttons to zoom. "Fit" frames the drawing.
- **Live values:** bound properties show under their symbol. Bad, stale or disconnected values show as unknown, never as a value.
- **Pure model, also in Node:**
  - `layoutView(scene, 'process', registry)` returns the symbols, positions, port anchors and lines;
  - `placeSymbol(scene, 'process', id, x, y)` saves one place;
  - `inView` says which components appear.

## What the process view shows
- **Equipment:**
  - built-in kinds;
  - types with fluid or mechanical ports;
  - types whose definition lists `views: ['process', …]`, such as the library's transmitters and switches.
- **Lines:**
  - pipes and shafts between them;
  - `measures` and `drives` associations, dashed.
- **Symbols:** ISA-5.1-style, used as a reference only; no standards compliance is claimed. Types without a symbol get a labelled box.

## The electrical view
`<ElectricalView>` takes the same props.
- **Columns, left to right:** supplies, controllers and switches, I/O cards, field devices (drives, transmitters, sensors), then loads (motors).
- **Symbols:** each type gets a terminal block generated from its ports, with inputs on the left, outputs on the right, network on top and earth at the bottom, labelled by terminal. Motors and instruments have their own symbols.
- **Wires:** drawn in domain colours (power orange, signal blue, network green), with `controls` dashed.

## Your own symbols
Give a definition `symbol2D` (process) or `electricalSymbol` (electrical):

```js
createComponentRegistry({
  type: 'com.acme.relay', label: 'Relay', ports, bounds, parts,
  electricalSymbol: { svg: '<svg …>…</svg>', width: 20, height: 40, ports: { A1: [0, 20] } },
});
```

The SVG is sanitized when you register it, using the allow-list sanitizer from `@sakibcoolz/asset-import`. Scripts, event handlers and external references fail registration.

Architecture: ADR-0026 in the repository.
