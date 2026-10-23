import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Mesh, MeshBasicMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { rotateVector, type ComponentInstance, type ComponentStatus, type ScadaScene, type Vector3Tuple } from '@sakibcoolz/core';
import { describeStatus } from '@sakibcoolz/views-2d';
import { useRegistry } from './registryContext.js';

// 3D status markers (ADR-0028 §4): a coloured ring above each component that needs attention. The ring
// blinks only for an unacknowledged alarm, and never when the user asks for reduced motion. Display only.

/** Where a component's marker goes: centred over its world-space bounds, a little above the top. */
export function markerPlacement(component: Pick<ComponentInstance, 'position' | 'rotation' | 'scale'>, bounds: { min: Vector3Tuple; max: Vector3Tuple }): { position: Vector3Tuple; radius: number } {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const local = { x: (i & 1 ? bounds.max : bounds.min)[0] * component.scale.x, y: (i & 2 ? bounds.max : bounds.min)[1] * component.scale.y, z: (i & 4 ? bounds.max : bounds.min)[2] * component.scale.z };
    const r = rotateVector(local, component.rotation);
    return [r.x + component.position.x, r.y + component.position.y, r.z + component.position.z] as const;
  });
  const range = (axis: 0 | 1 | 2) => [Math.min(...corners.map((c) => c[axis])), Math.max(...corners.map((c) => c[axis]))] as const;
  const [x, y, z] = [range(0), range(1), range(2)];
  const half = Math.max(x[1] - x[0], z[1] - z[0]) / 2;
  return { position: [(x[0] + x[1]) / 2, y[1] + 0.3, (z[0] + z[1]) / 2], radius: Math.min(1.5, Math.max(0.2, half * 0.6)) };
}

/** The user's reduced-motion preference, following changes. */
export function usePrefersReducedMotion(): boolean {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const [reduced, setReduced] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return undefined;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query?.media]);
  return reduced;
}

const BLINK_PERIOD_S = 1;

function Marker({ component, status, blink }: { component: ComponentInstance; status: ComponentStatus; blink: boolean }) {
  const registry = useRegistry();
  const { position, radius } = useMemo(() => markerPlacement(component, registry.definitionFor(component.type, component.properties).bounds), [component, registry]);
  const mesh = useRef<Mesh>(null);
  const flagged = describeStatus(status)!;
  useFrame(({ clock }) => {
    const material = mesh.current?.material as MeshBasicMaterial | undefined;
    if (material) material.opacity = blink && clock.elapsedTime % BLINK_PERIOD_S > BLINK_PERIOD_S / 2 ? 0.2 : 0.9;
  });
  return (
    <mesh ref={mesh} position={position} rotation={[-Math.PI / 2, 0, 0]} userData={{ componentId: component.id, role: 'status-marker', status: status.status, severity: status.severity, blinking: blink }}>
      <torusGeometry args={[radius, Math.max(0.03, radius * 0.12), 8, 40]} />
      <meshBasicMaterial color={flagged.color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** One ring per component whose status is alarm, unknown or uncertain. */
export function StatusMarkers({ scene, status }: { scene: ScadaScene; status: ReadonlyMap<string, ComponentStatus> }) {
  const reduced = usePrefersReducedMotion();
  return <>{scene.components.map((c) => {
    const s = status.get(c.id);
    if (!s || !describeStatus(s)) return null;
    return <Marker key={c.id} component={c} status={s} blink={s.status === 'alarm' && s.unacknowledged && !reduced} />;
  })}</>;
}
