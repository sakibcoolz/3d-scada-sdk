# Scene schema and connection-engine specification

## Units and coordinates
Right-handed 3D, Y-up; scene translation and dimensions in metres; rotations in radians; local port normals point out from equipment. Display conversion (litres/°C/kPa) must be explicit. Scene IDs persist between sessions.

## Data model
```ts
SceneDocument {
  schemaVersion: number;
  units: "m";
  components: ComponentInstance[];
  connections: ConnectionEdge[];
  tagBindings?: TagBinding[];
}
ConnectionEdge {
  id: string;
  from: {instanceId:string;portId:string};
  to: {instanceId:string;portId:string};
}
```
This is **target schema**, not necessarily current code. M1 introduces runtime schema validation.

## Invariants
- Instance IDs and edge IDs unique.
- Every endpoint references a present instance and declared port.
- Compatible physical domains (fluid/electrical/signal/mechanical) and nominal size rules.
- Ports with single-connection capacity cannot be used twice.
- Port normals align within tolerance and must face appropriately before auto-snap.
- Graph supports tees, loops, branches and disconnections; cycles do not cause traversal recursion failures.
- World endpoint positions derived by composing local port transforms with component transforms.
- Geometry and adjacency stay synchronized under move/rotate/undo/redo.
- Invalid input yields typed validation error; never silently mutate graph.

## Snap algorithm target
1. Raycast dragged component/port into scene.
2. Find candidate free compatible target ports by world-space proximity.
3. Evaluate domain, nominal size, orientation and occupancy.
4. Choose deterministic nearest eligible candidate within configurable tolerances.
5. Solve component transform to align port anchors/normals without shifting already anchored components.
6. Commit explicit edge through command transaction; recompute pipe route; emit undo record.
7. On failure preserve scene exactly and show actionable reason.

## Routing
Distinguish logical edge from render mesh. Support straight runs and deterministic orthogonal elbows; tee is a 3-port junction node, not merely crossing meshes. Document pipe diameter, bend-radius constraints and clearance; never imply collision-free CAD-grade auto-routing without collision tests.

## Serialization
Save authored scene only. Validate on load, reject/diagnose corrupt references, migrate supported versions, round-trip deterministically, avoid using React/Three objects or telemetry stream values in JSON.

## Required tests
Invalid/missing port; wrong type; wrong diameter; occupied port; face orientation; transform with rotation; tee 3-way split; cyclic graph; delete component cascade; scene JSON round-trip; undo/redo.
