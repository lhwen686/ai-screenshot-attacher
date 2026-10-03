export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

// Must stay self-contained (no imports or outer references): the service worker also passes this function to
// chrome.scripting.executeScript, which serializes it into the target page.
export function showToast(message: string, variant: ToastVariant = 'info'): void {
  const id = 'ai-screenshot-attacher-toast';
  document.getElementById(id)?.remove();

  const backgrounds: Record<ToastVariant, string> = {
    success: '#ecfdf5',
    warning: '#fffbeb',
    error: '#fef2f2',
    info: '#f8fafc'
  };
  const toast = document.createElement('div');
  toast.id = id;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    maxWidth: '360px',
    padding: '12px 14px',
    borderRadius: '8px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '14px',
    lineHeight: '1.45',
    boxShadow: '0 16px 38px rgba(15, 23, 42, 0.18)',
    color: '#0f172a',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    background: backgrounds[variant] ?? backgrounds.info
  });

  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), variant === 'error' ? 7000 : 4500);
}
