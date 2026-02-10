export const IPC = {
  PANEL_SHOW_LOADING: 'panel:show-loading',
  PANEL_SHOW_RESULT: 'panel:show-result',
  PANEL_SHOW_ERROR: 'panel:show-error',
  PANEL_DISMISS: 'panel:dismiss',
  CLIPBOARD_WRITE: 'clipboard:write',
  PANEL_READY: 'panel:ready',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  CAPTURE_TRIGGER: 'capture:trigger',
  API_TEST: 'api:test',
  HISTORY_LIST: 'history:list',
  MEMORY_LIST: 'memory:list',
  MEMORY_SAVE: 'memory:save',
  CHAT_SEND: 'chat:send'
} as const
