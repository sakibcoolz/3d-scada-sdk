# Industrial component contract

Definitions expose `kind`, `label`, `defaultSize` and `ports`.
Instances expose `id`, `kind`, position, rotation and a property map.

Coordinates use right-handed XYZ in metres; Y is up. All ports are expressed in **local** coordinates with outward unit-normal directions. Port IDs must be unique within each component definition. Edges connect instance+port pairs; connections must never rely only on positions.

Initial families: tanks, pipes, tees, valves, pumps, motors and sensors.

## Future work
- Split each component into geometry, materials, ports and animation modules.
- Define a typed parameter schema per component.
- Map real-world flow, pressure, temperature and fill level from read-only telemetry.
- Model elbows, reducers, cross junctions, nozzles, tank wall thickness, motor shaft coupling.
- Create standard materials for opaque, glass, X-ray and section/cutaway views.
- Use GLB/glTF for asset-heavy components. An SVG may be extruded only when appropriate; a flat SVG does not inherently encode correct 3D geometry.
