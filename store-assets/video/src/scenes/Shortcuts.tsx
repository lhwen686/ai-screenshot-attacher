import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, keyPress, pop, rise } from '../anim';
import { Arrow } from '../components/icons';
import { Heading } from '../components/Heading';
import { KeyCombo } from '../components/Keycap';
import { COPY, msg, type SceneProps } from '../copy';
import { BLUE, INK, MUTED } from '../theme';

// Landscape only: the default shortcuts, as in the store's shortcut screenshot.
export const SHORTCUTS_FRAMES = 165;

export function Shortcuts({ locale }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = COPY[locale].shortcuts;
  const rows: [string, string][] = [
    ['A', msg(locale, 'popupDefaultTarget')],
    ['1', 'ChatGPT'],
    ['2', 'Claude'],
    ['3', 'Gemini']
  ];
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ marginTop: 130 }}>
        <Heading eyebrow={text.eyebrow} title={text.title} size={{ title: 84, lead: 36 }} align="center" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '46px 110px', marginTop: 90 }}>
        {rows.map(([key, label], index) => {
          const start = 18 + index * 10;
          const progress = pop(frame, fps, start);
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                opacity: Math.min(progress * 1.4, 1),
                translate: `0 ${(1 - progress) * 30}px`
              }}
            >
              <KeyCombo keys={['Alt', 'Shift', key]} size={0.86} presses={[0, 0, keyPress(frame, start + 14, 12)]} />
              <span style={{ color: '#94a3b8' }}>
                <Arrow size={44} />
              </span>
              <span
                style={{
                  padding: '18px 28px',
                  borderRadius: 20,
                  background: '#ffffff',
                  color: index === 0 ? BLUE : INK,
                  fontSize: 38,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 0 0 2px #dfe6f1'
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          ...enter(rise(frame, 70)),
          marginTop: 84,
          maxWidth: 1400,
          padding: '22px 32px',
          borderRadius: 20,
          background: 'rgba(255, 255, 255, 0.75)',
          color: MUTED,
          fontSize: 32,
          lineHeight: 1.5,
          textAlign: 'center',
          boxShadow: 'inset 0 0 0 2px #dfe6f1'
        }}
      >
        {text.note}
      </div>
    </AbsoluteFill>
  );
}
