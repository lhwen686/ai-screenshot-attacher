type CursorProps = { x: number; y: number; size?: number; opacity?: number; click?: number };

/** A mouse pointer whose tip sits at (x, y); `click` from 0 to 1 plays a ring around the tip. */
export function Cursor({ x, y, size = 1, opacity = 1, click = 0 }: CursorProps) {
  const ring = 18 + click * 46;
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none' }}>
      {click > 0 && click < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: -ring * size,
            top: -ring * size,
            width: ring * 2 * size,
            height: ring * 2 * size,
            borderRadius: 999,
            border: `${4 * size}px solid rgba(37, 99, 235, ${0.55 * (1 - click)})`,
            background: `rgba(37, 99, 235, ${0.12 * (1 - click)})`
          }}
        />
      ) : null}
      <svg
        width={52 * size}
        height={52 * size}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: -4 * (52 / 24) * size,
          top: -2.5 * (52 / 24) * size,
          filter: 'drop-shadow(0 6px 10px rgba(11, 19, 36, 0.35))',
          scale: String(1 - 0.12 * Math.sin(Math.PI * Math.min(click * 2.5, 1)))
        }}
      >
        <path
          d="M4 2.5L4 19l4.6-4.1 3 6.6 2.8-1.2-2.9-6.5 6.3-.2z"
          fill="#ffffff"
          stroke="#0b1324"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
