import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { setupSales } from '../db/sales-fixture.test-helper';
import { openDatabase } from '../db';
import { repositories } from '../db/repositories';
import * as s from '../db/schema';
import {
  applyRestore,
  BackupError,
  configStore,
  createBackup,
  inspectBackup,
  listBackups,
  packBackup,
  schemaVersion,
  unpackBackup,
} from './backup';
import { buildManifest } from '../../shared/backup';

const dirs: string[] = [];
const closers: (() => void)[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'billsathi-backup-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function business() {
  const f = await setupSales();
  closers.push(() => f.context.sqlite.close());
  dirs.push(f.path);
  mkdirSync(join(f.path, 'images'));
  writeFileSync(join(f.path, 'images', 'logo.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  mkdirSync(join(f.path, 'attachments'));
  writeFileSync(join(f.path, 'attachments', 'bill.pdf'), 'PDF-BYTES');
  f.context.db
    .insert(s.attachments)
    .values({ firmId: f.firm.id, path: join(f.path, 'attachments', 'bill.pdf'), name: 'bill.pdf' })
    .run();
  f.sales.save(f.firm.id, null, f.document(1));
  return f;
}

describe('backup file round trip', () => {
  it('writes one .bsbk zip holding the database, assets and a manifest with counts', async () => {
    const f = await business();
    const folder = join(temp(), 'out');
    const made = createBackup(f.context, {
      userData: f.path,
      folder,
      appVersion: '0.1.0',
      now: new Date(2026, 10, 10, 9, 30),
    });
    expect(made.path).toBe(join(folder, 'BillSathi-Sales-Test-2026-11-10-0930.bsbk'));
    const files = unzipSync(readFileSync(made.path));
    expect(Object.keys(files).sort()).toEqual([
      'assets/attachments/bill.pdf',
      'assets/images/logo.png',
      'billsathi.db',
      'manifest.json',
    ]);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    expect(manifest).toMatchObject({
      appVersion: '0.1.0',
      schemaVersion: schemaVersion(f.context),
      firms: ['Sales Test'],
      counts: { parties: 1, items: 1, transactions: 1 },
      assets: { images: 1, attachments: 1 },
    });
    const packed = unpackBackup(readFileSync(made.path), schemaVersion(f.context));
    expect(packed.db).toEqual(new Uint8Array(readFileSync(join(f.path, 'billsathi.db'))));
    expect([...packed.assets.keys()].sort()).toEqual(['attachments/bill.pdf', 'images/logo.png']);
  });

  it('refuses files that are not backups, corrupted, or from a newer app', async () => {
    const f = await business();
    const current = schemaVersion(f.context);
    const made = createBackup(f.context, { userData: f.path, folder: temp(), appVersion: '1' });
    const good = readFileSync(made.path);
    const reason = (bytes: Uint8Array) => {
      try {
        unpackBackup(bytes, current);
      } catch (e) {
        return e instanceof BackupError ? e.reason : 'other';
      }
      return 'none';
    };
    expect(reason(good)).toBe('none');
    expect(reason(strToU8('just text'))).toBe('notBackup');
    expect(reason(zipSync({ 'hello.txt': strToU8('hi') }))).toBe('notBackup');
    expect(() => unpackBackup(good, current - 1)).toThrow(BackupError);
    expect(reason(strToU8('x'))).toBe('notBackup');
    // Flip a database byte but keep the manifest: caught by size/hash check.
    const files = unzipSync(good);
    const db = new Uint8Array(files['billsathi.db']);
    db[200] ^= 0xff;
    expect(reason(zipSync({ ...files, 'billsathi.db': db }))).toBe('corrupt');
    const newer = buildManifest({
      ...JSON.parse(strFromU8(files['manifest.json'])),
      schemaVersion: current + 1,
    });
    expect(reason(packBackup(newer, files['billsathi.db'], new Map()))).toBe('newer');
    // Path tricks in the archive are ignored.
    const sneaky = unpackBackup(
      zipSync({
        ...files,
        'assets/images/../../evil.txt': strToU8('x'),
        'assets/images/ok.png': strToU8('y'),
      }),
      current,
    );
    expect([...sneaky.assets.keys()].sort()).toEqual([
      'attachments/bill.pdf',
      'images/logo.png',
      'images/ok.png',
    ]);
    expect(inspectBackup(made.path, current)).toMatchObject({
      ok: true,
      preview: { counts: { transactions: 1 } },
    });
    expect(inspectBackup(join(temp(), 'missing.bsbk'), current)).toEqual({
      ok: false,
      reason: 'notBackup',
    });
  });

  it('restores the database and assets into a fresh folder and fixes attachment paths', async () => {
    const f = await business();
    const made = createBackup(f.context, { userData: f.path, folder: temp(), appVersion: '1' });
    const target = temp();
    mkdirSync(join(target, 'images'));
    writeFileSync(join(target, 'images', 'stale.png'), 'old');
    await applyRestore(target, unpackBackup(readFileSync(made.path), schemaVersion(f.context)));
    expect(existsSync(join(target, 'images', 'stale.png'))).toBe(false);
    expect(readFileSync(join(target, 'images', 'logo.png')).length).toBe(7);
    expect(readFileSync(join(target, 'attachments', 'bill.pdf'), 'utf8')).toBe('PDF-BYTES');
    expect(readdirSync(target).sort()).toEqual(['attachments', 'billsathi.db', 'images']);
    const reopened = await openDatabase(target);
    closers.push(() => reopened.sqlite.close());
    expect(
      repositories(reopened)
        .list()
        .map((x) => x.name),
    ).toEqual(['Sales Test']);
    expect(reopened.db.select().from(s.txns).all()).toHaveLength(1);
    expect(reopened.db.select().from(s.attachments).all()[0].path).toBe(
      join(target, 'attachments', 'bill.pdf'),
    );
  });
});

describe('backup folder', () => {
  it('prunes to the newest N, lists history newest first and stores config beside the database', async () => {
    const f = await business();
    const folder = temp();
    for (let i = 0; i < 4; i++) {
      const made = createBackup(f.context, {
        userData: f.path,
        folder,
        appVersion: '1',
        now: new Date(2026, 10, 1 + i, 10, 0),
      });
      utimesSync(made.path, new Date(2026, 10, 1 + i), new Date(2026, 10, 1 + i));
    }
    createBackup(f.context, {
      userData: f.path,
      folder,
      appVersion: '1',
      tag: 'prerestore',
      now: new Date(2026, 9, 1),
    });
    const last = createBackup(f.context, {
      userData: f.path,
      folder,
      appVersion: '1',
      now: new Date(2026, 10, 9, 10, 0),
      keep: 3,
    });
    const names = readdirSync(folder).sort();
    expect(names).toHaveLength(4);
    expect(names.some((n) => n.includes('prerestore'))).toBe(true);
    expect(names.some((n) => n.includes('2026-11-01-'))).toBe(false);
    expect(names.some((n) => n.includes('2026-11-02-'))).toBe(false);
    const history = listBackups(folder, schemaVersion(f.context));
    expect(history[0].path).toBe(last.path);
    expect(history.every((h) => h.preview?.firms[0] === 'Sales Test')).toBe(true);
    const store = configStore(f.path);
    expect(store.read().keep).toBe(10);
    expect(store.write({ auto: true, keep: 3 })).toMatchObject({ auto: true, keep: 3 });
    expect(configStore(f.path).read()).toMatchObject({ auto: true, keep: 3 });
  });
});
