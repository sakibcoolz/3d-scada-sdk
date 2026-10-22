import { isBuiltInKind, type ComponentInstance, type ComponentType } from '@sakibcoolz/core';
import { definitionFor, vesselProfile, type IndustrialComponentDefinition } from '@sakibcoolz/components';

/**
 * Liquid geometry of a vessel, read from its definition (`vesselProfile`: vertical walls, dished
 * heads, and horizontal shells, spheres and basins that hold liquid), so tank dimensions are followed.
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
export function vesselOf(type: ComponentType, properties: ComponentInstance['properties'] = {}): Vessel | undefined {
  // Registered host types (ADR-0022) are passive here: they neither hold nor move liquid.
  if (!isBuiltInKind(type)) return undefined;
  const def = definitionFor(type, properties);
  if (cache.has(def)) return cache.get(def) ?? undefined;
  const profile = def.bindable?.level === undefined ? undefined : vesselProfile(def.parts);
  if (!profile) {
    cache.set(def, null);
    return undefined;
  }
  const round = (n: number) => Math.round(n * 1e9) / 1e9;
  const bottom = profile.bottom;
  const height = round(profile.top - bottom);
  const volumeAt = (h: number) => profile.volumeAt(bottom + Math.min(height, Math.max(0, h)));
  const maxVolume = volumeAt(height);
  // A plain cylinder or box: volume is proportional to height, so keep the exact ratio.
  const cylinder = profile.linear;
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
