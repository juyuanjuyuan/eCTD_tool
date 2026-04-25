import { app, BrowserWindow } from 'electron';

/**
 * Enforce single-instance: a second double-click on the app icon focuses the
 * existing window instead of forking a second backend (which would clash on the
 * SQLite db file write lock and produce confusing "database is locked" errors).
 *
 * Returns true if this process is the first instance and should proceed with
 * full startup; false if the lock was held by another process and we exited.
 */
export function ensureSingleInstance(): boolean {
  const acquired = app.requestSingleInstanceLock();
  if (!acquired) {
    app.quit();
    return false;
  }
  return true;
}

export function focusExistingOnSecondInstance(getWindow: () => BrowserWindow | null): void {
  app.on('second-instance', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}
