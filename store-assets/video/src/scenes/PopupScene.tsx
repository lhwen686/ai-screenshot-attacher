import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { enter, mix, rise, travel } from '../anim';
import { Cursor } from '../components/Cursor';
import { Heading } from '../components/Heading';
import { UiLayer } from '../components/UiLayer';
import { COPY, type SceneProps } from '../copy';
import { getLayer, getRegion } from '../layers';
import { BLUE, CARD_SHADOW } from '../theme';

// The real popup: the cursor clicks "Attach to Claude" and the result panel confirms the attachment.
export const POPUP_FRAMES = 240;

const T = { cursor: 34, arrive: 84, click: 90, swap: 98, highlight: 110 };

export function PopupScene({ locale, layout }: SceneProps) {
  const frame = useCurrentFrame();
  const text = COPY[locale].popup;
  const before = getLayer('popup-before', locale);
  const after = getLayer('popup-after', locale);
  const portrait = layout === 'portrait';
  // As large as fits: the popup grows when the result panel fills in, and the English one is taller.
  // The vertical video keeps the bottom of the frame clear for the player's own captions and buttons.
  const scale = portrait ? Math.min(1.55, 1060 / after.height) : Math.min(1.35, 960 / after.height);
  const left = portrait ? (1080 - before.width * scale) / 2 : 250;
  const top = portrait ? 440 : (1080 - after.height * scale) / 2;

  const button = getRegion(before, 'quickClaude');
  const result = getRegion(after, 'result');
  const buttonCenter = {
    x: left + (button.x + button.width / 2) * scale,
    y: top + (button.y + button.height / 2) * scale
  };
  const start = portrait ? { x: 960, y: 1560 } : { x: 1540, y: 980 };
  const move = travel(frame, T.cursor, T.arrive - T.cursor);
  const swap = rise(frame, T.swap, 10);
  const pressed = rise(frame, T.click, 3) - rise(frame, T.click + 6, 6);
  const highlight = rise(frame, T.highlight, 14);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          ...(portrait ? { left: 80, top: 150, width: 920 } : { left: 900, top: 300, width: 860 })
        }}
      >
        <Heading
          eyebrow={text.eyebrow}
          title={text.title}
          lead={portrait ? undefined : text.lead}
          size={portrait ? { title: 80, lead: 36 } : { title: 88, lead: 38 }}
          start={6}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: before.width * scale,
          height: mix(before.height, after.height, swap) * scale,
          overflow: 'hidden',
          borderRadius: 24,
          background: '#f7f8fb',
          boxShadow: `0 0 0 1px rgba(15, 23, 42, 0.1), ${CARD_SHADOW}`,
          ...enter(rise(frame, 0, 20), 50)
        }}
      >
        <UiLayer layer={before} scale={scale} style={{ position: 'absolute', left: 0, top: 0, opacity: 1 - swap }} />
        <UiLayer layer={after} scale={scale} style={{ position: 'absolute', left: 0, top: 0, opacity: swap }} />
        <div
          style={{
            position: 'absolute',
            left: button.x * scale,
            top: button.y * scale,
            width: button.width * scale,
            height: button.height * scale,
            borderRadius: 8 * scale,
            background: 'rgba(37, 99, 235, 0.14)',
            opacity: pressed
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: (result.x - 5) * scale,
            top: (result.y - 5) * scale,
            width: (result.width + 10) * scale,
            height: (result.height + 10) * scale,
            borderRadius: 12 * scale,
            border: `${3 * scale}px solid ${BLUE}`,
            boxShadow: `0 0 0 ${6 * scale}px rgba(37, 99, 235, 0.16)`,
            opacity: highlight,
            scale: String(1.04 - 0.04 * highlight)
          }}
        />
      </div>

      <Cursor
        x={mix(start.x, buttonCenter.x + 40, move)}
        y={mix(start.y, buttonCenter.y + 6, move)}
        size={portrait ? 1.15 : 1}
        opacity={rise(frame, T.cursor - 6, 8) * (1 - rise(frame, T.highlight + 20, 12))}
        click={frame >= T.click ? Math.min((frame - T.click) / 18, 1) : 0}
      />
    </AbsoluteFill>
  );
}
