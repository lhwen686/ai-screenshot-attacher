// A small made-up dashboard that stands in for the user's screenshot, the same one as in the store images.
export function ScreenshotArt({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 160 110" preserveAspectRatio="none" style={{ display: 'block' }}>
      <rect width="160" height="110" fill="#ffffff" />
      <rect width="160" height="16" fill="#eef2f8" />
      <circle cx="9" cy="8" r="3" fill="#f87171" />
      <circle cx="18" cy="8" r="3" fill="#fbbf24" />
      <circle cx="27" cy="8" r="3" fill="#34d399" />
      <rect y="16" width="34" height="94" fill="#f4f7fb" />
      <rect x="7" y="26" width="20" height="4" rx="2" fill="#d4dce8" />
      <rect x="7" y="36" width="16" height="4" rx="2" fill="#e1e7f0" />
      <rect x="7" y="46" width="18" height="4" rx="2" fill="#e1e7f0" />
      <rect x="7" y="56" width="14" height="4" rx="2" fill="#e1e7f0" />
      <rect x="44" y="25" width="46" height="6" rx="3" fill="#cbd5e1" />
      <rect x="44" y="38" width="32" height="14" rx="4" fill="#e0ecff" />
      <rect x="80" y="38" width="32" height="14" rx="4" fill="#dcfce7" />
      <rect x="116" y="38" width="32" height="14" rx="4" fill="#fef3c7" />
      <path d="M44 96 L44 84 L60 72 L76 77 L92 60 L108 65 L124 49 L148 54 L148 96 Z" fill="#2563eb" fillOpacity=".13" />
      <polyline
        points="44,84 60,72 76,77 92,60 108,65 124,49 148,54"
        fill="none"
        stroke="#2563eb"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
