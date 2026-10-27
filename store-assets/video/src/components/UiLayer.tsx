import type { CSSProperties } from 'react';
import { Img, staticFile } from 'remotion';
import type { Layer } from '../layers';

/** A capture of the real extension UI, drawn at `scale` times its CSS size. */
export function UiLayer({ layer, scale, style }: { layer: Layer; scale: number; style?: CSSProperties }) {
  return (
    <Img
      src={staticFile(layer.file)}
      style={{ display: 'block', width: layer.width * scale, height: layer.height * scale, ...style }}
    />
  );
}
