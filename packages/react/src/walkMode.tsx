import { useEffect, useMemo, useRef } from 'react';
import { Euler, Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ScadaScene } from '@sakibcoolz/core';
import { floorSlab } from './floor.js';
import { climb, EYE_HEIGHT, look, moveKeyOf, moveWalker, walkObstacles, walkStep, type MoveKeys } from './walk.js';
import { startPose } from './xr.js';

/** Longest frame step used for movement, seconds: a stalled tab does not jump the walker. */
const MAX_DT = 0.1;
/** A key tap counts as held at least this long, milliseconds, so a tap always takes a short step. */
const MIN_PRESS_MS = 150;
const NO_KEYS: MoveKeys = { forward: false, back: false, left: false, right: false, run: false, up: false, down: false };

/** The walker's place and heading, reported to the view for its status line. */
export interface WalkerState {
  x: number;
  z: number;
  /** Eye height above the floor, metres. */
  eye: number;
  /** Heading, degrees clockwise from −Z (north on the plan). */
  heading: number;
}

/**
 * Desktop first-person walkthrough (T-062, ADR-0020): eye height on the floor, mouse look (pointer
 * lock, or drag where the browser refuses it), WASD/arrows to walk, Space/Alt to rise and sink, Shift to
 * go faster, Esc to leave.
 * Equipment between knee and eye height blocks; the orbit camera is restored on exit. Edits nothing.
 */
export function DesktopWalk({ scene, onExit, onMove }: { scene: ScadaScene; onExit: () => void; onMove: (state: WalkerState) => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; target: Vector3; update: () => void } | null;
  const obstacles = useMemo(() => walkObstacles(scene), [scene]);
  const slab = useMemo(() => floorSlab(scene), [scene]);
  const world = useRef({ obstacles, slab });
  world.current = { obstacles, slab };
  const walker = useRef({ x: 0, z: 0, eye: EYE_HEIGHT, yaw: 0, pitch: 0 });
  const keys = useRef<MoveKeys>({ ...NO_KEYS });
  const lastReport = useRef('');
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), target: controls?.target.clone() };
    const pose = startPose(camera.position, controls?.target ?? new Vector3());
    walker.current = { x: pose.x, z: pose.z, eye: EYE_HEIGHT, yaw: pose.yaw, pitch: 0 };
    // Start where a person can stand.
    Object.assign(walker.current, moveWalker({ x: pose.x, z: pose.z }, { x: 0, z: 0 }, world.current.obstacles, world.current.slab));
    if (controls) controls.enabled = false;
    const canvas = gl.domElement;
    let locked = false;
    let dragging = false;
    try { void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined); } catch { /* drag to look instead */ }

    const onLockChange = () => {
      if (document.pointerLockElement === canvas) locked = true;
      else if (locked) exit.current();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas && !dragging) return;
      Object.assign(walker.current, look(walker.current.yaw, walker.current.pitch, e.movementX, e.movementY));
    };
    const onDown = (e: PointerEvent) => { if (e.button === 0) dragging = true; };
    const onUp = () => { dragging = false; };
    // Capture-phase window listeners run before the editor's shortcuts, so walking keys do not move parts.
    const downAt: Partial<Record<keyof MoveKeys, number>> = {};
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code === 'Escape' && down) { e.preventDefault(); e.stopPropagation(); exit.current(); return; }
      const key = moveKeyOf(e.code);
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      if (down) {
        if (!e.repeat) downAt[key] = performance.now();
        keys.current[key] = true;
        return;
      }
      const pressedAt = downAt[key];
      const left = pressedAt === undefined ? 0 : MIN_PRESS_MS - (performance.now() - pressedAt);
      if (left <= 0) { keys.current[key] = false; return; }
      const timer = setTimeout(() => { timers.delete(timer); if (downAt[key] === pressedAt) keys.current[key] = false; }, left);
      timers.add(timer);
    };
    const keyDown = onKey(true), keyUp = onKey(false);
    const blur = () => { keys.current = { ...NO_KEYS }; };
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', blur);
      timers.forEach(clearTimeout);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      if (controls) {
        if (saved.target) controls.target.copy(saved.target);
        controls.enabled = true;
        controls.update();
      }
    };
  }, [gl, camera, controls]);

  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  useFrame((_, delta) => {
    const w = walker.current;
    const dt = Math.min(delta, MAX_DT);
    w.eye = climb(w, w.eye, keys.current, dt, world.current.obstacles);
    const step = walkStep(w.yaw, keys.current, dt);
    if (step.x !== 0 || step.z !== 0) Object.assign(w, moveWalker(w, step, world.current.obstacles, world.current.slab, w.eye));
    camera.position.set(w.x, w.eye, w.z);
    euler.set(w.pitch, w.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    const heading = Math.round(((((-w.yaw * 180) / Math.PI) % 360) + 360) % 360);
    const report = `${w.x.toFixed(1)},${w.z.toFixed(1)},${w.eye.toFixed(1)},${heading}`;
    if (report !== lastReport.current) { lastReport.current = report; onMove({ x: w.x, z: w.z, eye: w.eye, heading }); }
  });
  return null;
}
