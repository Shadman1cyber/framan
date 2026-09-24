'use strict';

/**
 * Cafe 13 desktop preload — minimal, version-agnostic bridge.
 * Uses only `contextBridge` + `ipcRenderer` (available since Electron 5,
 * safe on the pinned Electron 22 runtime).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cafe13', {
  getInfo: function () {
    return ipcRenderer.invoke('cafe13:get-info');
  },
  checkServer: function (url) {
    return ipcRenderer.invoke('cafe13:check-server', url);
  },
  setServerUrl: function (url) {
    return ipcRenderer.invoke('cafe13:set-server-url', url);
  },
  retry: function () {
    return ipcRenderer.invoke('cafe13:retry');
  },
  print: function (opts) {
    return ipcRenderer.invoke('cafe13:print', opts || {});
  },
  openExternal: function (url) {
    return ipcRenderer.invoke('cafe13:open-external', url);
  },
  getSettings: function () {
    return ipcRenderer.invoke('cafe13:get-settings');
  },
  saveSettings: function (opts) {
    return ipcRenderer.invoke('cafe13:save-settings', opts || {});
  },
  restartApp: function () {
    return ipcRenderer.invoke('cafe13:restart-app');
  },
});
