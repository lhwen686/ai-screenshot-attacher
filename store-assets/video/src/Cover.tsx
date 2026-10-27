import { AbsoluteFill, Img, staticFile } from 'remotion';
import { ChatWindow } from './components/ChatWindow';
import { Check } from './components/icons';
import { KeyCombo } from './components/Keycap';
import { COPY, msg, targetNames, type Locale } from './copy';
import { Background } from './components/Background';
import { BLUE_DEEP, INK, TEAL, fontFamily } from './theme';

export type CoverProps = { locale: Locale; variant: 'wide' | 'center' | 'vertical' };

// Thumbnails and covers. "wide" is the YouTube thumbnail; "center" keeps everything in the middle, because
// Bilibili crops covers to 4:3 on phones; "vertical" keeps the key content inside a 3:4 center crop.
export function Cover({ locale, variant }: CoverProps) {
  const copy = COPY[locale];
  const demo = copy.demo;
  const window = (
    <ChatWindow
      text={{ ...demo, toast: msg(locale, 'attachSuccess') }}
      attach={1}
      typed=""
      caret={false}
      toast={1}
      notSent={0}
      pulse={0}
    />
  );
  const brand = (size: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.45 }}>
      <Img src={staticFile('brand/icon.png')} style={{ width: size * 1.7, height: size * 1.7 }} />
      <span style={{ color: INK, fontSize: size, fontWeight: 700 }}>{msg(locale, 'extName')}</span>
    </div>
  );
  const badge = (size: number) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.4,
        padding: `${size * 0.4}px ${size * 0.8}px`,
        borderRadius: 999,
        background: TEAL,
        color: '#ffffff',
        fontSize: size,
        fontWeight: 700
      }}
    >
      <Check size={size * 1.05} color="#ffffff" />
      {copy.cover.badge}
    </span>
  );
  const title = (size: number) => (
    <div style={{ color: INK, fontSize: size, fontWeight: 800, lineHeight: 1.12, whiteSpace: 'pre-line' }}>
      {copy.cover.title}
    </div>
  );

  return (
    <AbsoluteFill lang={locale === 'zh_CN' ? 'zh-CN' : 'en'} style={{ fontFamily: fontFamily(locale) }}>
      <Background />
      {variant === 'wide' ? (
        <>
          <div style={{ position: 'absolute', left: 64, top: 54 }}>{brand(30)}</div>
          <div
            style={{
              position: 'absolute',
              left: 64,
              top: 150,
              width: 620,
              display: 'grid',
              gap: 34,
              justifyItems: 'start'
            }}
          >
            {title(locale === 'zh_CN' ? 84 : 64)}
            <KeyCombo keys={['Alt', 'Shift', 'A']} size={0.78} />
            {badge(30)}
          </div>
          <div style={{ position: 'absolute', left: 656, top: 120, transformOrigin: 'left top', scale: '0.6' }}>
            {window}
          </div>
        </>
      ) : null}
      {variant === 'center' ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 44, textAlign: 'center' }}>
            {brand(40)}
            {title(112)}
            <KeyCombo keys={['Alt', 'Shift', 'A']} size={1.05} />
            <div style={{ color: BLUE_DEEP, fontSize: 38, fontWeight: 650 }}>{targetNames(locale).join(' · ')}</div>
          </div>
        </AbsoluteFill>
      ) : null}
      {variant === 'vertical' ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 250,
            display: 'grid',
            justifyItems: 'center',
            gap: 46
          }}
        >
          {brand(42)}
          <div style={{ textAlign: 'center' }}>{title(110)}</div>
          <KeyCombo keys={['Alt', 'Shift', 'A']} size={1} />
          <div style={{ width: 850, height: 697, marginTop: 10 }}>
            <div style={{ transformOrigin: 'left top', scale: '0.85' }}>{window}</div>
          </div>
          {badge(40)}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
