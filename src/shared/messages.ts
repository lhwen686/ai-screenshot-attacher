import type { AttachMethod, AttachResult } from '../adapters/types';
import type { ClipboardImagePayload } from '../clipboard/types';
import type { TargetId } from './constants';

export interface OperationResult {
  ok: boolean;
  targetId?: TargetId;
  targetName?: string;
  message: string;
  method?: AttachMethod;
  error?: string;
  trigger?: 'manual' | 'auto';
  at: string;
}

export interface AutoMonitorStatus {
  enabled: boolean;
  active: boolean;
  targetCount: number;
  message: string;
}

export interface AttachQueueStatus {
  busy: boolean;
  pendingManualCount: number;
  hasPendingAuto: boolean;
  currentTrigger?: 'manual' | 'auto';
  message: string;
  at: string;
}

export interface AttachRuntimePayload {
  targetId: TargetId;
  image: ClipboardImagePayload;
  settings: {
    showPageToast: boolean;
    writeBackOnFailure: boolean;
    debugLogs: boolean;
  };
}

export interface AttachRuntimeGlobal {
  run(payload: AttachRuntimePayload): Promise<AttachResult>;
}

export type PopupAttachMessage = {
  type: 'ATTACH_TO_TARGET';
  targetId?: TargetId;
};

export type GetLastOperationMessage = {
  type: 'GET_LAST_OPERATION';
};

export type GetAutoMonitorStatusMessage = {
  type: 'GET_AUTO_MONITOR_STATUS';
};

export type GetAttachQueueStatusMessage = {
  type: 'GET_ATTACH_QUEUE_STATUS';
};

export type AttachQueueStatusChangedMessage = {
  type: 'ATTACH_QUEUE_STATUS_CHANGED';
  status: AttachQueueStatus;
};

export type AutoClipboardImageDetectedMessage = {
  type: 'AUTO_CLIPBOARD_IMAGE_DETECTED';
  image: ClipboardImagePayload;
  fingerprint: string;
};

export type OffscreenAutoMonitorErrorMessage = {
  type: 'OFFSCREEN_AUTO_MONITOR_ERROR';
  error: string;
  message: string;
};

export type AutoMonitorStatusChangedMessage = {
  type: 'AUTO_MONITOR_STATUS_CHANGED';
  status: AutoMonitorStatus;
};

export type UiMessage =
  | PopupAttachMessage
  | GetLastOperationMessage
  | GetAutoMonitorStatusMessage
  | GetAttachQueueStatusMessage
  | AttachQueueStatusChangedMessage
  | AutoClipboardImageDetectedMessage
  | OffscreenAutoMonitorErrorMessage
  | AutoMonitorStatusChangedMessage;
