/**
 * Display-only appearance rules. Nothing here is saved into the scene or reflects plant physics:
 * view modes change how shells are drawn, and the heat tint is a colour legend, not a simulation.
 */

export type ViewMode = 'normal' | 'glass' | 'xray' | 'cutaway';
export const viewModes: readonly ViewMode[] = ['normal', 'glass', 'xray', 'cutaway'];

/** A per-component override (editor display state) wins over the global mode. */
export function effectiveViewMode(global: ViewMode, override?: ViewMode): ViewMode {
  return override ?? global;
}

export interface ShellLook {
  opacity: number;
  transparent: boolean;
  /** Transparent shells skip depth writes so the liquid inside stays visible. */
  depthWrite: boolean;
  metalness: number;
  /** Draw edge outlines (x-ray). */
  edges: boolean;
  /** Clip away the front half (cutaway). */
  clip: boolean;
}

const looks: Record<ViewMode, ShellLook> = {
  normal: { opacity: 1, transparent: false, depthWrite: true, metalness: 0.65, edges: false, clip: false },
  glass: { opacity: 0.21, transparent: true, depthWrite: false, metalness: 0, edges: false, clip: false },
  xray: { opacity: 0.06, transparent: true, depthWrite: false, metalness: 0, edges: true, clip: false },
  cutaway: { opacity: 1, transparent: false, depthWrite: true, metalness: 0.65, edges: false, clip: true },
};

export function shellLook(mode: ViewMode): ShellLook {
  return looks[mode];
}

export type LiquidFill = { status: 'ok' | 'clamped'; fraction: number } | { status: 'missing' | 'invalid'; fraction?: undefined };

/**
 * Level policy: a finite number of percent is drawn, clamped to 0–100 and flagged `clamped` when
 * outside; a missing or non-numeric level draws no liquid at all rather than an assumed one.
 */
export function liquidFill(level: unknown): LiquidFill {
  if (level === undefined) return { status: 'missing' };
  if (typeof level !== 'number' || !Number.isFinite(level)) return { status: 'invalid' };
  const clamped = Math.min(100, Math.max(0, level));
  return { status: clamped === level ? 'ok' : 'clamped', fraction: clamped / 100 };
}

/** Temperature legend range in °C; values outside it take the end colours. */
export const HEAT_RANGE_C = { min: 0, max: 100 } as const;

const cold = [0x33, 0x99, 0xff];
const hot = [0xff, 0x33, 0x33];

/** Liquid tint for a temperature in °C, blending blue (cold) to red (hot); undefined if not a finite number. */
export function heatColor(celsius: unknown): string | undefined {
  if (typeof celsius !== 'number' || !Number.isFinite(celsius)) return undefined;
  const t = (Math.min(HEAT_RANGE_C.max, Math.max(HEAT_RANGE_C.min, celsius)) - HEAT_RANGE_C.min) / (HEAT_RANGE_C.max - HEAT_RANGE_C.min);
  return `#${cold.map((c, i) => Math.round(c + (hot[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
}
