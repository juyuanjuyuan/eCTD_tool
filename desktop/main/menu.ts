import { Menu, MenuItemConstructorOptions, app, shell, BrowserWindow } from 'electron';
import type { DataDirPaths } from './data-dir';

export function buildAppMenu(paths: DataDirPaths, getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '打开数据目录',
          click: () => shell.openPath(paths.userData),
        },
        {
          label: '查看日志',
          click: () => shell.openPath(paths.logsDir),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }, // useful for support; remove in customer build if desired
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        ...(isMac
          ? [{ role: 'zoom' as const }, { type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '联系厂商',
          click: () => {
            const win = getWindow();
            if (!win) return;
            // Same as user-menu "关于": navigate to /about
            win.webContents.executeJavaScript(`window.location.hash = '/about'`).catch(() => {});
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
