import { app, BrowserWindow, dialog, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prints a self-contained HTML page, or saves it as PDF (asks where; cancel returns '').
 * The hidden window opens on the secondary display when there is one.
 */
export async function outputHtml(
  html: string,
  name: string,
  mode: 'pdf' | 'print',
  opts: { landscape?: boolean } = {},
): Promise<string> {
  const primary = screen.getPrimaryDisplay(),
    target = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  const window = new BrowserWindow({
    show: false,
    x: target.workArea.x,
    y: target.workArea.y,
    width: 900,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const file = join(app.getPath('temp'), `billsathi-print-${randomUUID()}.html`);
  writeFileSync(file, html);
  try {
    await window.loadFile(file);
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    if (mode === 'print') {
      await new Promise<void>((resolve, reject) =>
        window.webContents.print(
          { silent: false, printBackground: true, landscape: Boolean(opts.landscape) },
          (success, reason) =>
            success || /cancel/i.test(reason) ? resolve() : reject(new Error('storage')),
        ),
      );
      return '';
    }
    const picked = await dialog.showSaveDialog(BrowserWindow.getAllWindows()[0], {
      defaultPath: `${name.replace(/[^a-z0-9_-]+/gi, '_')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (picked.canceled || !picked.filePath) return '';
    writeFileSync(
      picked.filePath,
      await window.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        landscape: Boolean(opts.landscape),
      }),
    );
    return picked.filePath;
  } finally {
    window.destroy();
    unlinkSync(file);
  }
}
