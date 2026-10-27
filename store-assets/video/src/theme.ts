import type { Locale } from './copy';

// The same palette as the store images (store-assets/source/render.css).
export const INK = '#0b1324';
export const MUTED = '#4a5a75';
export const BLUE = '#2563eb';
export const BLUE_DEEP = '#1d4ed8';
export const TEAL = '#0d9488';
export const LINE = '#dfe6f1';
export const CARD_SHADOW = '0 40px 90px -30px rgba(15, 23, 42, 0.38), 0 12px 30px -10px rgba(15, 23, 42, 0.14)';

export function fontFamily(locale: Locale): string {
  return locale === 'zh_CN'
    ? "'Noto Sans SC', 'Microsoft YaHei UI', 'Segoe UI Variable Display', 'Segoe UI', sans-serif"
    : "'Segoe UI Variable Display', 'Segoe UI', 'Noto Sans SC', 'Microsoft YaHei UI', sans-serif";
}
