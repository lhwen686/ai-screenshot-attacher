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
      return '无法读取剪贴板，请确认浏览器已允许扩展访问剪贴板。';
    case 'NO_IMAGE_IN_CLIPBOARD':
      return '未检测到剪贴板图片，请先截图后再试。';
    case 'UNSUPPORTED_IMAGE_TYPE':
      return '剪贴板中没有可用的 PNG、JPEG 或 WebP 图片。';
    case 'CLIPBOARD_READ_FAILED':
      return '读取剪贴板失败，请重新截图后再试。';
    case 'CLIPBOARD_WRITE_FAILED':
      return '写回剪贴板失败，请重新截图后手动粘贴。';
    case 'TARGET_TAB_FAILED':
      return '打开或切换目标 AI 页面失败。';
    case 'TARGET_NOT_READY':
      return '目标 AI 输入框尚未准备好。';
    case 'ADAPTER_NOT_FOUND':
      return '当前目标 AI 暂不支持自动附加。';
    case 'AUTO_ATTACH_FAILED':
      return '自动附加失败。';
    case 'SCRIPT_INJECTION_FAILED':
      return '向目标页面注入附加脚本失败。';
    default:
      return '操作失败，请稍后重试。';
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
