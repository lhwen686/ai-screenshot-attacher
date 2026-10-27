import { Img, staticFile } from 'remotion';
import { BLUE, CARD_SHADOW, TEAL } from '../theme';
import { Check, Clip, Lock, Puzzle, Send } from './icons';
import { ScreenshotArt } from './ScreenshotArt';

// A generic AI chat page in a browser window, like the store images: no real site's branding.
// It is laid out at this design size; scenes scale the whole window when they need it smaller.
export const CHAT_WIDTH = 1000;
export const CHAT_HEIGHT = 820;
const BAR = 64;
const SIDEBAR = 210;
const INSET = 34;
const PAD = { top: 18, side: 22, bottom: 16 };
const ROW = 48;
const CHIP = 88;
const CHIP_GAP = 14;
const THUMB = { width: 96, height: 66, left: 8 };
const FULL_COMPOSER = 2 + PAD.top + CHIP + CHIP_GAP + ROW + PAD.bottom;

/** Where the attachment's thumbnail ends up inside the window, for the screenshot flying into it. */
export const ATTACHED_THUMB = {
  x: SIDEBAR + INSET + 1 + PAD.side + 1 + THUMB.left,
  y: CHAT_HEIGHT - INSET - FULL_COMPOSER + 1 + PAD.top + (CHIP - THUMB.height) / 2,
  width: THUMB.width,
  height: THUMB.height
};

type ChatWindowProps = {
  text: { address: string; placeholder: string; file: string; attached: string; notSent: string; toast: string };
  /** 0 → 1: the attachment grows into the composer. */
  attach: number;
  typed: string;
  caret: boolean;
  /** 0 → 1 each: the page notice, the "not sent" tag, and a highlight on the extension's toolbar icon. */
  toast: number;
  notSent: number;
  pulse: number;
};

export function ChatWindow({ text, attach, typed, caret, toast, notSent, pulse }: ChatWindowProps) {
  const chipRow = (CHIP + CHIP_GAP) * attach;
  const composerHeight = 2 + PAD.top + chipRow + ROW + PAD.bottom;
  return (
    <div
      style={{
        position: 'relative',
        width: CHAT_WIDTH,
        height: CHAT_HEIGHT,
        overflow: 'hidden',
        borderRadius: 26,
        background: '#ffffff',
        boxShadow: `0 0 0 1px rgba(15, 23, 42, 0.08), ${CARD_SHADOW}`
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          height: BAR,
          padding: '0 22px',
          background: '#f4f6fb',
          boxShadow: 'inset 0 -1px 0 #e8edf5'
        }}
      >
        <div style={{ display: 'flex', gap: 9 }}>
          {['#f87171', '#fbbf24', '#34d399'].map((color) => (
            <i key={color} style={{ width: 15, height: 15, borderRadius: 999, background: color }} />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            gap: 10,
            height: 38,
            padding: '0 16px',
            borderRadius: 999,
            background: '#ffffff',
            boxShadow: 'inset 0 0 0 1px #e2e8f0',
            color: '#7a879c',
            fontSize: 19
          }}
        >
          <Lock size={17} />
          <span>{text.address}</span>
        </div>
        <Puzzle size={24} color="#8b97ab" />
        <div style={{ position: 'relative', width: 44, height: 44 }}>
          {pulse > 0 && pulse < 1 ? (
            <div
              style={{
                position: 'absolute',
                inset: -10 - 18 * pulse,
                borderRadius: 999,
                border: `3px solid rgba(37, 99, 235, ${0.6 * (1 - pulse)})`
              }}
            />
          ) : null}
          <div
            style={{
              width: 44,
              height: 44,
              padding: 4,
              borderRadius: 12,
              background: '#dbe7ff',
              boxShadow: '0 0 0 3px #93b4ff'
            }}
          >
            <Img src={staticFile('brand/icon.png')} style={{ display: 'block', width: 36, height: 36 }} />
          </div>
        </div>
      </div>

      <div
        style={{ position: 'absolute', top: BAR, left: 0, right: 0, bottom: 0, display: 'flex', background: '#fbfcfe' }}
      >
        <div
          style={{
            display: 'grid',
            alignContent: 'start',
            gap: 16,
            width: SIDEBAR,
            padding: '30px 22px',
            background: '#f6f8fc',
            boxShadow: 'inset -1px 0 0 #edf1f7'
          }}
        >
          {['70%', '100%', '100%', '80%', '60%', '72%'].map((width, index) => (
            <i
              key={index}
              style={{
                display: 'block',
                width,
                height: index === 0 ? 16 : 12,
                marginBottom: index === 0 ? 10 : 0,
                borderRadius: 999,
                background: index === 0 ? '#cfd8e6' : '#e2e8f1'
              }}
            />
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1 }}>
          <Bubble side="right" top={40} width="52%" bars={['100%', '64%']} />
          <Bubble side="left" top={170} width="66%" bars={['100%', '100%', '78%', '46%']} />

          <div
            style={{
              position: 'absolute',
              left: INSET,
              right: INSET,
              bottom: INSET,
              height: composerHeight,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: `${PAD.top}px ${PAD.side}px ${PAD.bottom}px`,
              overflow: 'hidden',
              border: '1px solid #dfe6f1',
              borderRadius: 30,
              background: '#ffffff',
              boxShadow: '0 22px 46px -26px rgba(15, 23, 42, 0.35)'
            }}
          >
            <div style={{ height: chipRow, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: 'max-content',
                  height: CHIP,
                  padding: `0 20px 0 ${THUMB.left}px`,
                  border: '1px solid #d6e2f8',
                  borderRadius: 18,
                  background: '#f5f8ff',
                  opacity: attach,
                  scale: String(0.6 + 0.4 * attach),
                  transformOrigin: 'left center'
                }}
              >
                <div
                  style={{
                    overflow: 'hidden',
                    borderRadius: 12,
                    boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.08)'
                  }}
                >
                  <ScreenshotArt width={THUMB.width} height={THUMB.height} />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ color: '#1e293b', fontSize: 19, fontWeight: 600 }}>{text.file}</strong>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: TEAL,
                      fontSize: 17,
                      fontWeight: 650
                    }}
                  >
                    <Check size={17} />
                    {text.attached}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: ROW }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24 }}>
                <Clip size={28} color="#9aa6b8" />
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {typed ? <span style={{ color: '#1e293b' }}>{typed}</span> : null}
                  {caret ? (
                    <span
                      style={{ width: 3, height: 30, margin: typed ? '0 0 0 2px' : '0 4px 0 0', background: BLUE }}
                    />
                  ) : null}
                  {typed ? null : <span style={{ color: '#9aa6b8' }}>{text.placeholder}</span>}
                </span>
              </span>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: ROW,
                  height: ROW,
                  borderRadius: 999,
                  background: typed ? '#1e293b' : '#e8edf5',
                  color: typed ? '#ffffff' : '#9aa6b8'
                }}
              >
                <Send size={22} />
              </span>
            </div>
          </div>

          {notSent > 0 ? (
            <div
              style={{
                position: 'absolute',
                right: INSET + 2,
                bottom: INSET + composerHeight + 22,
                display: 'flex',
                alignItems: 'center',
                padding: '13px 22px',
                borderRadius: 999,
                background: '#0b1324',
                color: '#ffffff',
                fontSize: 21,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                opacity: notSent,
                translate: `0 ${(1 - notSent) * 14}px`,
                boxShadow: '0 16px 30px -14px rgba(11, 19, 36, 0.8)'
              }}
            >
              {text.notSent}
              <i
                style={{
                  position: 'absolute',
                  right: 34,
                  bottom: -7,
                  width: 16,
                  height: 16,
                  background: '#0b1324',
                  rotate: '45deg'
                }}
              />
            </div>
          ) : null}

          {toast > 0 ? (
            // The extension's page notice (src/content/toast.ts), at video scale.
            <div
              style={{
                position: 'absolute',
                top: 26,
                right: 26,
                maxWidth: 470,
                padding: '16px 20px',
                borderRadius: 11,
                border: '1px solid rgba(15, 23, 42, 0.12)',
                background: '#ecfdf5',
                color: '#0f172a',
                fontSize: 22,
                lineHeight: 1.45,
                boxShadow: '0 22px 50px rgba(15, 23, 42, 0.18)',
                opacity: toast,
                translate: `0 ${(1 - toast) * -14}px`
              }}
            >
              {text.toast}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, top, width, bars }: { side: 'left' | 'right'; top: number; width: string; bars: string[] }) {
  const user = side === 'right';
  return (
    <div
      style={{
        position: 'absolute',
        top,
        [side]: 40,
        width,
        display: 'grid',
        gap: 12,
        padding: '22px 26px',
        borderRadius: 22,
        background: user ? '#edf3ff' : '#ffffff',
        boxShadow: user ? 'none' : 'inset 0 0 0 1px #edf1f6'
      }}
    >
      {bars.map((barWidth, index) => (
        <i
          key={index}
          style={{
            display: 'block',
            width: barWidth,
            height: 12,
            borderRadius: 999,
            background: user ? '#c7d7fb' : '#e1e6ee'
          }}
        />
      ))}
    </div>
  );
}
