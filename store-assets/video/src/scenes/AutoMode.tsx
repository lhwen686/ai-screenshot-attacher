import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, mix, pop, rise, travel } from '../anim';
import { Cursor } from '../components/Cursor';
import { Heading } from '../components/Heading';
import { Arrow, Check, Clip, Send, ToggleOff } from '../components/icons';
import { ScreenshotArt } from '../components/ScreenshotArt';
import { UiLayer } from '../components/UiLayer';
import { COPY, type SceneProps } from '../copy';
import { getLayer, getRegion } from '../layers';
import { BLUE, CARD_SHADOW, INK, TEAL } from '../theme';

// The real settings section: automatic mode is switched on, then a new screenshot attaches by itself.
export const AUTO_FRAMES = 240;

const T = { cursor: 30, arrive: 76, click: 82, swap: 88, shot: 118, fly: 148, attach: 170, tag: 182 };
const THUMB = { width: 96, height: 66 };
// Border, padding, the attachment chip, its gap, and the text row, as in the chat window's composer.
const COMPOSER_HEIGHT = 2 + 18 + 88 + 14 + 48 + 16;

export function AutoMode({ locale, layout }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = COPY[locale].auto;
  const demo = COPY[locale].demo;
  const off = getLayer('settings-off', locale);
  const on = getLayer('settings-on', locale);
  const portrait = layout === 'portrait';

  const settings = portrait ? { x: 142, y: 660, scale: 1.4 } : { x: 950, y: 110, scale: 1.5 };
  const flow = portrait ? { x: 80, y: 1235, card: 200, right: 1000 } : { x: 950, y: 740, card: 220, right: 1802 };
  const composer = { x: flow.x + flow.card + 110, y: flow.y, width: flow.right - (flow.x + flow.card + 110) };

  const toggle = getRegion(off, 'autoToggleInput');
  const row = getRegion(off, 'autoToggle');
  const toggleCenter = {
    x: settings.x + (toggle.x + toggle.width / 2) * settings.scale,
    y: settings.y + (toggle.y + toggle.height / 2) * settings.scale
  };
  const start = portrait ? { x: 880, y: 1560 } : { x: 1640, y: 1010 };
  const move = travel(frame, T.cursor, T.arrive - T.cursor);
  const swap = rise(frame, T.swap, 8);
  const highlight = rise(frame, T.swap + 4, 12);

  // The new screenshot drops in beside the composer, then flies into its attachment slot.
  const shotIn = pop(frame, fps, T.shot);
  const fly = travel(frame, T.fly, 24);
  const cardHeight = (flow.card * 110) / 160;
  const cardTop = flow.y + (COMPOSER_HEIGHT - cardHeight) / 2;
  const slot = { x: composer.x + 32, y: composer.y + 30 };
  const shotScale = mix(1, THUMB.width / flow.card, fly);
  const attach = rise(frame, T.attach, 12);
  const flowLabels = Math.min(shotIn * 1.4, 1) * (1 - rise(frame, T.fly + 18, 12));

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          ...(portrait ? { left: 80, top: 170, width: 920 } : { left: 120, top: 200, width: 700 })
        }}
      >
        <Heading
          eyebrow={text.eyebrow}
          title={text.title}
          lead={text.lead}
          size={portrait ? { title: 92, lead: 42 } : { title: 92, lead: 38 }}
          start={4}
        />
        <div
          style={{
            ...enter(rise(frame, 20)),
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 40,
            padding: '14px 24px',
            borderRadius: 999,
            background: '#e6fbf6',
            color: '#0f766e',
            fontSize: portrait ? 34 : 30,
            fontWeight: 650,
            boxShadow: 'inset 0 0 0 2px #b4ecdf'
          }}
        >
          <ToggleOff size={portrait ? 34 : 30} />
          {text.badge}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: settings.x,
          top: settings.y,
          width: off.width * settings.scale,
          height: off.height * settings.scale,
          borderRadius: 10 * settings.scale,
          boxShadow: CARD_SHADOW,
          ...enter(rise(frame, 6, 20), 40)
        }}
      >
        <UiLayer layer={off} scale={settings.scale} style={{ position: 'absolute', opacity: 1 - swap }} />
        <UiLayer layer={on} scale={settings.scale} style={{ position: 'absolute', opacity: swap }} />
        <div
          style={{
            position: 'absolute',
            left: (row.x - 3) * settings.scale,
            top: (row.y - 3) * settings.scale,
            width: (row.width + 6) * settings.scale,
            height: (row.height + 6) * settings.scale,
            borderRadius: 10 * settings.scale,
            border: `${3 * settings.scale}px solid ${BLUE}`,
            boxShadow: `0 0 0 ${6 * settings.scale}px rgba(37, 99, 235, 0.16)`,
            opacity: highlight,
            scale: String(1.03 - 0.03 * highlight)
          }}
        />
      </div>

      <div style={{ position: 'absolute', left: flow.x, top: cardTop + cardHeight + 16, opacity: flowLabels }}>
        <span style={{ color: INK, fontSize: portrait ? 34 : 30, fontWeight: 650 }}>{text.newShot}</span>
      </div>
      <span
        style={{
          position: 'absolute',
          left: flow.x + flow.card + 25,
          top: flow.y + COMPOSER_HEIGHT / 2 - 30,
          color: '#94a3b8',
          opacity: flowLabels
        }}
      >
        <Arrow size={60} />
      </span>

      <div
        style={{
          position: 'absolute',
          left: composer.x,
          top: composer.y,
          width: composer.width,
          display: 'grid',
          gap: 14,
          padding: '18px 22px 16px',
          border: '1px solid #dfe6f1',
          borderRadius: 30,
          background: '#ffffff',
          boxShadow: '0 30px 60px -30px rgba(15, 23, 42, 0.45)',
          ...enter(rise(frame, 100, 18), 30)
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            width: 'max-content',
            height: 88,
            padding: '0 20px 0 8px',
            border: '1px solid #d6e2f8',
            borderRadius: 18,
            background: '#f5f8ff',
            opacity: attach
          }}
        >
          <div style={{ overflow: 'hidden', borderRadius: 12, boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.08)' }}>
            <ScreenshotArt width={THUMB.width} height={THUMB.height} />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ color: '#1e293b', fontSize: 21, fontWeight: 600 }}>{demo.file}</strong>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: TEAL, fontSize: 19, fontWeight: 650 }}>
              <Check size={18} />
              {demo.attached}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#9aa6b8', fontSize: 24 }}>
            <Clip size={28} />
            {demo.placeholder}
          </span>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 48,
              height: 48,
              borderRadius: 999,
              background: '#e8edf5',
              color: '#9aa6b8'
            }}
          >
            <Send size={22} />
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: composer.x + 24,
          top: composer.y + COMPOSER_HEIGHT + 20,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 22px',
          borderRadius: 999,
          background: TEAL,
          color: '#ffffff',
          fontSize: portrait ? 32 : 28,
          fontWeight: 700,
          ...enter(rise(frame, T.tag, 14), 18)
        }}
      >
        <Check size={portrait ? 30 : 26} color="#ffffff" />
        {text.autoTag}
      </div>

      {frame < T.fly + 26 ? (
        <div
          style={{
            position: 'absolute',
            left: mix(flow.x, slot.x, fly),
            top: mix(cardTop, slot.y, fly),
            width: flow.card,
            height: cardHeight,
            overflow: 'hidden',
            borderRadius: 16,
            transformOrigin: 'left top',
            scale: String(shotScale * (0.85 + 0.15 * shotIn)),
            opacity: Math.min(shotIn * 1.5, 1),
            boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.1), 0 30px 60px -26px rgba(15, 23, 42, 0.5)'
          }}
        >
          <ScreenshotArt width={flow.card} height={cardHeight} />
        </div>
      ) : null}

      <Cursor
        x={mix(start.x, toggleCenter.x, move)}
        y={mix(start.y, toggleCenter.y, move)}
        size={portrait ? 1.15 : 1}
        opacity={rise(frame, T.cursor - 6, 8) * (1 - rise(frame, T.swap + 18, 12))}
        click={frame >= T.click ? Math.min((frame - T.click) / 18, 1) : 0}
      />
    </AbsoluteFill>
  );
}
