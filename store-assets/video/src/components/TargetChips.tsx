import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { INK } from '../theme';

/** The five supported sites as chips that pop in one by one from `start`. */
export function TargetChips({ names, start, size }: { names: string[]; start: number; size: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: size * 0.5 }}>
      {names.map((name, index) => {
        const progress = pop(frame, fps, start + index * 4);
        return (
          <span
            key={name}
            style={{
              opacity: Math.min(progress * 1.4, 1),
              scale: String(0.7 + 0.3 * progress),
              padding: `${size * 0.36}px ${size * 0.8}px`,
              borderRadius: 999,
              background: '#ffffff',
              color: INK,
              fontSize: size,
              fontWeight: 650,
              lineHeight: 1.2,
              boxShadow: '0 0 0 2px #dbe4f2, 0 14px 26px -18px rgba(15, 23, 42, 0.5)'
            }}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}
