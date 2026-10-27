import { useCurrentFrame } from 'remotion';
import { enter, rise } from '../anim';
import { BLUE, INK, MUTED } from '../theme';

type HeadingProps = {
  eyebrow?: string;
  title: string;
  lead?: string;
  /** Font sizes for the title and lead; the eyebrow is a third of the title. */
  size: { title: number; lead: number };
  start?: number;
  align?: 'left' | 'center';
  dark?: boolean;
  width?: number;
};

/** Eyebrow, title, and lead that fade up one after another. */
export function Heading({ eyebrow, title, lead, size, start = 0, align = 'left', dark = false, width }: HeadingProps) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'grid',
        gap: size.title * 0.28,
        width,
        textAlign: align,
        justifyItems: align === 'center' ? 'center' : 'start'
      }}
    >
      {eyebrow ? (
        <div
          style={{
            ...enter(rise(frame, start)),
            color: dark ? '#7dd3fc' : BLUE,
            fontSize: Math.round(size.title * 0.36),
            fontWeight: 650,
            letterSpacing: '0.04em'
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          ...enter(rise(frame, start + 5)),
          color: dark ? '#ffffff' : INK,
          fontSize: size.title,
          fontWeight: 750,
          lineHeight: 1.16,
          whiteSpace: 'pre-line'
        }}
      >
        {title}
      </div>
      {lead ? (
        <div
          style={{
            ...enter(rise(frame, start + 11)),
            marginTop: size.lead * 0.2,
            color: dark ? '#b6c3d8' : MUTED,
            fontSize: size.lead,
            lineHeight: 1.5
          }}
        >
          {lead}
        </div>
      ) : null}
    </div>
  );
}
