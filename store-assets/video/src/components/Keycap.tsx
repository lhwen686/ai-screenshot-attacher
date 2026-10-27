import { Fragment } from 'react';

type KeycapProps = { label: string; accent?: boolean; size?: number; press?: number };

/** A keyboard key; `press` from 0 (up) to 1 (fully down). */
export function Keycap({ label, accent = false, size = 1, press = 0 }: KeycapProps) {
  const depth = 7 * size;
  const sink = depth * press;
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: 96 * size,
        height: 88 * size,
        padding: `0 ${24 * size}px`,
        borderRadius: 20 * size,
        background: accent ? 'linear-gradient(#3b82f6, #2563eb)' : 'linear-gradient(#ffffff, #f1f4f9)',
        color: accent ? '#ffffff' : '#1e293b',
        fontSize: 34 * size,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        translate: `0 ${sink}px`,
        boxShadow: accent
          ? `0 0 0 ${1.5 * size}px #1d4ed8, 0 ${depth - sink}px 0 #1e40af, 0 ${18 * size}px ${28 * size}px -${14 * size}px rgba(37, 99, 235, 0.8)`
          : `0 0 0 ${1.5 * size}px #d3dbe8, 0 ${depth - sink}px 0 #cdd6e4, 0 ${18 * size}px ${26 * size}px -${14 * size}px rgba(15, 23, 42, 0.45)`
      }}
    >
      {label}
    </span>
  );
}

type KeyComboProps = { keys: string[]; size?: number; presses?: number[] };

/** Keys joined by plus signs; the last key is highlighted. */
export function KeyCombo({ keys, size = 1, presses = [] }: KeyComboProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 * size }}>
      {keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 ? (
            <span style={{ color: '#94a3b8', fontSize: 34 * size, fontWeight: 600, lineHeight: 1 }}>+</span>
          ) : null}
          <Keycap label={key} accent={index === keys.length - 1} size={size} press={presses[index] ?? 0} />
        </Fragment>
      ))}
    </span>
  );
}
