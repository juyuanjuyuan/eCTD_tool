import { app, ipcMain, shell } from 'electron';
import type { DataDirPaths } from './data-dir';

/**
 * IPC handlers backing `preload/index.ts`. Wired up in main/index.ts after the
 * data dir + machine id are known.
 */
export function registerIpcHandlers(opts: {
  paths: DataDirPaths;
  machineId: string;
}) {
  ipcMain.handle('app:get-machine-id', () => opts.machineId);
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:open-data-dir', () => shell.openPath(opts.paths.userData));
  ipcMain.handle('app:open-log-file', () => shell.openPath(opts.paths.logsDir));
}
