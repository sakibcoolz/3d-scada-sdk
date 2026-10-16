import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/** Canvas size for a 0.5 × 0.16 m name plate. */
const WIDTH = 512;
const HEIGHT = 164;

/** Draws `text` centred on a plate-coloured canvas, shrunk to fit; undefined without a DOM. */
export function createPlateTexture(text: string): CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) return undefined;
  g.fillStyle = '#e8edf2';
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.fillStyle = '#1d2a36';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 84;
  g.font = `600 ${size}px system-ui, sans-serif`;
  while (size > 24 && g.measureText(text).width > WIDTH * 0.88) g.font = `600 ${(size -= 4)}px system-ui, sans-serif`;
  g.fillText(text, WIDTH / 2, HEIGHT / 2 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A plate texture for `text` owned by the calling component: created on change, disposed after. */
export function usePlateTexture(text: string | undefined): CanvasTexture | undefined {
  const texture = useMemo(() => (text ? createPlateTexture(text) : undefined), [text]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
