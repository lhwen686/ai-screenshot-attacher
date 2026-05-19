import type { UiMessage } from '../shared/messages';
import { attachToTarget, getLastOperation, handleCommand } from './commandHandler';
import { getSettings } from '../shared/settings';
import { logger } from '../shared/logger';
import {
  getAutoMonitorStatus,
  handleAutoClipboardImage,
  refreshAutoMonitor,
  scheduleAutoMonitorRefresh
} from './autoMonitor';

chrome.runtime.onInstalled.addListener(() => {
  void getSettings().then(() => refreshAutoMonitor());
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAutoMonitorRefresh();
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

chrome.runtime.onMessage.addListener((message: UiMessage, _sender, sendResponse) => {
  if (message?.type === 'ATTACH_TO_TARGET') {
    attachToTarget(message.targetId).then(sendResponse);
    return true;
  }

  if (message?.type === 'GET_LAST_OPERATION') {
    getLastOperation().then(sendResponse);
    return true;
  }

  if (message?.type === 'GET_AUTO_MONITOR_STATUS') {
    refreshAutoMonitor().then(sendResponse);
    return true;
  }

  if (message?.type === 'AUTO_CLIPBOARD_IMAGE_DETECTED') {
    handleAutoClipboardImage(message.image, message.fingerprint).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === 'AUTO_MONITOR_STATUS_CHANGED') {
    sendResponse(getAutoMonitorStatus());
    return true;
  }

  logger.debug('ignored runtime message', { message });
  return false;
});

chrome.tabs.onCreated.addListener(() => scheduleAutoMonitorRefresh());
chrome.tabs.onRemoved.addListener(() => scheduleAutoMonitorRefresh());
chrome.tabs.onActivated.addListener(() => scheduleAutoMonitorRefresh());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status || changeInfo.url) {
    scheduleAutoMonitorRefresh();
  }
});

chrome.windows.onCreated.addListener(() => scheduleAutoMonitorRefresh());
chrome.windows.onRemoved.addListener(() => scheduleAutoMonitorRefresh());
chrome.windows.onFocusChanged.addListener(() => scheduleAutoMonitorRefresh());

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'sync') {
    scheduleAutoMonitorRefresh();
  }
});
