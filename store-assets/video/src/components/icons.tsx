import type { ReactNode } from 'react';

// Line icons shared with the store images (store-assets/source/render.js).
type IconProps = { size: number; color?: string; strokeWidth?: number };

function Icon({ size, color = 'currentColor', strokeWidth = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
    >
      {children}
    </svg>
  );
}

export const Lock = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="3" />
    <path d="M8.2 10.5V7.5a3.8 3.8 0 017.6 0v3" />
  </Icon>
);

export const Puzzle = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4a2 2 0 114 0v2h4v4h-2a2 2 0 100 4h2v4h-4v-2a2 2 0 10-4 0v2H6v-4H4a2 2 0 110-4h2V6h4z" />
  </Icon>
);

export const Clip = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
  </Icon>
);

export const Send = (props: IconProps) => (
  <Icon {...props} strokeWidth={2.2}>
    <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props} strokeWidth={props.strokeWidth ?? 2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const Arrow = (props: IconProps) => (
  <Icon {...props} strokeWidth={2.2}>
    <path d="M3 12h17M14 5.5l6.5 6.5-6.5 6.5" />
  </Icon>
);

export const ToggleOff = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="7" width="19" height="10" rx="5" />
    <circle cx="7.5" cy="12" r="3" />
  </Icon>
);

export const NoSend = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 3l-6.5 18-3.5-7-7-3.5L21 3z" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const NoChat = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 15.5a2 2 0 01-2 2H8l-4 3.5V6.5a2 2 0 012-2h12a2 2 0 012 2z" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const NoHistory = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 12a8.5 8.5 0 102.5-6" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const NoCloud = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 18h10a4 4 0 00.6-7.95A6 6 0 006.2 8.5 4.5 4.5 0 007 18z" />
    <path d="M4 4l16 16" />
  </Icon>
);

export const Shield = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
    <path d="M8.8 12l2.2 2.2 4.4-4.6" />
  </Icon>
);
