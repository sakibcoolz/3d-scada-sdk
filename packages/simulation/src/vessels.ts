import type { ComponentInstance, ComponentKind } from '@scada3d/core';
import { definitionFor, segmentVolume, vesselSegments, type IndustrialComponentDefinition } from '@scada3d/components';

/**
 * Liquid geometry of a vertical vessel, read from its definition (`vesselSegments`: open cylinder
 * and cone shells and dished lathe heads stacked along +Y), so tank dimensions are followed.
 * Heights are measured from the lowest point the liquid can reach.
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

const cache = new WeakMap<IndustrialComponentDefinition, Vessel | null>();

/** The vessel shape of a component, or undefined if it holds no liquid. Dimensions come from `properties`. */
export function vesselOf(type: ComponentKind, properties: ComponentInstance['properties'] = {}): Vessel | undefined {
  const def = definitionFor(type, properties);
  if (cache.has(def)) return cache.get(def) ?? undefined;
  const segments = def.bindable?.level === undefined ? [] : vesselSegments(def.parts);
  if (segments.length === 0) {
    cache.set(def, null);
    return undefined;
  }
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const bottom = segments[0].y0;
  const height = round(segments[segments.length - 1].y1 - bottom);
  const volumeAt = (h: number) => {
    const y = bottom + Math.min(height, Math.max(0, h));
    return segments.reduce((sum, s) => sum + (y <= s.y0 ? 0 : segmentVolume(s, Math.min(y, s.y1) - s.y0)), 0);
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
  cache.set(def, vessel);
  return vessel;
}
