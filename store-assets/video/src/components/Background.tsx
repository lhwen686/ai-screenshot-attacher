import { AbsoluteFill, useCurrentFrame } from 'remotion';

/** The store images' light (or dark) gradient, drifting slowly. */
export function Background({ dark = false }: { dark?: boolean }) {
  const drift = Math.sin(useCurrentFrame() / 80) * 3;
  return (
    <AbsoluteFill
      style={{
        background: dark
          ? `radial-gradient(70% 60% at ${90 + drift}% 0%, rgba(37, 99, 235, 0.42), transparent 62%), radial-gradient(60% 55% at ${2 - drift}% 100%, rgba(13, 148, 136, 0.3), transparent 62%), linear-gradient(160deg, #0b1324 0%, #111c33 100%)`
          : `radial-gradient(62% 56% at ${88 + drift}% 6%, rgba(37, 99, 235, 0.17), transparent 62%), radial-gradient(56% 50% at ${4 - drift}% 100%, rgba(13, 148, 136, 0.13), transparent 60%), linear-gradient(160deg, #f9fbff 0%, #eef3fb 100%)`
      }}
    />
  );
}
