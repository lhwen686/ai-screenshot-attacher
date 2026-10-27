import { t } from './i18n';

export type ClipboardErrorType =
  | 'NO_PERMISSION'
  | 'NO_IMAGE_IN_CLIPBOARD'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'CLIPBOARD_READ_FAILED'
  | 'CLIPBOARD_WRITE_FAILED';

export type AttachErrorType =
  | ClipboardErrorType
  | 'TARGET_TAB_FAILED'
  | 'TARGET_NOT_READY'
  | 'ADAPTER_NOT_FOUND'
  | 'AUTO_ATTACH_FAILED'
  | 'SCRIPT_INJECTION_FAILED'
  | 'UNKNOWN_ERROR';

export function getErrorMessage(error: AttachErrorType): string {
  switch (error) {
    case 'NO_PERMISSION':
      return t('errorNoPermission');
    case 'NO_IMAGE_IN_CLIPBOARD':
      return t('noClipboardImage');
    case 'UNSUPPORTED_IMAGE_TYPE':
      return t('errorUnsupportedImage');
    case 'CLIPBOARD_READ_FAILED':
      return t('errorClipboardRead');
    case 'CLIPBOARD_WRITE_FAILED':
      return t('errorClipboardWrite');
    case 'TARGET_TAB_FAILED':
      return t('errorTargetTab');
    case 'TARGET_NOT_READY':
      return t('errorTargetNotReady');
    case 'ADAPTER_NOT_FOUND':
      return t('errorAdapterNotFound');
    case 'AUTO_ATTACH_FAILED':
      return t('errorAutoAttach');
    case 'SCRIPT_INJECTION_FAILED':
      return t('errorScriptInjection');
    default:
      return t('errorUnknown');
  }
}

export function errorToType(error: unknown, fallback: AttachErrorType = 'UNKNOWN_ERROR'): AttachErrorType {
  if (typeof error === 'object' && error && 'error' in error && typeof error.error === 'string') {
    return error.error as AttachErrorType;
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'NO_PERMISSION';
    }
  }

  return fallback;
}
