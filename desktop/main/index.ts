import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import log from 'electron-log/main';

import { ensureSingleInstance, focusExistingOnSecondInstance } from './single-instance';
import { initDataDir, DataDirPaths } from './data-dir';
import { configureLogger } from './logger';
import { loadOrCreateSecrets } from './secrets';
import { getMachineId } from './machine-id';
import { startBackend, BackendHandle } from './backend-process';
import { createMainWindow, previewPreloadPath } from './window';
import { buildAppMenu } from './menu';
import { createTray } from './tray';
import { registerIpcHandlers } from './ipc';
import { Menu } from 'electron';

let mainWindow: BrowserWindow | null = null;
let backend: BackendHandle | null = null;
let paths: DataDirPaths | null = null;
let machineId: string = '';
let appQuitting = false;

if (!ensureSingleInstance()) {
  // single-instance.ts already called app.quit()
} else {
  focusExistingOnSecondInstance(() => mainWindow);

  app.whenReady().then(boot).catch(handleFatalBootError);

  app.on('window-all-closed', () => {
    // macOS convention: keep the app alive when last window closes; tray + dock are still there.
    if (process.platform !== 'darwin') {
      shutdownAndQuit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null && backend && paths) {
      mainWindow = createMainWindow({
        backendBaseUrl: backend.baseUrl,
        preloadPath: previewPreloadPath(),
      });
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('before-quit', async (event) => {
    if (appQuitting) return; // already in shutdown
    if (!backend) return;
    event.preventDefault();
    appQuitting = true;
    await shutdownAndQuit();
  });
}

async function boot() {
  paths = initDataDir();
  configureLogger(paths.logsDir);
  log.info(`====== eCTD desktop start v${app.getVersion()} ======`);
  log.info(`platform=${process.platform} arch=${process.arch} userData=${paths.userData}`);

  machineId = getMachineId(paths.userData);
  log.info(`machine-id: ${machineId}`);

  const secrets = loadOrCreateSecrets(paths.userData);

  registerIpcHandlers({ paths, machineId });

  try {
    backend = await startBackend({ paths, machineId, secrets });
  } catch (err) {
    log.error(`backend startup failed: ${(err as Error).stack ?? (err as Error).message}`);
    showStartupErrorDialog(err as Error);
    app.exit(1);
    return;
  }

  mainWindow = createMainWindow({
    backendBaseUrl: backend.baseUrl,
    preloadPath: previewPreloadPath(),
  });

  Menu.setApplicationMenu(buildAppMenu(paths, () => mainWindow));
  createTray(paths, () => mainWindow);

  // If the backend ever crashes, surface it; don't silently leave a dead window.
  backend.process.once('exit', (code, signal) => {
    if (appQuitting) return;
    log.error(`backend exited unexpectedly code=${code} signal=${signal}`);
    showBackendCrashDialog(paths!.logsDir);
    app.exit(1);
  });
}

function handleFatalBootError(err: unknown) {
  // app.whenReady rejected — extremely rare; usually OS-level issue.
  // electron-log may not be initialized yet, so bail to plain console.
  // eslint-disable-next-line no-console
  console.error('Fatal boot error:', err);
  dialog.showErrorBox(
    'eCTD 启动失败',
    `应用启动时遇到底层错误：\n${(err as Error)?.message ?? err}\n\n请联系厂商技术支持。`,
  );
  app.exit(1);
}

function showStartupErrorDialog(err: Error) {
  dialog.showErrorBox(
    'eCTD 后端启动失败',
    `后端服务无法启动。日志见：\n${path.join(paths!.logsDir, 'main.log')}\n\n` +
      `错误：${err.message}`,
  );
}

function showBackendCrashDialog(logsDir: string) {
  dialog.showErrorBox(
    'eCTD 后端进程崩溃',
    `后端服务异常退出，应用即将关闭。完整日志见：\n${path.join(logsDir, 'main.log')}\n\n` +
      `请把日志发给厂商技术支持。`,
  );
}

async function shutdownAndQuit() {
  appQuitting = true;
  try {
    if (backend) {
      await backend.stop(5000);
      log.info(`backend stopped pid=${backend.pid}`);
    }
  } catch (err) {
    log.warn(`error during backend stop: ${(err as Error).message}`);
  } finally {
    app.exit(0);
  }
}
