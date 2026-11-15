import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import type { DatabaseContext } from '../db';
import {
  backupFileName,
  backupsToPrune,
  buildManifest,
  isBackupName,
  normalizeBackupConfig,
  validateManifest,
  type BackupConfig,
  type BackupManifest,
} from '../../shared/backup';
import type { BackupFileInfo, BackupPreview, InspectResult } from '../../shared/safety-api';

export const DB_FILE = 'billsathi.db';
export const ASSET_FOLDERS = ['images', 'attachments'] as const;
const SQLITE_MAGIC = 'SQLite format 3\0';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Last path segment for both Windows and POSIX separators; keeps archive names flat and safe. */
const flatName = (path: string) => path.split(/[\\/]/).pop() ?? '';

export interface Packed {
  manifest: BackupManifest;
  db: Uint8Array;
  assets: Map<string, Uint8Array>;
}
/** Zip: manifest.json + billsathi.db + assets/<folder>/<file>. */
export function packBackup(
  manifest: BackupManifest,
  db: Uint8Array,
  assets: Map<string, Uint8Array>,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    [DB_FILE]: db,
  };
  for (const [name, bytes] of assets) files[`assets/${name}`] = bytes;
  return zipSync(files, { level: 6 });
}
export class BackupError extends Error {
  constructor(readonly reason: 'notBackup' | 'newer' | 'corrupt') {
    super(reason);
  }
}
/** Opens and fully validates an archive; throws BackupError with a user-meaningful reason. */
export function unpackBackup(bytes: Uint8Array, currentSchema: number): Packed {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('notBackup');
  }
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new BackupError('notBackup');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new BackupError('notBackup');
  }
  const check = validateManifest(raw, currentSchema);
  if (!check.ok) throw new BackupError(check.reason);
  const db = files[DB_FILE];
  if (
    !db ||
    db.length !== check.manifest.dbBytes ||
    sha256(db) !== check.manifest.dbSha256 ||
    strFromU8(db.subarray(0, 16)) !== SQLITE_MAGIC
  )
    throw new BackupError('corrupt');
  const assets = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(files)) {
    const match = /^assets\/(images|attachments)\/([^/\\]+)$/.exec(path);
    if (match && match[2] !== '..' && match[2] !== '.') assets.set(`${match[1]}/${match[2]}`, data);
  }
  return { manifest: check.manifest, db, assets };
}

export function readAssets(userData: string): Map<string, Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  for (const folder of ASSET_FOLDERS) {
    const directory = join(userData, folder);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isFile()) assets.set(`${folder}/${name}`, readFileSync(path));
    }
  }
  return assets;
}

export function schemaVersion(context: DatabaseContext): number {
  const row = context.sqlite.prepare('SELECT MAX(created_at) AS v FROM __drizzle_migrations').get();
  return Number(row?.v ?? 0);
}
const count = (context: DatabaseContext, sql: string) =>
  Number(context.sqlite.prepare(sql).get()?.n ?? 0);

export function firmNames(context: DatabaseContext): string[] {
  return context.sqlite
    .prepare('SELECT name FROM firms WHERE deleted_at IS NULL ORDER BY id')
    .all()
    .map((r) => String(r.name));
}

export interface CreateOptions {
  userData: string;
  folder: string;
  appVersion: string;
  now?: Date;
  tag?: string;
  /** Exact output path (used by "Save as"); the folder option is ignored when given. */
  target?: string;
  keep?: number;
}
export function createBackup(context: DatabaseContext, options: CreateOptions) {
  const now = options.now ?? new Date();
  const db = readFileSync(join(options.userData, DB_FILE));
  const assets = readAssets(options.userData);
  const firms = firmNames(context);
  const manifest = buildManifest({
    appVersion: options.appVersion,
    schemaVersion: schemaVersion(context),
    createdAt: now.toISOString(),
    firms,
    counts: {
      parties: count(context, 'SELECT COUNT(*) n FROM parties WHERE deleted_at IS NULL'),
      items: count(context, 'SELECT COUNT(*) n FROM items WHERE deleted_at IS NULL'),
      transactions: count(context, 'SELECT COUNT(*) n FROM txns WHERE deleted_at IS NULL'),
    },
    assets: {
      images: [...assets.keys()].filter((k) => k.startsWith('images/')).length,
      attachments: [...assets.keys()].filter((k) => k.startsWith('attachments/')).length,
    },
    dbBytes: db.length,
    dbSha256: sha256(db),
  });
  const bytes = packBackup(manifest, db, assets);
  let path = options.target;
  if (!path) {
    mkdirSync(options.folder, { recursive: true });
    const name = backupFileName(firms[0] ?? 'Business', now, options.tag);
    path = join(options.folder, name);
    // Two backups in the same minute must not overwrite each other.
    if (existsSync(path)) path = path.replace(/\.bsbk$/, `-${now.getSeconds()}.bsbk`);
  }
  writeFileSync(path + '.part', bytes);
  renameSync(path + '.part', path);
  if (options.keep && !options.target) pruneFolder(options.folder, options.keep);
  return { path, size: bytes.length, manifest };
}

export function pruneFolder(folder: string, keep: number): string[] {
  if (!existsSync(folder)) return [];
  const files = readdirSync(folder)
    .filter(isBackupName)
    .map((name) => ({ name, mtimeMs: statSync(join(folder, name)).mtimeMs }));
  const doomed = backupsToPrune(files, keep);
  for (const name of doomed) unlinkSync(join(folder, name));
  return doomed;
}

function toPreview(path: string, size: number, manifest: BackupManifest): BackupPreview {
  return {
    path,
    fileName: basename(path),
    size,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    firms: manifest.firms,
    counts: manifest.counts,
  };
}
export function inspectBackup(path: string, currentSchema: number): InspectResult {
  try {
    const bytes = readFileSync(path);
    const packed = unpackBackup(bytes, currentSchema);
    return { ok: true, preview: toPreview(path, bytes.length, packed.manifest) };
  } catch (error) {
    return { ok: false, reason: error instanceof BackupError ? error.reason : 'notBackup' };
  }
}
export function listBackups(folder: string, currentSchema: number): BackupFileInfo[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter(isBackupName)
    .map((name) => {
      const path = join(folder, name),
        stat = statSync(path);
      const inspected = inspectBackup(path, currentSchema);
      return {
        name,
        path,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        preview: inspected.ok ? inspected.preview : null,
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** Points restored attachment rows at this computer's attachments folder. */
export async function rewriteAttachmentPaths(db: Uint8Array, attachmentsDir: string) {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const raw = new SQL.Database(db);
  try {
    const rows = raw.exec('SELECT id, path FROM attachments');
    const update = raw.prepare('UPDATE attachments SET path = ? WHERE id = ?');
    for (const [id, path] of rows[0]?.values ?? [])
      update.run([join(attachmentsDir, flatName(String(path))), id as number]);
    update.free();
    return raw.export();
  } catch {
    return db;
  } finally {
    raw.close();
  }
}

/** Replaces the database and asset folders under userData. The caller must have closed the DB. */
export async function applyRestore(userData: string, packed: Packed) {
  const stamp = Date.now();
  const staged = packed.assets;
  const db = await rewriteAttachmentPaths(packed.db, join(userData, 'attachments'));
  const dbPath = join(userData, DB_FILE);
  writeFileSync(dbPath + '.restore', db);
  for (const folder of ASSET_FOLDERS) {
    const stage = join(userData, `${folder}.restore`);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    for (const [name, bytes] of staged)
      if (name.startsWith(`${folder}/`)) writeFileSync(join(stage, flatName(name)), bytes);
  }
  // Everything is staged; now swap quickly.
  for (const folder of ASSET_FOLDERS) {
    const live = join(userData, folder),
      old = join(userData, `${folder}.old-${stamp}`);
    if (existsSync(live)) renameSync(live, old);
    renameSync(join(userData, `${folder}.restore`), live);
    rmSync(old, { recursive: true, force: true });
  }
  rmSync(dbPath + '.tmp', { force: true });
  renameSync(dbPath + '.restore', dbPath);
}

/** Persists the backup configuration next to the database (not inside it). */
export function configStore(userData: string) {
  const path = join(userData, 'backup-config.json');
  const read = (): BackupConfig => {
    try {
      return normalizeBackupConfig(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
      return normalizeBackupConfig({});
    }
  };
  const write = (patch: Partial<BackupConfig>): BackupConfig => {
    const next = normalizeBackupConfig({ ...read(), ...patch });
    writeFileSync(path + '.tmp', JSON.stringify(next, null, 2));
    renameSync(path + '.tmp', path);
    return next;
  };
  return { read, write };
}
