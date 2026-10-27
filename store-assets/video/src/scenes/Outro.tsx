import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, pop, rise } from '../anim';
import { Check } from '../components/icons';
import { TargetChips } from '../components/TargetChips';
import { COPY, msg, targetNames, URL_TEXT, type SceneProps } from '../copy';
import { BLUE_DEEP, INK, MUTED, TEAL } from '../theme';

// Where to get it. The vertical video also sums up the privacy boundaries here.
export const OUTRO_FRAMES = 180;

export function Outro({ locale, layout }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const portrait = layout === 'portrait';
  const icon = pop(frame, fps, 0);
  const promises = [copy.privacy.cards[0][0], copy.privacy.cards[1][0], copy.privacy.cards[3][0]];
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          textAlign: 'center',
          marginTop: portrait ? 230 : 150
        }}
      >
        <Img
          src={staticFile('brand/icon.png')}
          style={{
            width: portrait ? 190 : 170,
            height: portrait ? 190 : 170,
            scale: String(0.6 + 0.4 * icon),
            opacity: Math.min(icon * 1.5, 1),
            filter: 'drop-shadow(0 26px 36px rgba(37, 99, 235, 0.35))'
          }}
        />
        <div
          style={{ ...enter(rise(frame, 6)), marginTop: 36, color: INK, fontSize: portrait ? 80 : 84, fontWeight: 750 }}
        >
          {msg(locale, 'extName')}
        </div>
        <div
          style={{
            ...enter(rise(frame, 12)),
            marginTop: 14,
            color: BLUE_DEEP,
            fontSize: portrait ? 46 : 44,
            fontWeight: 650
          }}
        >
          {copy.tagline}
        </div>

        {portrait ? (
          <div style={{ display: 'grid', gap: 26, marginTop: 70, justifyItems: 'start' }}>
            {promises.map((promise, index) => (
              <div
                key={promise}
                style={{
                  ...enter(rise(frame, 22 + index * 7)),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  color: INK,
                  fontSize: 48,
                  fontWeight: 700
                }}
              >
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 60,
                    height: 60,
                    borderRadius: 999,
                    background: `linear-gradient(140deg, #14b8a6, ${TEAL})`
                  }}
                >
                  <Check size={32} color="#ffffff" />
                </span>
                {promise}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 56, maxWidth: 1400 }}>
            <TargetChips names={targetNames(locale)} start={20} size={34} />
          </div>
        )}

        <div
          style={{
            ...enter(rise(frame, portrait ? 46 : 36)),
            marginTop: portrait ? 76 : 64,
            padding: portrait ? '24px 40px' : '22px 40px',
            borderRadius: 999,
            background: '#ffffff',
            color: BLUE_DEEP,
            fontSize: portrait ? 44 : 42,
            fontWeight: 700,
            boxShadow: '0 0 0 3px #bfd3fb, 0 26px 50px -30px rgba(37, 99, 235, 0.8)'
          }}
        >
          {URL_TEXT}
        </div>
        <div
          style={{
            ...enter(rise(frame, portrait ? 52 : 42)),
            marginTop: 26,
            color: MUTED,
            fontSize: portrait ? 36 : 32
          }}
        >
          {copy.outro.note}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: portrait ? 330 : 46,
          left: portrait ? 90 : 160,
          right: portrait ? 90 : 160,
          color: '#8a97ad',
          fontSize: portrait ? 24 : 22,
          lineHeight: 1.5,
          textAlign: 'center',
          opacity: rise(frame, 60, 20)
        }}
      >
        {copy.outro.disclaimer}
      </div>
    </AbsoluteFill>
  );
}
