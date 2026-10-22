import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Euler, Raycaster, Vector2, Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ScadaScene, Vector3Tuple } from '@sakibcoolz/core';
import { floorSlab } from './floor.js';
import { componentHit } from './pick.js';
import { climb, EYE_HEIGHT, look, moveKeyOf, moveWalker, walkObstacles, walkStep, type MoveKeys } from './walk.js';
import { startPose, teleportTarget } from './xr.js';

/**
 * Longest frame step used for movement, seconds: a stalled tab does not jump the walker far
 * (at most about 0.9 m running), yet slow frames still move at close to real speed.
 */
const MAX_DT = 0.25;
/** A key tap counts as held at least this long, milliseconds, so a tap always takes a short step. */
const MIN_PRESS_MS = 150;
/** How often the part under the crosshair is looked up, milliseconds. */
const AIM_EVERY_MS = 100;
/** A press that moves less than this, pixels, is a click rather than a drag-to-look. */
const CLICK_SLOP_PX = 4;
/**
 * Mouse movement larger than this in one event, pixels, is ignored: Chrome can report one bogus
 * jump of hundreds of pixels just after the pointer locks, which would spin the walker.
 */
const MAX_LOOK_STEP_PX = 200;
/** Furthest floor point the crosshair places a part at, metres. */
const PLACE_RANGE = 30;
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
 * Placing new parts at the crosshair (T-065). The walk reports input; the host (the editor) plans
 * and applies the drop, so snapping, undo and the edit lock are its own.
 */
export interface WalkPlaceInput {
  /** True while the parts menu is open: losing pointer lock then does not leave Walk. Owned by the view. */
  menuOpen: MutableRefObject<boolean>;
  /** A part is held and follows the crosshair. */
  placing: boolean;
  /** P: open or close the parts menu. */
  onToggleMenu: () => void;
  /** X or right-click: stop holding the part. */
  onStop: () => void;
  /** Click while holding: place the part at the crosshair. */
  onPlace: () => void;
  /** While holding: the floor point under the crosshair, or undefined when it looks above the horizon or too far. */
  onAimFloor: (point: Vector3Tuple | undefined) => void;
}

/**
 * Desktop first-person walkthrough (T-062, ADR-0020): eye height on the floor, mouse look (pointer
 * lock, or drag where the browser refuses it), WASD/arrows to walk, Space/Alt to rise and sink, Shift to
 * go faster, Esc to leave.
 * Equipment between knee and eye height blocks; the orbit camera is restored on exit.
 * With `onPick`, a click picks the part under the crosshair and C asks to connect it to the
 * selected one (T-063); the host applies the editor's attach rules. The view's own pointer
 * picking is off while walking, so only the crosshair picks.
 * Inside the editor, keyboard focus moves to it while walking (T-064), so its shortcuts for the
 * selected part (R turns, Delete removes, PageUp/PageDown raise and lower, Ctrl/Cmd+Z undoes) keep
 * working; movement keys, plain C and Esc are taken by the walk first.
 * With `place` (T-065), P opens a parts menu, a click places the held part at the crosshair, and
 * X or right-click stops placing; Esc closes the menu before it leaves Walk.
 */
export function DesktopWalk({ scene, onExit, onMove, onPick, onAim, place }: { scene: ScadaScene; onExit: () => void; onMove: (state: WalkerState) => void; onPick?: (id: string, connect: boolean) => void; onAim?: (id: string | undefined) => void; place?: WalkPlaceInput }) {
  const gl = useThree((s) => s.gl);
  const scene3d = useThree((s) => s.scene);
  const getState = useThree((s) => s.get);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; target: Vector3; update: () => void } | null;
  const obstacles = useMemo(() => walkObstacles(scene), [scene]);
  const slab = useMemo(() => floorSlab(scene), [scene]);
  const world = useRef({ obstacles, slab });
  world.current = { obstacles, slab };
  const walker = useRef({ x: 0, z: 0, eye: EYE_HEIGHT, yaw: 0, pitch: 0 });
  const keys = useRef<MoveKeys>({ ...NO_KEYS });
  /** Keys held since the last frame, and releases waiting for a frame to see the press. */
  const unseen = useRef(new Set<keyof MoveKeys>());
  const releaseAfterFrame = useRef(new Set<keyof MoveKeys>());
  const lastReport = useRef('');
  const exit = useRef(onExit);
  exit.current = onExit;
  const pick = useRef(onPick);
  pick.current = onPick;
  const placer = useRef(place);
  placer.current = place;
  const lastFloor = useRef<{ at: number; point?: Vector3Tuple }>({ at: 0 });
  const ids = useMemo(() => new Set(scene.components.map((c) => c.id)), [scene]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const raycaster = useMemo(() => new Raycaster(), []);
  /** The component under the crosshair, if any. */
  const aimed = useRef<() => string | undefined>(() => undefined);
  aimed.current = () => {
    raycaster.setFromCamera(new Vector2(0, 0), camera);
    return componentHit(raycaster.intersectObjects(scene3d.children, true), idsRef.current)?.id;
  };
  const lastAim = useRef<{ at: number; id?: string }>({ at: 0 });

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
    let pressAt: { x: number; y: number } | undefined;
    // Let the editor hear its shortcuts: the Walk button that had focus is gone.
    (canvas.closest('.scada3d-editor') as HTMLElement | null)?.focus({ preventScroll: true });
    const events = getState().events;
    const eventsWere = events.enabled;
    getState().setEvents({ enabled: false });
    const pickAimed = (connect: boolean) => {
      const id = aimed.current();
      if (id) pick.current?.(id, connect);
    };
    const menuOpen = () => placer.current?.menuOpen.current === true;
    /** A click: place the held part, or pick the part under the crosshair. */
    const primary = () => {
      if (placer.current?.placing) placer.current.onPlace();
      else pickAimed(false);
    };
    try { void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined); } catch { /* drag to look instead */ }

    const onLockChange = () => {
      if (document.pointerLockElement === canvas) locked = true;
      else if (locked) {
        locked = false;
        // Opening the parts menu frees the pointer on purpose.
        if (!menuOpen()) exit.current();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas && !dragging) return;
      if (Math.abs(e.movementX) > MAX_LOOK_STEP_PX || Math.abs(e.movementY) > MAX_LOOK_STEP_PX) return;
      Object.assign(walker.current, look(walker.current.yaw, walker.current.pitch, e.movementX, e.movementY));
    };
    const onDown = (e: PointerEvent) => {
      if (menuOpen()) return;
      if (e.button === 2) { if (placer.current?.placing) placer.current.onStop(); return; }
      if (e.button !== 0) return;
      if (document.pointerLockElement === canvas) { primary(); return; }
      dragging = true;
      pressAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      // A click without a drag also picks at the crosshair.
      if (dragging && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < CLICK_SLOP_PX) primary();
      dragging = false;
      pressAt = undefined;
    };
    // Capture-phase window listeners run before the editor's shortcuts, so walking keys do not move parts.
    const downAt: Partial<Record<keyof MoveKeys, number>> = {};
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey;
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code === 'Escape' && down) {
        e.preventDefault();
        e.stopPropagation();
        if (menuOpen()) placer.current?.onToggleMenu();
        else exit.current();
        return;
      }
      if (placer.current && (e.code === 'KeyP' || e.code === 'KeyX') && plain(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (!down || e.repeat) return;
        if (e.code === 'KeyP') placer.current.onToggleMenu();
        else if (placer.current.placing) placer.current.onStop();
        return;
      }
      if (e.code === 'KeyC' && pick.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (down && !e.repeat) pickAimed(true);
        return;
      }
      const key = moveKeyOf(e.code);
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      if (down) {
        if (!e.repeat) { downAt[key] = performance.now(); unseen.current.add(key); releaseAfterFrame.current.delete(key); }
        keys.current[key] = true;
        return;
      }
      // A tap is held at least MIN_PRESS_MS and until a frame has moved the walker with it.
      const release = () => { if (unseen.current.has(key)) releaseAfterFrame.current.add(key); else keys.current[key] = false; };
      const pressedAt = downAt[key];
      const left = pressedAt === undefined ? 0 : MIN_PRESS_MS - (performance.now() - pressedAt);
      if (left <= 0) { release(); return; }
      const timer = setTimeout(() => { timers.delete(timer); if (downAt[key] === pressedAt) release(); }, left);
      timers.add(timer);
    };
    const keyDown = onKey(true), keyUp = onKey(false);
    const blur = () => { keys.current = { ...NO_KEYS }; unseen.current.clear(); releaseAfterFrame.current.clear(); };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('contextmenu', noMenu);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', blur);
      timers.forEach(clearTimeout);
      getState().setEvents({ enabled: eventsWere });
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      if (controls) {
        if (saved.target) controls.target.copy(saved.target);
        controls.enabled = true;
        controls.update();
      }
    };
  }, [gl, camera, controls, getState]);

  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  useFrame((_, delta) => {
    const w = walker.current;
    const dt = Math.min(delta, MAX_DT);
    w.eye = climb(w, w.eye, keys.current, dt, world.current.obstacles);
    const step = walkStep(w.yaw, keys.current, dt);
    if (step.x !== 0 || step.z !== 0) Object.assign(w, moveWalker(w, step, world.current.obstacles, world.current.slab, w.eye));
    // Every held key has now moved the walker once; taps waiting for that may be released.
    unseen.current.clear();
    releaseAfterFrame.current.forEach((k) => { keys.current[k] = false; });
    releaseAfterFrame.current.clear();
    camera.position.set(w.x, w.eye, w.z);
    euler.set(w.pitch, w.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    const heading = Math.round(((((-w.yaw * 180) / Math.PI) % 360) + 360) % 360);
    const report = `${w.x.toFixed(1)},${w.z.toFixed(1)},${w.eye.toFixed(1)},${heading}`;
    if (report !== lastReport.current) { lastReport.current = report; onMove({ x: w.x, z: w.z, eye: w.eye, heading }); }
    if (onAim) {
      const now = performance.now();
      if (now - lastAim.current.at >= AIM_EVERY_MS) {
        const id = aimed.current();
        if (id !== lastAim.current.id) onAim(id);
        lastAim.current = { at: now, id };
      }
    }
    const holding = placer.current;
    if (holding?.placing && !holding.menuOpen.current) {
      const now = performance.now();
      if (now - lastFloor.current.at >= AIM_EVERY_MS) {
        const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const hit = teleportTarget(camera.position, direction, undefined, PLACE_RANGE);
        const point: Vector3Tuple | undefined = hit ? [hit.x, 0, hit.z] : undefined;
        const before = lastFloor.current.point;
        const same = before && point ? Math.hypot(point[0] - before[0], point[2] - before[2]) <= 0.005 : before === point;
        if (!same) holding.onAimFloor(point);
        lastFloor.current = { at: now, point };
      }
    } else if (lastFloor.current.point) {
      lastFloor.current = { at: 0 };
    }
  });
  return null;
}
