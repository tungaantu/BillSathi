import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DatabaseContext } from './db';
import { repositories } from './db/repositories';
import { firms } from './db/schema';
import { dashboard } from './services/dashboard';
import type { FirmInput, Result, SettingValue } from '../shared/types';
import { registerCustomerIpc } from './customer-ipc';
import { registerMasterIpc } from './master-ipc';
import { registerSalesIpc } from './sales-ipc';
import { registerFinanceIpc } from './finance-ipc';
import { registerSafetyIpc } from './safety-ipc';
import { registerPaymentsIpc } from './payments-ipc';
import { registerReportsIpc } from './reports-ipc';
import { registerComplianceIpc } from './compliance-ipc';
import { registerInventoryIpc } from './inventory-ipc';
import { registerFyIpc } from './fy-ipc';
export function registerIpc(context: DatabaseContext) {
  const repo = repositories(context);
  const id = (value: unknown): number => z.number().int().positive().parse(value);
  function handle(channel: string, fn: (...args: unknown[]) => unknown) {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || event.senderFrame !== event.sender.mainFrame)
        return { ok: false, error: 'validation' };
      try {
        return { ok: true, data: await fn(...args) };
      } catch (error) {
        const salesErrors = [
          'closedYear',
          'backupFirst',
          'serials',
          'duplicate',
          'negativeStock',
          'allocation',
          'linked',
          'overpayment',
          'phone',
        ] as const;
        const salesError = salesErrors.find(
          (code) => error instanceof Error && error.message === code,
        );
        const code =
          salesError ??
          (error instanceof z.ZodError || (error instanceof Error && error.message === 'validation')
            ? channel.startsWith('sales:')
              ? 'salesValidation'
              : 'validation'
            : error instanceof Error && error.message === 'notFound'
              ? 'notFound'
              : 'storage');
        return { ok: false, error: code };
      }
    });
  }
  registerCustomerIpc(context, handle);
  registerMasterIpc(context, handle);
  registerSalesIpc(context, handle);
  registerFinanceIpc(context, handle);
  registerSafetyIpc(context, handle);
  registerPaymentsIpc(context, handle);
  registerReportsIpc(context, handle);
  registerComplianceIpc(context, handle);
  registerInventoryIpc(context, handle);
  registerFyIpc(context, handle);
  handle('firm:list', () => repo.list());
  handle('firm:get', (value) => repo.get(id(value)));
  handle('firm:create', (input) => repo.create(input as FirmInput));
  handle('firm:update', (value, input) => repo.update(id(value), input as FirmInput));
  handle('settings:get', (value) => repo.getSettings(id(value)));
  handle('settings:set', (value, key, setting) =>
    repo.set(id(value), z.string().max(120).parse(key), setting as SettingValue),
  );
  handle('units:list', () => repo.units());
  handle('dashboard:get', (value) => dashboard(context, id(value)));
  handle('demo:clear', (value) => repo.clearDemo(id(value)));
  handle('demo:restore', (value) => repo.restoreDemo(id(value)));
  const imageKind = (kind: unknown) => z.enum(['logo', 'signature']).parse(kind);
  handle('firm:image', (value, kind) => {
    const firm = repo.get(id(value));
    const filename = firm[imageKind(kind)];
    if (!filename) return null;
    const path = join(app.getPath('userData'), 'images', filename);
    const mime = extname(filename) === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
  });
  handle('firm:upload', async (value, rawKind) => {
    const firmId = id(value),
      kind = imageKind(rawKind),
      before = repo.get(firmId);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PNG / JPEG', extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (result.canceled) return null;
    const source = result.filePaths[0];
    if (statSync(source).size > 5 * 1024 * 1024) throw new Error('validation');
    const bytes = readFileSync(source);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new Error('validation');
    const filename = `${randomUUID()}${png ? '.png' : '.jpg'}`;
    const directory = join(app.getPath('userData'), 'images');
    mkdirSync(directory, { recursive: true });
    const target = join(directory, filename);
    copyFileSync(source, target);
    try {
      context.sqlite.transaction(() => {
        context.db
          .update(firms)
          .set({ [kind]: filename })
          .where(eq(firms.id, firmId))
          .run();
        repo.audit(firmId, 'firms', firmId, 'update', before, repo.get(firmId));
      })();
    } catch (error) {
      unlinkSync(target);
      throw error;
    }
    return filename;
  });
}
