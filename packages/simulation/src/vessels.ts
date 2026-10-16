import type { ComponentKind } from '@scada3d/core';
import { componentCatalog } from '@scada3d/components';

/**
 * Liquid geometry of a vertical vessel, read from the catalog: the open cylinder and cone shell
 * parts stacked along +Y. Heights are measured from the lowest point the liquid can reach.
 */
export interface Vessel {
  /** Liquid height range, metres. */
  height: number;
  /** Local y of height 0 (the vessel's lowest liquid point). */
  bottom: number;
  maxVolume: number;
  /** m³ held up to height h. */
  volumeAt(h: number): number;
  /** Height of a volume (inverse of volumeAt). */
  heightAt(volume: number): number;
  /** Height of a port above the bottom, clamped to the liquid range (a top inlet = full height). */
  portHeight(portId: string): number;
  /** Level in percent of the height (as drawn) for a volume; exact for a plain cylinder. */
  percentAt(volume: number): number;
  /** Volume for a level in percent of the height. */
  volumeAtPercent(percent: number): number;
}

type Segment = { y0: number; y1: number; r0: number; r1: number };

const frustum = (s: Segment, t: number) => {
  // Volume of the first t metres of a cone frustum.
  const rt = s.r0 + ((s.r1 - s.r0) * t) / (s.y1 - s.y0);
  return (Math.PI / 3) * t * (s.r0 * s.r0 + s.r0 * rt + rt * rt);
};

const cache = new Map<ComponentKind, Vessel | undefined>();

/** The vessel shape of a component type, or undefined if it holds no liquid. */
export function vesselOf(type: ComponentKind): Vessel | undefined {
  if (cache.has(type)) return cache.get(type);
  const def = componentCatalog[type];
  const segments: Segment[] = def.bindable?.level === undefined ? [] : def.parts.flatMap((p): Segment[] => {
    if (p.role !== 'shell') return [];
    if (p.shape === 'cylinder' && p.axis === 'y' && p.openEnded) return [{ y0: p.center[1] - p.length / 2, y1: p.center[1] + p.length / 2, r0: p.radius, r1: p.radius }];
    if (p.shape === 'cone' && p.axis === 'y' && p.openEnded) return [{ y0: p.center[1] - p.length / 2, y1: p.center[1] + p.length / 2, r0: p.radiusStart, r1: p.radiusEnd }];
    return [];
  }).sort((a, b) => a.y0 - b.y0);
  if (segments.length === 0) {
    cache.set(type, undefined);
    return undefined;
  }
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const bottom = segments[0].y0;
  const height = round(segments[segments.length - 1].y1 - bottom);
  const volumeAt = (h: number) => {
    const y = bottom + Math.min(height, Math.max(0, h));
    return segments.reduce((sum, s) => sum + (y <= s.y0 ? 0 : frustum(s, Math.min(y, s.y1) - s.y0)), 0);
  };
  const maxVolume = volumeAt(height);
  // A single straight cylinder: volume is proportional to height, so keep the exact ratio.
  const cylinder = segments.length === 1 && segments[0].r0 === segments[0].r1;
  const vessel: Vessel = {
    height,
    bottom,
    maxVolume,
    volumeAt,
    heightAt(volume) {
      if (volume <= 0) return 0;
      if (volume >= maxVolume) return height;
      let lo = 0, hi = height;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (volumeAt(mid) < volume) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    },
    percentAt(volume) {
      return cylinder ? (100 * volume) / maxVolume : (100 * vessel.heightAt(volume)) / height;
    },
    volumeAtPercent(percent) {
      return cylinder ? (percent / 100) * maxVolume : volumeAt((percent / 100) * height);
    },
    portHeight(portId) {
      const port = def.ports.find((p) => p.id === portId);
      return port ? round(Math.min(height, Math.max(0, port.position[1] - bottom))) : 0;
    },
  };
  cache.set(type, vessel);
  return vessel;
}
