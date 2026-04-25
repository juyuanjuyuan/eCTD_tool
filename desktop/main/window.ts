import { BrowserWindow, shell } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';

export interface CreateWindowOptions {
  backendBaseUrl: string;
  /** Path to dist/preload/index.js (post-tsc). */
  preloadPath: string;
  /** Open devtools on launch (debug builds). */
  openDevTools?: boolean;
}

export function createMainWindow(options: CreateWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'eCTD 文档工具',
    backgroundColor: '#f0f2f5',
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Block remote content other than the local backend
      webSecurity: true,
    },
    show: false, // wait for ready-to-show to avoid white flash
  });

  win.once('ready-to-show', () => win.show());

  // Force any window.open() / target=_blank link to open in the system browser
  // instead of a new BrowserWindow. This prevents accidental in-app navigation
  // to external sites if something slips past the renderer.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((err) => log.warn(`openExternal failed: ${err.message}`));
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    // Only allow navigation within the backend origin (the React SPA).
    const allowed = options.backendBaseUrl.replace(/\/+$/, '');
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => log.warn(`openExternal failed: ${err.message}`));
    }
  });

  const loadUrl = options.backendBaseUrl;
  log.info(`loading window URL: ${loadUrl}`);
  win.loadURL(loadUrl).catch((err) => {
    log.error(`window.loadURL failed: ${err.message}`);
  });

  if (options.openDevTools) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

export function previewPreloadPath(): string {
  // dist/main/index.js → dist/preload/index.js
  return path.join(__dirname, '..', 'preload', 'index.js');
}
