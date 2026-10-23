import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { expect, test } from '@playwright/test';
import { installThreeHook, waitForCanvas } from '../e2e/helpers';

interface Result {
  scene: string;
  frames: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  heapMB: number | null;
  geometries: number;
  /** Per frame, averaged over the sample window. */
  drawCalls: number;
  triangles: number;
  /** From navigation until the canvas is shown (validation, digest, first render). */
  loadMs: number;
}

const results: Result[] = [];
let gpu = 'unknown';

for (const [scene, url] of [
  ['demo (6 components, live flow)', '/?demo'],
  ['chain-200 (200 valves, 199 animated routes)', '/?generate=200'],
  ['chain-1000 (1000 valves, 999 animated routes)', '/?generate=1000'],
  // The locked runtime (T-095): digest-pinned, with status and the demo feed. 5000 is the playground's cap.
  ['runtime chain-1000 (ScadaRuntime, pinned)', '/?runtime&generate=1000'],
  ['runtime chain-5000 (ScadaRuntime, pinned)', '/?runtime&generate=5000'],
] as const) {
  test(`frame time: ${scene}`, async ({ page }) => {
    test.setTimeout(120_000);
    await installThreeHook(page);
    const started = Date.now();
    await page.goto(url);
    // The runtime shares its row with the information panel, so its canvas is narrower than <main>.
    if (url.includes('runtime')) await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
    else await waitForCanvas(page);
    const loadMs = Date.now() - started;
    await page.waitForTimeout(1500); // warm up: shader compile, first uploads
    gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const sample = await page.evaluate(
      () =>
        new Promise<{ deltas: number[]; heap: number | null; info: { geometries: number; calls: number; triangles: number } }>((resolve) => {
          const deltas: number[] = [];
          // Accumulate draw calls over the window: info normally resets on every render() call,
          // and the axis gizmo renders a second pass each frame.
          const renderer = (window as unknown as { __renderers: { info: { autoReset: boolean; reset(): void } }[] }).__renderers[0];
          renderer.info.autoReset = false;
          renderer.info.reset();
          let last = performance.now();
          const end = last + 3000;
          const tick = (now: number) => {
            deltas.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick);
            else {
              const r = (window as unknown as { __renderers: { info: { memory: { geometries: number }; render: { calls: number; triangles: number } } }[] }).__renderers[0];
              const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
              const frames = Math.max(1, deltas.length);
              resolve({ deltas, heap: memory ? memory.usedJSHeapSize : null, info: { geometries: r.info.memory.geometries, calls: Math.round(r.info.render.calls / frames), triangles: Math.round(r.info.render.triangles / frames) } });
              renderer.info.autoReset = true;
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    const sorted = [...sample.deltas].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const result: Result = {
      scene,
      frames: sorted.length,
      medianMs: +at(0.5).toFixed(2),
      p95Ms: +at(0.95).toFixed(2),
      maxMs: +sorted[sorted.length - 1].toFixed(2),
      heapMB: sample.heap === null ? null : +(sample.heap / 1048576).toFixed(1),
      geometries: sample.info.geometries,
      drawCalls: sample.info.calls,
      triangles: sample.info.triangles,
      loadMs,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    // Recorded, not asserted: only check that the scene rendered at all.
    expect(result.frames).toBeGreaterThan(1);
  });
}

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const record = { date: new Date().toISOString(), cpu: cpus()[0]?.model, cores: cpus().length, gpu, results };
  writeFileSync('test-results/perf.json', `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ cpu: record.cpu, cores: record.cores, gpu }));
});
