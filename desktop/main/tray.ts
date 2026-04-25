import { Tray, Menu, nativeImage, BrowserWindow, app, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import type { DataDirPaths } from './data-dir';

let tray: Tray | null = null;

export function createTray(paths: DataDirPaths, getWindow: () => BrowserWindow | null): Tray | null {
  // Use the bundled app icon if present, else fall back to an empty image so
  // tray creation never crashes the app.
  const iconCandidates = [
    path.join((process as any).resourcesPath ?? '', 'icon.png'),
    path.resolve(__dirname, '..', '..', 'resources', 'icon.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));
  const image = iconPath
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  try {
    tray = new Tray(image);
  } catch (err) {
    log.warn(`Tray creation failed: ${(err as Error).message}`);
    return null;
  }

  tray.setToolTip('eCTD 文档工具');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          const win = getWindow();
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        },
      },
      { type: 'separator' },
      { label: '打开数据目录', click: () => shell.openPath(paths.userData) },
      { label: '查看日志', click: () => shell.openPath(paths.logsDir) },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );

  tray.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible()) win.hide();
    else {
      win.show();
      win.focus();
    }
  });

  return tray;
}
