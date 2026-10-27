import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { Background } from '../components/Background';
import { Heading } from '../components/Heading';
import { NoChat, NoCloud, NoHistory, NoSend, Shield, ToggleOff } from '../components/icons';
import { COPY, type SceneProps } from '../copy';

// Landscape only: the six privacy boundaries from the store listing, on the dark background.
export const PRIVACY_FRAMES = 180;

const ICONS = [NoSend, NoChat, NoHistory, NoCloud, Shield, ToggleOff];

export function Privacy({ locale }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = COPY[locale].privacy;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <Background dark />
      <div style={{ marginTop: 120 }}>
        <Heading eyebrow={text.eyebrow} title={text.title} size={{ title: 84, lead: 36 }} align="center" dark />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 520px)', gap: 34, marginTop: 80 }}>
        {text.cards.map(([title, body], index) => {
          const progress = pop(frame, fps, 16 + index * 6);
          const Icon = ICONS[index];
          return (
            <div
              key={title}
              style={{
                display: 'grid',
                alignContent: 'start',
                gap: 14,
                minHeight: 250,
                padding: 34,
                borderRadius: 26,
                background: 'rgba(255, 255, 255, 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
                opacity: Math.min(progress * 1.4, 1),
                scale: String(0.9 + 0.1 * progress)
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 66,
                  height: 66,
                  marginBottom: 6,
                  borderRadius: 20,
                  background: 'linear-gradient(140deg, rgba(56, 189, 248, 0.28), rgba(20, 184, 166, 0.28))',
                  color: '#a5f3fc'
                }}
              >
                <Icon size={34} />
              </span>
              <strong style={{ color: '#ffffff', fontSize: 36, fontWeight: 700 }}>{title}</strong>
              <span style={{ color: '#b6c3d8', fontSize: 27, lineHeight: 1.5 }}>{body}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
