/**
 * Type contract for the IPC bridge that Electron `preload/index.ts` exposes via
 * `contextBridge.exposeInMainWorld('electronAPI', ...)` in the desktop build
 * (software_upgrade / E5 stage).
 *
 * In the web build `window.electronAPI` is undefined; presence of this object
 * is the canonical "are we in desktop mode?" signal.
 */
export interface ElectronAPI {
  /** 16-char hex machine fingerprint, captured by main and forwarded to backend via env. */
  getMachineId(): Promise<string>;
  /** Semver string from desktop/package.json (e.g. "1.0.0"). */
  getAppVersion(): Promise<string>;
  /** node platform name: "darwin" | "win32" | "linux" */
  getPlatform(): Promise<string>;
  /** Open URL in the system default browser instead of an in-app window. */
  openExternal(url: string): Promise<void>;
  /** Reveal the data directory in Finder / Explorer. */
  openDataDir(): Promise<void>;
  /** Reveal the rolling log file in Finder / Explorer. */
  openLogFile(): Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
