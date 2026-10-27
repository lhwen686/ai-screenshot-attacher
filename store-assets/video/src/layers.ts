import layers from './ui-layers.json';
import type { Locale } from './copy';

export type Region = { x: number; y: number; width: number; height: number };
export type Layer = { file: string; width: number; height: number; regions: Record<string, Region> };

// Captures of the real popup and settings section, made by store-assets/source/video-layers.html.
export function getLayer(id: string, locale: Locale): Layer {
  const layer = (layers as Record<string, Layer>)[`${id}-${locale}`];
  if (!layer) {
    throw new Error(`Missing UI layer ${id}-${locale}. Capture it with store-assets/source/video-layers.html.`);
  }
  return layer;
}

export function getRegion(layer: Layer, name: string): Region {
  const region = layer.regions[name];
  if (!region) {
    throw new Error(`UI layer ${layer.file} has no region "${name}".`);
  }
  return region;
}
