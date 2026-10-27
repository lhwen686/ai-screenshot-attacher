import { Fragment } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, keyPress, pop, rise, travel } from '../anim';
import { Arrow } from '../components/icons';
import { KeyCombo } from '../components/Keycap';
import { COPY, type SceneProps } from '../copy';
import { BLUE, INK } from '../theme';

// Landscape opening: the usual routine, crossed out, then the shortcut.
export const HOOK_FRAMES = 150;

export function Hook({ locale }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = COPY[locale].hook;
  const strike = travel(frame, 72, 18);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 78 }}>
        <div
          style={{
            ...enter(rise(frame, 0)),
            maxWidth: 1600,
            color: INK,
            fontSize: 76,
            fontWeight: 750,
            lineHeight: 1.2,
            textAlign: 'center'
          }}
        >
          {text.title}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 26 }}>
          {text.steps.map((step, index) => {
            const progress = pop(frame, fps, 22 + index * 12);
            return (
              <Fragment key={step}>
                {index > 0 ? (
                  <span style={{ opacity: progress, color: '#94a3b8' }}>
                    <Arrow size={46} />
                  </span>
                ) : null}
                <span
                  style={{
                    padding: '24px 36px',
                    borderRadius: 24,
                    background: '#ffffff',
                    color: INK,
                    fontSize: 42,
                    fontWeight: 650,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 0 0 2px #dfe6f1, 0 22px 40px -26px rgba(15, 23, 42, 0.5)',
                    opacity: Math.min(progress * 1.3, 1) * (1 - 0.55 * strike),
                    scale: String(0.8 + 0.2 * progress)
                  }}
                >
                  {step}
                </span>
              </Fragment>
            );
          })}
          <div
            style={{
              position: 'absolute',
              left: -24,
              top: '50%',
              width: `calc((100% + 48px) * ${strike})`,
              height: 8,
              borderRadius: 999,
              background: '#ef4444',
              rotate: '-1.5deg',
              opacity: strike > 0 ? 1 : 0
            }}
          />
        </div>
        <div style={{ ...enter(rise(frame, 98)), display: 'flex', alignItems: 'center', gap: 40 }}>
          <span style={{ color: BLUE, fontSize: 66, fontWeight: 750 }}>{text.answer}</span>
          <KeyCombo
            keys={['Alt', 'Shift', 'A']}
            size={0.82}
            presses={[keyPress(frame, 116, 20), keyPress(frame, 121, 15), keyPress(frame, 126, 10)]}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
