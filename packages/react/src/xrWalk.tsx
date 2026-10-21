import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Vector3, type Group, type Mesh, type WebGLRenderer } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ScadaScene } from '@sakibcoolz/core';
import { floorSlab } from './floor.js';
import { referenceOffset, sceneToTracked, snapTurn, startPose, teleportHead, teleportTarget, TELEPORT_RANGE, turnAboutHead, type StandPose } from './xr.js';

const RAY_COLOR = '#7fd6ff';
const TARGET_COLOR = '#3ccf7e';

type Vec3 = { x: number; y: number; z: number };
/** Walker state between frames; the callbacks are set while the rig is mounted. */
interface Rig {
  pose: StandPose;
  base?: XRReferenceSpace;
  aiming: boolean[];
  armed: boolean;
  apply?: (pose: StandPose) => void;
  head?: () => Vec3;
  aimAt?: (controller: Group) => { x: number; z: number } | undefined;
}

/** Whether this browser can open an immersive VR session (WebXR, a secure page and a headset). */
export function useVrSupport(): 'checking' | 'yes' | 'no' {
  const [support, setSupport] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => {
    let live = true;
    const xr = typeof navigator === 'undefined' ? undefined : navigator.xr;
    if (!xr) { setSupport('no'); return; }
    xr.isSessionSupported('immersive-vr').then((ok) => { if (live) setSupport(ok ? 'yes' : 'no'); }, () => { if (live) setSupport('no'); });
    return () => { live = false; };
  }, []);
  return support;
}

/** Opens an immersive session on the renderer, standing on the floor (`local-floor`). */
export async function enterVr(gl: WebGLRenderer): Promise<void> {
  const session = await navigator.xr!.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
  gl.xr.setReferenceSpaceType('local-floor');
  await gl.xr.setSession(session);
}

/** True while the renderer presents to a headset. */
export function useXrPresenting(gl: WebGLRenderer | undefined): boolean {
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    if (!gl) return;
    const on = () => setPresenting(true), off = () => setPresenting(false);
    gl.xr.addEventListener('sessionstart', on);
    gl.xr.addEventListener('sessionend', off);
    return () => { gl.xr.removeEventListener('sessionstart', on); gl.xr.removeEventListener('sessionend', off); };
  }, [gl]);
  return presenting;
}

/**
 * The walkthrough rig (T-062, ADR-0020): starts the walker on the floor under the desktop camera,
 * teleports on trigger release where a controller ray meets the floor slab, and snap-turns on the
 * thumbstick. It moves the tracking space, never the scene, and edits nothing.
 */
export function XrWalk({ scene }: { scene: ScadaScene }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target?: Vector3 } | null;
  const slab = useMemo(() => floorSlab(scene), [scene]);
  const slabRef = useRef(slab);
  slabRef.current = slab;
  const marker = useRef<Mesh>(null);
  const rig = useRef<Rig>({ pose: { x: 0, z: 0, yaw: 0 }, aiming: [false, false], armed: true });
  const controllers = useMemo(() => [0, 1].map((i) => gl.xr.getController(i)), [gl]);

  useEffect(() => {
    const apply = (pose: StandPose) => {
      rig.current.pose = pose;
      const base = rig.current.base;
      if (!base) return;
      const { position, orientation } = referenceOffset(pose);
      gl.xr.setReferenceSpace(base.getOffsetReferenceSpace(new XRRigidTransform(position, orientation)));
    };
    const head = () => sceneToTracked(rig.current.pose, gl.xr.getCamera().getWorldPosition(new Vector3()));
    const aimAt = (controller: Group) => {
      const origin = controller.getWorldPosition(new Vector3());
      const direction = new Vector3(0, 0, -1).transformDirection(controller.matrixWorld);
      return teleportTarget(origin, direction, slabRef.current);
    };
    const start = () => {
      rig.current.base = gl.xr.getReferenceSpace() ?? undefined;
      apply(startPose(camera.position, controls?.target ?? new Vector3()));
    };
    const end = () => { rig.current.base = undefined; rig.current.aiming = [false, false]; };
    const handlers = controllers.map((controller, i) => ({
      down: () => { rig.current.aiming[i] = true; },
      up: () => {
        rig.current.aiming[i] = false;
        const target = aimAt(controller);
        if (target) apply(teleportHead(rig.current.pose, head(), target));
      },
    }));
    controllers.forEach((c, i) => { c.addEventListener('selectstart', handlers[i].down); c.addEventListener('selectend', handlers[i].up); });
    gl.xr.addEventListener('sessionstart', start);
    gl.xr.addEventListener('sessionend', end);
    Object.assign(rig.current, { apply, head, aimAt });
    return () => {
      controllers.forEach((c, i) => { c.removeEventListener('selectstart', handlers[i].down); c.removeEventListener('selectend', handlers[i].up); });
      gl.xr.removeEventListener('sessionstart', start);
      gl.xr.removeEventListener('sessionend', end);
    };
  }, [gl, camera, controls, controllers]);

  // A pointing ray on each controller, drawn to the teleport range.
  useEffect(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -TELEPORT_RANGE], 3));
    const material = new LineBasicMaterial({ color: RAY_COLOR, transparent: true, opacity: 0.6 });
    const rays = controllers.map((c) => { const ray = new Line(geometry, material); ray.userData.role = 'xr-ray'; c.add(ray); return ray; });
    return () => { rays.forEach((r, i) => controllers[i].remove(r)); geometry.dispose(); material.dispose(); };
  }, [controllers]);

  useFrame(() => {
    const r = rig.current;
    if (!gl.xr.isPresenting || !r.apply || !r.head || !r.aimAt) { if (marker.current) marker.current.visible = false; return; }
    // Teleport marker under the aiming ray.
    const aiming = controllers.findIndex((_, i) => r.aiming[i]);
    const target = aiming >= 0 ? r.aimAt(controllers[aiming]) : undefined;
    if (marker.current) {
      marker.current.visible = !!target;
      if (target) marker.current.position.set(target.x, 0.01, target.z);
    }
    // Snap turn on the first thumbstick that moves.
    const sources = gl.xr.getSession()?.inputSources ?? [];
    let stick = 0;
    for (const source of sources) {
      const axes = source.gamepad?.axes;
      const x = axes && axes.length >= 4 ? axes[2] : axes?.[0] ?? 0;
      if (Math.abs(x) > Math.abs(stick)) stick = x;
    }
    const turned = snapTurn(r.pose.yaw, stick, r.armed);
    r.armed = turned.armed;
    if (turned.yaw !== r.pose.yaw) r.apply(turnAboutHead(r.pose, r.head(), turned.yaw));
  });

  return <>
    {controllers.map((c, i) => <primitive key={i} object={c}/>)}
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false} userData={{ role: 'xr-target' }} raycast={() => null}>
      <ringGeometry args={[0.25, 0.35, 40]}/>
      <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.9} depthWrite={false} toneMapped={false}/>
    </mesh>
  </>;
}
