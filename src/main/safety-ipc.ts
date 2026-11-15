import { app, dialog, shell } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { DatabaseContext } from './db';
import { firms, settings } from './db/schema';
import {
  applyRestore,
  configStore,
  createBackup,
  firmNames,
  inspectBackup,
  listBackups,
  pruneFolder,
  schemaVersion,
  unpackBackup,
} from './services/backup';
import { auditEntities, auditList } from './services/audit-read';
import { passcodeService } from './services/passcode';
import { recycleService } from './services/recycle';
import { applyVerifyFix, runVerify } from './services/verify';
import { backupFileName, dailyBackupDue, PRE_RESTORE_TAG, reminderState } from '../shared/backup';
import type { BackupStatus } from '../shared/safety-api';

type Handle = (channel: string, fn: (...args: unknown[]) => unknown) => void;
const id = (v: unknown) => z.number().int().positive().parse(v);
const FILTERS = [{ name: 'BillSathi backup', extensions: ['bsbk'] }];

export function registerSafetyIpc(context: DatabaseContext, handle: Handle) {
  const userData = app.getPath('userData');
  const store = configStore(userData);
  const lock = passcodeService(userData);
  const recycle = recycleService(context);
  const defaultFolder = () => join(app.getPath('documents'), 'BillSathi Backups');
  const folder = () => store.read().folder ?? defaultFolder();

  function status(now = new Date()): BackupStatus {
    const config = store.read();
    const created = context.sqlite.prepare('SELECT MIN(created_at) AS at FROM firms').get()?.at;
    const reminder = reminderState(config.lastBackupAt, created ? String(created) : null, now);
    return {
      config,
      folder: folder(),
      lastBackupAt: config.lastBackupAt,
      daysSince: reminder.daysSince,
      reminderDue: reminder.due,
    };
  }
  /** Dashboard checklist reads this per-business marker. */
  function markSuccess(at: string) {
    store.write({ lastBackupAt: at });
    try {
      context.sqlite.transaction(() => {
        for (const firm of context.db.select({ id: firms.id }).from(firms).all())
          context.db
            .insert(settings)
            .values({ firmId: firm.id, key: 'backup.lastSuccess', value: JSON.stringify(at) })
            .onConflictDoUpdate({
              target: [settings.firmId, settings.key],
              set: { value: JSON.stringify(at) },
            })
            .run();
      })();
    } catch (error) {
      console.error('Could not record backup time', error);
    }
  }
  function runBackup(options: { target?: string; tag?: string; auto?: boolean } = {}) {
    const config = store.read();
    const result = createBackup(context, {
      userData,
      folder: folder(),
      appVersion: app.getVersion(),
      tag: options.tag,
      target: options.target,
      keep: options.tag ? undefined : config.keep,
    });
    if (!options.tag) markSuccess(result.manifest.createdAt);
    return { path: result.path, size: result.size };
  }

  handle('safety:backup:status', () => status());
  handle('safety:backup:setConfig', (patch) => {
    const p = z
      .object({
        auto: z.boolean(),
        frequency: z.enum(['daily', 'close']),
        folder: z.string().max(1000).nullable(),
        keep: z.number().int().min(1).max(100),
      })
      .partial()
      .parse(patch);
    store.write(p);
    return status();
  });
  handle('safety:backup:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: folder(),
    });
    if (result.canceled) return null;
    store.write({ folder: result.filePaths[0] });
    return result.filePaths[0];
  });
  handle('safety:backup:run', async (saveAs) => {
    if (saveAs !== true) return runBackup();
    mkdirSync(folder(), { recursive: true });
    const result = await dialog.showSaveDialog({
      defaultPath: join(folder(), backupFileName(firmNames(context)[0] ?? 'Business', new Date())),
      filters: FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    return runBackup({ target: result.filePath });
  });
  handle('safety:backup:history', () => listBackups(folder(), schemaVersion(context)));
  handle('safety:backup:inspect', (path) =>
    inspectBackup(z.string().min(1).max(1000).parse(path), schemaVersion(context)),
  );
  handle('safety:backup:pickRestore', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: FILTERS,
      defaultPath: folder(),
    });
    if (result.canceled) return null;
    return inspectBackup(result.filePaths[0], schemaVersion(context));
  });
  handle('safety:backup:restore', async (path) => {
    const file = z.string().min(1).max(1000).parse(path);
    const current = schemaVersion(context);
    const inspected = inspectBackup(file, current);
    if (!inspected.ok) return inspected;
    const packed = unpackBackup(readFileSync(file), current);
    // Safety copy of today's data first, so a restore can always be undone.
    runBackup({ tag: PRE_RESTORE_TAG });
    context.sqlite.close();
    try {
      await applyRestore(userData, packed);
    } finally {
      app.relaunch();
      app.exit(0);
    }
    return { ok: true };
  });
  handle('safety:backup:openFolder', async () => {
    mkdirSync(folder(), { recursive: true });
    await shell.openPath(folder());
  });

  handle('safety:recycle:list', (f) => recycle.list(id(f)));
  handle('safety:recycle:restore', (f, i) => recycle.restore(id(f), id(i)));
  handle('safety:recycle:purge', (f, i) => recycle.purge(id(f), id(i)));
  handle('safety:recycle:empty', (f) => recycle.empty(id(f)));

  handle('safety:audit:list', (f, filter) =>
    auditList(
      context,
      id(f),
      z
        .object({
          from: z.string().max(10).optional(),
          to: z.string().max(10).optional(),
          entity: z.string().max(60).optional(),
          action: z.string().max(30).optional(),
          limit: z.number().int().positive().max(1000).optional(),
        })
        .parse(filter ?? {}),
    ),
  );
  handle('safety:audit:entities', (f) => auditEntities(context, id(f)));

  const check = z.enum([
    'integrity',
    'orphanLines',
    'totals',
    'allocations',
    'numbering',
    'negativeStock',
    'balances',
  ]);
  handle('safety:verify:run', (f) => runVerify(context, id(f)));
  handle('safety:verify:fix', (f, c) => applyVerifyFix(context, id(f), check.parse(c)));

  const pin = z.string().max(40);
  handle('safety:lock:status', () => lock.status());
  handle('safety:lock:setPin', (p, current) =>
    lock.setPin(pin.parse(p), current === undefined ? undefined : pin.parse(current)),
  );
  handle('safety:lock:removePin', (current) => lock.removePin(pin.parse(current)));
  handle('safety:lock:verify', (p) => lock.verify(pin.parse(p)));
  handle('safety:lock:recover', (code, p) => lock.recover(pin.parse(code), pin.parse(p)));
  handle('safety:lock:setOptions', (options, current) =>
    lock.setOptions(
      z
        .object({
          lockAfterMinutes: z.union([
            z.literal(0),
            z.literal(1),
            z.literal(5),
            z.literal(15),
            z.literal(30),
          ]),
          askPinForEdit: z.boolean(),
        })
        .partial()
        .parse(options),
      current === undefined ? undefined : pin.parse(current),
    ),
  );

  // Housekeeping: expired recycle-bin items, and automatic backups.
  try {
    recycle.purgeExpired();
  } catch (error) {
    console.error('Recycle bin cleanup failed', error);
  }
  const auto = () => {
    const config = store.read();
    if (!config.auto || config.frequency !== 'daily') return;
    if (!dailyBackupDue(config.lastBackupAt, new Date())) return;
    try {
      runBackup();
    } catch (error) {
      console.error('Automatic backup failed', error);
    }
  };
  setTimeout(auto, 8000).unref();
  setInterval(auto, 3_600_000).unref();
  let closing = false;
  app.on('before-quit', () => {
    const config = store.read();
    if (closing || !config.auto || config.frequency !== 'close') return;
    closing = true;
    try {
      runBackup();
      pruneFolder(folder(), config.keep);
    } catch (error) {
      console.error('Backup on close failed', error);
    }
  });
}
