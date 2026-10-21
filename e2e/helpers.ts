import { expect, type Page } from '@playwright/test';

/** DN150 ball valve face to face, ASME B16.10 Class 150 short pattern (ADR-0016), metres. */
export const VALVE_FACE = 0.267;

export type Vec3 = [number, number, number];

// Mirrors the viewer camera: position (7, 6, 9), 50° vertical fov, orbit target at the origin.
export function project(world: Vec3, box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const eye: Vec3 = [7, 6, 9];
  const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm([-eye[0], -eye[1], -eye[2]]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const p: Vec3 = [world[0] - eye[0], world[1] - eye[1], world[2] - eye[2]];
  const depth = dot(p, forward);
  const t = Math.tan((50 * Math.PI) / 360);
  const ndcX = dot(p, right) / (depth * t * (box.width / box.height));
  const ndcY = dot(p, up) / (depth * t);
  return { x: box.x + ((ndcX + 1) / 2) * box.width, y: box.y + ((1 - ndcY) / 2) * box.height };
}

/** R3F sizes the canvas and aims the camera after mount; wait until it fills the editor viewport. */
export async function waitForCanvas(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const [canvas, main] = await Promise.all([page.locator('canvas').boundingBox(), page.locator('main').boundingBox()]);
      return canvas && main ? Math.abs(canvas.width - main.width) + Math.abs(canvas.height - main.height) : Infinity;
    })
    .toBeLessThan(1);
  await page.waitForTimeout(200);
}

export async function startDrag(page: Page, label: string, world: Vec3): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const target = project(world, box);
  await page.getByRole('button', { name: label }).hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
}

export async function sceneJson(page: Page) {
  return JSON.parse(await page.getByLabel('Scene JSON').inputValue());
}

/** Collects Three.js scenes through the devtools hook. Call before page.goto. */
export async function installThreeHook(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const hook = new EventTarget();
    (window as unknown as { __scenes: unknown[] }).__scenes = [];
    hook.addEventListener('observe', (e) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.isScene) (window as unknown as { __scenes: unknown[] }).__scenes.push(detail);
      // Keep only the newest renderer: a remounted canvas creates a new one and disposes the old.
      if (detail?.isWebGLRenderer) (window as unknown as { __renderers: unknown[] }).__renderers = [detail];
    });
    (window as unknown as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__ = hook;
  });
}

export interface PartInfo {
  componentId: string;
  role: string;
  visible: boolean;
  opacity: number;
  transparent: boolean;
  clippingPlanes: number;
  color: string;
  scaleY: number;
  /** Text drawn on a name plate (the tank capacity), if any. */
  plateText?: string;
}

/**
 * Rendered parts tagged by the viewer with `userData.componentId` and `userData.role`. Instanced
 * equipment (`userData.componentIds`, one per instance) is expanded to one entry per instance.
 */
export async function renderedParts(page: Page): Promise<PartInfo[]> {
  return page.evaluate(() => {
    const parts: PartInfo[] = [];
    type Node = {
      userData: Record<string, any>; visible: boolean; material?: Record<string, unknown>; scale: { y: number };
      isInstancedMesh?: boolean; count?: number; instanceColor?: unknown;
      traverse(f: (o: Node) => void): void;
    };
    const hex = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');
    for (const scene of (window as unknown as { __scenes: Node[] }).__scenes) {
      scene.traverse((o) => {
        if (!o.material) return;
        const m = o.material as { opacity: number; transparent: boolean; clippingPlanes: unknown[] | null; color?: { r: number; g: number; b: number; getHexString(): string } };
        if (o.isInstancedMesh && Array.isArray(o.userData?.componentIds)) {
          const ids = o.userData.componentIds as string[];
          for (let i = 0; i < Math.min(ids.length, o.count ?? 0); i++) {
            const e = (o as unknown as { instanceMatrix: { array: ArrayLike<number> } }).instanceMatrix.array;
            const scaleY = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
            let color = m.color ? `#${m.color.getHexString()}` : '';
            if (o.instanceColor && m.color) {
              // Instance and material colours are linear; report sRGB like Color.getHexString().
              const a = (o.instanceColor as { array: ArrayLike<number> }).array;
              const srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
              color = `#${hex(srgb(a[i * 3] * m.color.r))}${hex(srgb(a[i * 3 + 1] * m.color.g))}${hex(srgb(a[i * 3 + 2] * m.color.b))}`;
            }
            parts.push({ componentId: ids[i], role: o.userData.role, visible: o.visible && scaleY > 1e-6, opacity: m.opacity, transparent: m.transparent, clippingPlanes: m.clippingPlanes?.length ?? 0, color, scaleY, plateText: o.userData.plateText });
          }
          return;
        }
        if (!o.userData?.componentId) return;
        parts.push({
          componentId: o.userData.componentId,
          role: o.userData.role,
          visible: o.visible,
          opacity: m.opacity,
          transparent: m.transparent,
          clippingPlanes: m.clippingPlanes?.length ?? 0,
          color: m.color ? `#${m.color.getHexString()}` : '',
          scaleY: o.scale.y,
          plateText: o.userData.plateText,
        });
      });
    }
    return parts;
  });
}

/** GPU resource counts of every live Three.js renderer (collected by `installThreeHook`). */
export async function rendererMemory(page: Page): Promise<{ geometries: number; textures: number }[]> {
  return page.evaluate(() =>
    ((window as unknown as { __renderers?: { info: { memory: { geometries: number; textures: number } } }[] }).__renderers ?? []).map((r) => ({
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
    })),
  );
}
