import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, fadeOut, keyPress, mix, pop, rise, travel } from '../anim';
import { ATTACHED_THUMB, CHAT_HEIGHT, CHAT_WIDTH, ChatWindow } from '../components/ChatWindow';
import { KeyCombo } from '../components/Keycap';
import { ScreenshotArt } from '../components/ScreenshotArt';
import { COPY, msg, type SceneProps } from '../copy';
import { BLUE, INK, MUTED } from '../theme';

// The core flow: take a screenshot, press Alt+Shift+A, and the image lands in the AI composer, unsent.
export const DEMO_FRAMES = 480;

const T = {
  card: 24,
  select: 40,
  flash: 60,
  copied: 70,
  shrink: 84,
  keys: 128,
  press: 148,
  pulse: 166,
  fly: 176,
  attach: 198,
  toast: 206,
  toastOut: 330,
  keysOut: 214,
  type: 296,
  typeEnd: 368,
  notSent: 382,
  steps: [0, 126, 286]
};

const CARD = { width: 600, height: 412 };

const LAYOUTS = {
  landscape: {
    window: { x: 820, y: 130, scale: 1 },
    card: { x: 1080, y: 236 },
    chip: { x: 690, y: 850 },
    keys: { x: 1320, y: 540, size: 1.15 }
  },
  portrait: {
    window: { x: 80, y: 600, scale: 0.92 },
    card: { x: 240, y: 690 },
    chip: { x: 80, y: 1400 },
    keys: { x: 540, y: 1000, size: 1.05 }
  }
};

export function Demo({ locale, layout }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = COPY[locale].demo;
  const place = LAYOUTS[layout];
  const step = frame < T.steps[1] ? 0 : frame < T.steps[2] ? 1 : 2;

  // The screenshot card shrinks into the clipboard chip, then flies into the composer.
  const slot = { x: place.chip.x + 14, y: place.chip.y + 14 };
  const target = {
    x: place.window.x + ATTACHED_THUMB.x * place.window.scale,
    y: place.window.y + ATTACHED_THUMB.y * place.window.scale
  };
  const toChip = travel(frame, T.shrink, 26);
  const toComposer = travel(frame, T.fly, 28);
  const chipScale = ATTACHED_THUMB.width / CARD.width;
  const cardX = mix(mix(place.card.x, slot.x, toChip), target.x, toComposer);
  const cardY = mix(mix(place.card.y, slot.y, toChip), target.y, toComposer);
  const cardScale = mix(mix(1, chipScale, toChip), chipScale * place.window.scale, toComposer);
  const cardIn = pop(frame, fps, T.card);
  const selection = travel(frame, T.select, 20);
  const flash = rise(frame, T.flash, 3) * fadeOut(frame, T.flash + 4, 10);

  const chipIn = pop(frame, fps, T.copied) * fadeOut(frame, T.fly + 10, 10);
  const keysIn = pop(frame, fps, T.keys) * fadeOut(frame, T.keysOut, 12);
  const letters = Array.from(text.question);
  const typedShare = Math.min(Math.max((frame - T.type) / (T.typeEnd - T.type), 0), 1);
  const typed = letters.slice(0, Math.round(typedShare * letters.length)).join('');
  const typing = frame >= T.type && frame < T.typeEnd + 6;

  return (
    <AbsoluteFill>
      {layout === 'landscape' ? <StepList steps={text.steps} active={step} eyebrow={text.eyebrow} /> : null}
      {layout === 'portrait' ? <StepCaption steps={text.steps} eyebrow={text.eyebrow} /> : null}

      <div
        style={{
          position: 'absolute',
          left: place.window.x,
          top: place.window.y,
          width: CHAT_WIDTH,
          height: CHAT_HEIGHT,
          transformOrigin: 'left top',
          scale: String(place.window.scale),
          ...enter(rise(frame, 0, 22), 40)
        }}
      >
        <ChatWindow
          text={{ ...text, toast: msg(locale, 'attachSuccess') }}
          attach={rise(frame, T.attach, 14)}
          typed={typed}
          caret={frame >= T.fly + 24 && (typing || Math.floor(frame / 15) % 2 === 0)}
          toast={rise(frame, T.toast, 12) * fadeOut(frame, T.toastOut, 14)}
          notSent={rise(frame, T.notSent, 14)}
          pulse={frame >= T.pulse ? Math.min((frame - T.pulse) / 24, 1) : 0}
        />
      </div>

      {chipIn > 0.001 ? (
        <div
          style={{
            position: 'absolute',
            left: place.chip.x,
            top: place.chip.y,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            height: 94,
            padding: '0 28px 0 14px',
            borderRadius: 22,
            background: '#ffffff',
            boxShadow: '0 0 0 1px #dfe6f1, 0 24px 48px -24px rgba(15, 23, 42, 0.45)',
            opacity: Math.min(chipIn * 1.3, 1),
            scale: String(0.85 + 0.15 * chipIn),
            transformOrigin: 'left center'
          }}
        >
          <div style={{ width: ATTACHED_THUMB.width, height: ATTACHED_THUMB.height }} />
          <span style={{ color: INK, fontSize: 28, fontWeight: 650 }}>{text.copied}</span>
        </div>
      ) : null}

      {frame < T.fly + 30 ? (
        <div
          style={{
            position: 'absolute',
            left: cardX,
            top: cardY,
            width: CARD.width,
            height: CARD.height,
            transformOrigin: 'left top',
            scale: String(cardScale * (0.9 + 0.1 * cardIn)),
            opacity: Math.min(cardIn * 1.5, 1)
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: 18,
              boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.1), 0 40px 80px -30px rgba(15, 23, 42, 0.5)'
            }}
          >
            <ScreenshotArt width={CARD.width} height={CARD.height} />
            <div style={{ position: 'absolute', inset: 0, background: '#ffffff', opacity: flash * 0.85 }} />
          </div>
          {frame < T.shrink ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: 40,
                  top: 54,
                  width: (CARD.width - 80) * selection,
                  height: (CARD.height - 94) * selection,
                  border: `4px dashed ${BLUE}`,
                  background: 'rgba(37, 99, 235, 0.08)',
                  opacity: selection > 0 ? 1 : 0
                }}
              />
              <div style={{ position: 'absolute', left: '50%', top: CARD.height + 28, translate: '-50% 0' }}>
                <div style={enter(rise(frame, T.card + 4), 16)}>
                  <KeyCombo
                    keys={['Win', 'Shift', 'S']}
                    size={0.62}
                    presses={[
                      keyPress(frame, T.select - 10, 26),
                      keyPress(frame, T.select - 6, 22),
                      keyPress(frame, T.select - 2, 18)
                    ]}
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {keysIn > 0.001 ? (
        <div
          style={{
            position: 'absolute',
            left: place.keys.x,
            top: place.keys.y,
            translate: '-50% -50%',
            padding: 34,
            borderRadius: 40,
            background: 'rgba(255, 255, 255, 0.9)',
            boxShadow: '0 0 0 1px #dfe6f1, 0 40px 80px -30px rgba(15, 23, 42, 0.45)',
            opacity: Math.min(keysIn * 1.4, 1),
            scale: String(0.8 + 0.2 * keysIn)
          }}
        >
          <KeyCombo
            keys={['Alt', 'Shift', 'A']}
            size={place.keys.size}
            presses={[
              keyPress(frame, T.press, 30),
              keyPress(frame, T.press + 7, 23),
              keyPress(frame, T.press + 14, 16)
            ]}
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

type Step = { title: string; detail: string };

function StepList({ steps, active, eyebrow }: { steps: Step[]; active: number; eyebrow: string }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 120, top: 170, width: 640, display: 'grid', gap: 54 }}>
      <div style={{ ...enter(rise(frame, 0)), color: BLUE, fontSize: 32, fontWeight: 650, letterSpacing: '0.04em' }}>
        {eyebrow}
      </div>
      {steps.map((step, index) => {
        const on = index === active;
        const done = index < active;
        return (
          <div
            key={step.title}
            style={{
              ...enter(rise(frame, 4 + index * 6)),
              display: 'grid',
              gridTemplateColumns: '72px 1fr',
              gap: 26,
              alignItems: 'start'
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 72,
                height: 72,
                borderRadius: 999,
                background: on ? BLUE : done ? '#dbe7ff' : '#ffffff',
                color: on ? '#ffffff' : BLUE,
                fontSize: 34,
                fontWeight: 750,
                boxShadow: on ? '0 14px 28px -12px rgba(37, 99, 235, 0.8)' : '0 0 0 2px #dbe4f2'
              }}
            >
              {index + 1}
            </span>
            <div style={{ display: 'grid', gap: 8, opacity: on ? 1 : 0.5 }}>
              <span style={{ color: INK, fontSize: 46, fontWeight: 750, lineHeight: 1.2 }}>{step.title}</span>
              <span style={{ color: MUTED, fontSize: 30, lineHeight: 1.45 }}>{step.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCaption({ steps, eyebrow }: { steps: Step[]; eyebrow: string }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 80, top: 190, width: 920, height: 360 }}>
      <div style={{ ...enter(rise(frame, 0)), color: BLUE, fontSize: 36, fontWeight: 650, letterSpacing: '0.04em' }}>
        {eyebrow}
      </div>
      {steps.map((step, index) => {
        const start = T.steps[index];
        const end = T.steps[index + 1];
        const visible = rise(frame, start, 14) * (end === undefined ? 1 : fadeOut(frame, end - 8, 10));
        return (
          <div
            key={step.title}
            style={{
              position: 'absolute',
              top: 76,
              left: 0,
              right: 0,
              display: 'grid',
              gridTemplateColumns: '92px 1fr',
              gap: 30,
              ...enter(visible, 30)
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 92,
                height: 92,
                borderRadius: 999,
                background: BLUE,
                color: '#ffffff',
                fontSize: 46,
                fontWeight: 750,
                boxShadow: '0 16px 30px -12px rgba(37, 99, 235, 0.8)'
              }}
            >
              {index + 1}
            </span>
            <div style={{ display: 'grid', gap: 12 }}>
              <span style={{ color: INK, fontSize: 68, fontWeight: 750, lineHeight: 1.15 }}>{step.title}</span>
              <span style={{ color: MUTED, fontSize: 42, lineHeight: 1.4 }}>{step.detail}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
