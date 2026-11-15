import { app, BrowserWindow, dialog, session, screen } from 'electron';
import { join } from 'node:path';
import { APP_NAME } from '../shared/constants';
import { openDatabase } from './db';
import { registerIpc } from './ipc';
import { recurringInvoices } from './services/recurring-invoices';
import { repositories } from './db/repositories';
import { upgradeDemo } from './db/demo-finance';
import appIcon from '../../build/icon.png?asset';
import en from '../renderer/i18n/en.json';
import hi from '../renderer/i18n/hi.json';
app.setName(APP_NAME);
if (process.env.BILLSATHI_USER_DATA) app.setPath('userData', process.env.BILLSATHI_USER_DATA);
let recurringTimer: ReturnType<typeof setInterval> | undefined;
let context: Awaited<ReturnType<typeof openDatabase>>;
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});
function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const secondary = screen.getAllDisplays().find((display) => display.id !== primary.id);
  const target =
    secondary && (process.env.BILLSATHI_DISPLAY === 'secondary' || !app.isPackaged)
      ? secondary
      : primary;
  const width = Math.min(1440, target.workArea.width);
  const height = Math.min(900, target.workArea.height);
  const window = new BrowserWindow({
    x: target.workArea.x + Math.round((target.workArea.width - width) / 2),
    y: target.workArea.y + Math.round((target.workArea.height - height) / 2),
    width,
    height,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME,
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: process.env.BILLSATHI_SHOW_WINDOW !== '0',
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => {
    if (target.id !== primary.id) window.maximize();
    if (process.env.BILLSATHI_SHOW_WINDOW !== '0') window.show();
  });
  window.webContents.on('render-process-gone', (_event, details) =>
    console.error('Renderer stopped:', details.reason),
  );
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
}
void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const allowed =
        ['file:', 'data:', 'devtools:'].includes(url.protocol) ||
        (Boolean(process.env.ELECTRON_RENDERER_URL) &&
          ['localhost', '127.0.0.1'].includes(url.hostname));
      callback({ cancel: !allowed });
    });
    context = await openDatabase(app.getPath('userData'));
    upgradeDemo(context);
    registerIpc(context);
    const runRecurring = () => {
      for (const firm of repositories(context).list()) recurringInvoices(context).run(firm.id);
    };
    runRecurring();
    recurringTimer = setInterval(runRecurring, 60 * 60 * 1000);
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    console.error('Startup failed', error);
    dialog.showErrorBox(APP_NAME, (app.getLocale().startsWith('hi') ? hi : en).startupError);
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  clearInterval(recurringTimer);
  context?.sqlite.close();
});
