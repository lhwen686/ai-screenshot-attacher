import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, pop, rise } from '../anim';
import { TargetChips } from '../components/TargetChips';
import { COPY, msg, targetNames, type SceneProps } from '../copy';
import { BLUE_DEEP, INK, MUTED } from '../theme';

// The extension's icon, name, and promise. In the vertical video this is also the opening hook.
export const INTRO_FRAMES = 120;

export function Intro({ locale, layout }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const icon = pop(frame, fps, 0);
  const portrait = layout === 'portrait';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', marginTop: portrait ? -220 : 0 }}>
        <Img
          src={staticFile('brand/icon.png')}
          style={{
            width: portrait ? 230 : 210,
            height: portrait ? 230 : 210,
            scale: String(0.6 + 0.4 * icon),
            opacity: Math.min(icon * 1.5, 1),
            filter: 'drop-shadow(0 30px 40px rgba(37, 99, 235, 0.35))'
          }}
        />
        {portrait ? (
          <>
            <div style={{ ...enter(rise(frame, 8)), marginTop: 40, color: MUTED, fontSize: 50, fontWeight: 650 }}>
              {msg(locale, 'extName')}
            </div>
            <div
              style={{
                ...enter(rise(frame, 14)),
                marginTop: 34,
                color: INK,
                fontSize: 96,
                fontWeight: 750,
                lineHeight: 1.2,
                whiteSpace: 'pre-line'
              }}
            >
              {COPY[locale].shortHook}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...enter(rise(frame, 8)), marginTop: 48, color: INK, fontSize: 100, fontWeight: 750 }}>
              {msg(locale, 'extName')}
            </div>
            <div style={{ ...enter(rise(frame, 14)), marginTop: 18, color: BLUE_DEEP, fontSize: 52, fontWeight: 650 }}>
              {COPY[locale].tagline}
            </div>
          </>
        )}
        <div style={{ marginTop: portrait ? 70 : 64, maxWidth: portrait ? 1000 : 1400 }}>
          <TargetChips names={targetNames(locale)} start={24} size={portrait ? 35 : 38} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
