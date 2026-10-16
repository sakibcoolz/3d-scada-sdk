import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import {
  connect,
  portToWorld,
  snapComponent,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type GraphResult,
  type ScadaScene,
  type SnapResult,
  type SnapStatus,
  type Vector3Like,
  type Vector3Tuple,
} from '@scada3d/core';
import { catalogResolvers, componentCatalog, definitionFor, sizeOfPort, type IndustrialComponentDefinition } from '@scada3d/components';


export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Casts a ray from the camera through a client-space pointer position and returns where it meets
 * the horizontal plane y = planeY, or null if the ray never reaches it.
 */
export function screenToPlane(
  pointer: { x: number; y: number },
  rect: ScreenRect,
  camera: Camera,
  planeY = 0,
): Vector3Tuple | null {
  const ndc = new Vector2(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -planeY), new Vector3());
  return hit ? [hit.x, hit.y, hit.z] : null;
}

/** Component position that rests its bounds on the plane at the hit point (no rotation). */
export function dropPosition(definition: IndustrialComponentDefinition, hit: Vector3Tuple): Vector3Like {
  return { x: hit[0], y: hit[1] - definition.bounds.min[1], z: hit[2] };
}

export interface DropPlan {
  /** The component to add, at its snapped transform when `snap.ok`, otherwise resting on the plane. */
  component: ComponentInstance;
  snap: SnapResult;
}

export interface DropOptions {
  createId: () => string;
  properties?: ComponentInstance['properties'];
}

/** Decides where a palette drop lands and what it would connect to. Pure: the scene is not changed. */
export function planDrop(scene: ScadaScene, type: ComponentKind, hit: Vector3Tuple, options: DropOptions): DropPlan {
  const placed: ComponentInstance = {
    id: options.createId(),
    type,
    position: dropPosition(definitionFor(type, options.properties), hit),
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    properties: { ...options.properties },
  };
  const snap = snapComponent(scene, placed, catalogResolvers);
  if (snap.ok) return { component: { ...placed, position: snap.position, rotation: snap.rotation }, snap };
  // A part with a size choice takes the size of the port it would snap to (ADR-0009).
  const resized = matchTargetSize(scene, placed, snap);
  if (resized) {
    const again = snapComponent(scene, resized, catalogResolvers);
    if (again.ok) return { component: { ...resized, position: again.position, rotation: again.rotation }, snap: again };
  }
  // Snap in plan view: a part dropped on the ground below a raised port (e.g. a tank on a stand)
  // is lifted to that port's height, then snapped as usual.
  for (const candidate of resized ? [resized, placed] : [placed]) {
    const lifted = liftToRaisedPort(scene, candidate);
    if (!lifted) continue;
    const up = snapComponent(scene, lifted, catalogResolvers);
    if (up.ok) return { component: { ...lifted, position: up.position, rotation: up.rotation }, snap: up };
    const sized = matchTargetSize(scene, lifted, up);
    const upSized = sized && snapComponent(scene, sized, catalogResolvers);
    if (sized && upSized && upSized.ok) return { component: { ...sized, position: upSized.position, rotation: upSized.rotation }, snap: upSized };
  }
  return { component: placed, snap };
}

/** Plan distance within which a raised port pulls a ground drop up to it, metres. */
const PLAN_SNAP = 0.5;

/** `placed` raised so one of its ports is level with the nearest higher port within PLAN_SNAP in plan. */
function liftToRaisedPort(scene: ScadaScene, placed: ComponentInstance): ComponentInstance | undefined {
  const mine = (catalogResolvers.resolvePorts(placed.type, placed.properties) ?? []).map((p) => portToWorld(placed, p).position);
  let best: { plan: number; dy: number } | undefined;
  for (const other of scene.components) {
    if (other.id === placed.id) continue;
    for (const port of catalogResolvers.resolvePorts(other.type, other.properties) ?? []) {
      const t = portToWorld(other, port).position;
      for (const m of mine) {
        const plan = Math.hypot(t[0] - m[0], t[2] - m[2]);
        const dy = t[1] - m[1];
        if (dy > 0 && plan <= PLAN_SNAP && (!best || plan < best.plan)) best = { plan, dy };
      }
    }
  }
  return best && { ...placed, position: { ...placed.position, y: placed.position.y + best.dy } };
}

/** `placed` with its moving port resized to the nearest target port's size, if that is a valid choice. */
function matchTargetSize(scene: ScadaScene, placed: ComponentInstance, snap: SnapResult): ComponentInstance | undefined {
  const nearest = !snap.ok ? snap.nearest : undefined;
  if (!nearest || nearest.status !== 'incompatible') return undefined;
  const target = scene.components.find((c) => c.id === nearest.target.instanceId);
  const port = target && catalogResolvers.resolvePorts(target.type, target.properties)?.find((p) => p.id === nearest.target.portId);
  const size = port && sizeOfPort(port);
  const parameters = componentCatalog[placed.type].parameters ?? {};
  // The reducer's outlet has its own size; every other sized part has one size for all ports.
  const name = placed.type === 'reducer' && nearest.movingPortId === 'out' ? 'outletSize' : 'size';
  if (!size || !parameters[name]) return undefined;
  const properties = { ...placed.properties, [name]: size };
  if (catalogResolvers.validateProperties(placed.type, properties).length > 0) return undefined;
  return { ...placed, properties };
}

/** Adds the planned component and, when it snapped, its connection, validated as one change. */
export function applyDrop(scene: ScadaScene, plan: DropPlan, createConnectionId: () => string): GraphResult {
  const added: ScadaScene = { ...scene, components: [...scene.components, plan.component] };
  if (plan.snap.ok) return connect(added, { id: createConnectionId(), ...plan.snap.connection }, catalogResolvers);
  const result = validateScene(added, catalogResolvers);
  if (result.ok) return result;
  return { ok: false, error: { code: result.errors[0].code, message: result.errors[0].message } };
}

const rejection: Record<Exclude<SnapStatus, 'ok'>, string> = {
  incompatible: 'port type or bore does not match',
  occupied: 'port already connected',
  misaligned: 'ports do not face each other',
};

/** One-line preview text for a drop, for the editor status line. Targets are named by catalog label. */
export function describeDrop(plan: DropPlan, scene: ScadaScene): string {
  const label = componentCatalog[plan.component.type].label;
  const targetLabel = (instanceId: string) => {
    const target = scene.components.find((c) => c.id === instanceId);
    return target ? componentCatalog[target.type].label : instanceId;
  };
  if (plan.snap.ok) {
    const { candidate } = plan.snap;
    return `Connects ${label} "${candidate.movingPortId}" to ${targetLabel(candidate.target.instanceId)} "${candidate.target.portId}"`;
  }
  const nearest = plan.snap.nearest;
  if (nearest && nearest.status !== 'ok') {
    return `Cannot connect "${nearest.movingPortId}" to ${targetLabel(nearest.target.instanceId)} "${nearest.target.portId}": ${rejection[nearest.status]}`;
  }
  const { x, z } = plan.component.position;
  return `Place ${label} at (${x.toFixed(2)}, ${z.toFixed(2)})`;
}
