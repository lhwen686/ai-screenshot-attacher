export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

const TOAST_ID = 'ai-screenshot-attacher-toast';

export function showToast(message: string, variant: ToastVariant = 'info'): void {
  const existing = document.getElementById(TOAST_ID);
  existing?.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '2147483647';
  toast.style.maxWidth = '360px';
  toast.style.padding = '12px 14px';
  toast.style.borderRadius = '8px';
  toast.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  toast.style.fontSize = '14px';
  toast.style.lineHeight = '1.45';
  toast.style.boxShadow = '0 16px 38px rgba(15, 23, 42, 0.18)';
  toast.style.color = '#0f172a';
  toast.style.border = '1px solid rgba(15, 23, 42, 0.12)';
  toast.style.background = getBackground(variant);

  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), variant === 'error' ? 7000 : 4500);
}

function getBackground(variant: ToastVariant): string {
  switch (variant) {
    case 'success':
      return '#ecfdf5';
    case 'warning':
      return '#fffbeb';
    case 'error':
      return '#fef2f2';
    default:
      return '#f8fafc';
  }
}
