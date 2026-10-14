import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import {
  connect,
  snapComponent,
  validateScene,
  type ComponentInstance,
  type ComponentKind,
  type GraphResult,
  type ScadaScene,
  type SnapResult,
  type SnapStatus,
  type Vector3Tuple,
} from '@scada3d/core';
import { componentCatalog, type IndustrialComponentDefinition } from '@scada3d/components';

const resolvePorts = (kind: ComponentKind) => componentCatalog[kind].ports;

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
export function dropPosition(definition: IndustrialComponentDefinition, hit: Vector3Tuple): Vector3Tuple {
  return [hit[0], hit[1] - definition.bounds.min[1], hit[2]];
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
export function planDrop(scene: ScadaScene, kind: ComponentKind, hit: Vector3Tuple, options: DropOptions): DropPlan {
  const placed: ComponentInstance = {
    id: options.createId(),
    kind,
    position: dropPosition(componentCatalog[kind], hit),
    rotation: [0, 0, 0],
    properties: { ...options.properties },
  };
  const snap = snapComponent(scene, placed, { resolvePorts });
  return { component: snap.ok ? { ...placed, position: snap.position, rotation: snap.rotation } : placed, snap };
}

/** Adds the planned component and, when it snapped, its connection, validated as one change. */
export function applyDrop(scene: ScadaScene, plan: DropPlan, createConnectionId: () => string): GraphResult {
  const added: ScadaScene = { ...scene, components: [...scene.components, plan.component] };
  if (plan.snap.ok) return connect(added, { id: createConnectionId(), ...plan.snap.connection }, { resolvePorts });
  const result = validateScene(added, { resolvePorts });
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
  const label = componentCatalog[plan.component.kind].label;
  const targetLabel = (instanceId: string) => {
    const target = scene.components.find((c) => c.id === instanceId);
    return target ? componentCatalog[target.kind].label : instanceId;
  };
  if (plan.snap.ok) {
    const { candidate } = plan.snap;
    return `Connects ${label} "${candidate.movingPortId}" to ${targetLabel(candidate.target.instanceId)} "${candidate.target.portId}"`;
  }
  const nearest = plan.snap.nearest;
  if (nearest && nearest.status !== 'ok') {
    return `Cannot connect "${nearest.movingPortId}" to ${targetLabel(nearest.target.instanceId)} "${nearest.target.portId}": ${rejection[nearest.status]}`;
  }
  const [x, , z] = plan.component.position;
  return `Place ${label} at (${x.toFixed(2)}, ${z.toFixed(2)})`;
}
