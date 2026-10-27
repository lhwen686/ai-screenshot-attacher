import type { CSSProperties } from 'react';
import { Easing, interpolate, spring } from 'remotion';

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 over `duration` frames from `start`, easing out. */
export function rise(frame: number, start: number, duration = 18): number {
  return interpolate(frame, [start, start + duration], [0, 1], { ...CLAMP, easing: EASE_OUT });
}

/** 0 → 1 over `duration` frames from `start`, for movement between two points. */
export function travel(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration], [0, 1], { ...CLAMP, easing: EASE_IN_OUT });
}

/** 1 → 0 over `duration` frames from `start`. */
export function fadeOut(frame: number, start: number, duration = 12): number {
  return 1 - rise(frame, start, duration);
}

/** A springy 0 → 1 for elements that pop in at `start`. */
export function pop(frame: number, fps: number, start: number): number {
  return spring({ frame: frame - start, fps, config: { damping: 13, stiffness: 170, mass: 0.9 } });
}

/** A key going down at `start` and coming back up `hold` frames later. */
export function keyPress(frame: number, start: number, hold = 18): number {
  return rise(frame, start, 4) - rise(frame, start + hold, 6);
}

/** Opacity and offset for an element that fades up into place. */
export function enter(progress: number, distance = 28): CSSProperties {
  return { opacity: progress, translate: `0 ${(1 - progress) * distance}px` };
}

export function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
