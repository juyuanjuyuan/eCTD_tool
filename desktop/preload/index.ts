import { contextBridge, ipcRenderer, shell } from 'electron';

/**
 * Renderer-side bridge. Only the surface listed in `frontend/src/types/electron-api.d.ts`
 * is exposed; everything else stays on the main side. Sandbox + contextIsolation
 * are both ON in window.ts, so the renderer cannot import `electron` directly.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  getMachineId: () => ipcRenderer.invoke('app:get-machine-id'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => Promise.resolve(process.platform),
  openExternal: (url: string) => shell.openExternal(url),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  openLogFile: () => ipcRenderer.invoke('app:open-log-file'),
});
