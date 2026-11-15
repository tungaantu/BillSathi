import { z } from 'zod';
/** Pure backup helpers: manifest, file names, retention and reminder rules. */
export const BACKUP_EXT = '.bsbk';
export const BACKUP_FORMAT = 'billsathi-backup';
export const REMINDER_DAYS = 7;
export const PRE_RESTORE_TAG = 'prerestore';

export const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(1),
  appVersion: z.string().max(40),
  schemaVersion: z.number().int().nonnegative(),
  createdAt: z.string().min(10).max(40),
  firms: z.array(z.string().max(200)).max(200),
  counts: z.object({
    parties: z.number().int().nonnegative(),
    items: z.number().int().nonnegative(),
    transactions: z.number().int().nonnegative(),
  }),
  assets: z.object({
    images: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(),
  }),
  dbBytes: z.number().int().positive(),
  dbSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type BackupManifest = z.infer<typeof manifestSchema>;

export function buildManifest(input: Omit<BackupManifest, 'format' | 'formatVersion'>) {
  return manifestSchema.parse({ format: BACKUP_FORMAT, formatVersion: 1, ...input });
}
export type ManifestCheck =
  { ok: true; manifest: BackupManifest } | { ok: false; reason: 'notBackup' | 'newer' };
/** Rejects anything that is not a BillSathi backup, or that was made by a newer database layout. */
export function validateManifest(raw: unknown, currentSchema: number): ManifestCheck {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'notBackup' };
  if (parsed.data.schemaVersion > currentSchema) return { ok: false, reason: 'newer' };
  return { ok: true, manifest: parsed.data };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const safeFirmName = (name: string) =>
  name
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'Business';
/** BillSathi-<firm>-<YYYY-MM-DD-HHmm>.bsbk using local time. */
export function backupFileName(firm: string, at: Date, tag = '') {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `BillSathi-${tag ? `${tag}-` : ''}${safeFirmName(firm)}-${stamp}${BACKUP_EXT}`;
}
export const isBackupName = (name: string) => /^BillSathi-.+\.bsbk$/.test(name);

export interface BackupFile {
  name: string;
  mtimeMs: number;
}
/** Names to delete so only the newest `keep` regular backups remain; safety backups are never pruned. */
export function backupsToPrune(files: BackupFile[], keep: number): string[] {
  const limit = Math.max(1, Math.floor(keep));
  return files
    .filter((f) => isBackupName(f.name) && !f.name.startsWith(`BillSathi-${PRE_RESTORE_TAG}-`))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name))
    .slice(limit)
    .map((f) => f.name);
}

export interface BackupConfig {
  auto: boolean;
  frequency: 'daily' | 'close';
  folder: string | null;
  keep: number;
  lastBackupAt: string | null;
}
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  auto: false,
  frequency: 'daily',
  folder: null,
  keep: 10,
  lastBackupAt: null,
};
export function normalizeBackupConfig(raw: unknown): BackupConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const keep = Number(r.keep);
  const last = typeof r.lastBackupAt === 'string' && !isNaN(Date.parse(r.lastBackupAt));
  return {
    auto: r.auto === true,
    frequency: r.frequency === 'close' ? 'close' : 'daily',
    folder: typeof r.folder === 'string' && r.folder.trim() ? r.folder : null,
    keep: Number.isInteger(keep) ? Math.min(100, Math.max(1, keep)) : DEFAULT_BACKUP_CONFIG.keep,
    lastBackupAt: last ? (r.lastBackupAt as string) : null,
  };
}

const DAY = 86_400_000;
export function daysBetween(fromIso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / DAY));
}
export interface ReminderState {
  daysSince: number | null;
  due: boolean;
}
/** Remind after 7 days without a backup; with no backup yet, count from when the business was created. */
export function reminderState(
  lastBackupAt: string | null,
  firmCreatedAt: string | null,
  now: Date,
): ReminderState {
  if (lastBackupAt) {
    const days = daysBetween(lastBackupAt, now);
    return { daysSince: days, due: days >= REMINDER_DAYS };
  }
  const sinceCreation =
    firmCreatedAt && !isNaN(Date.parse(firmCreatedAt)) ? daysBetween(firmCreatedAt, now) : 0;
  return { daysSince: null, due: sinceCreation >= REMINDER_DAYS };
}
/** True when the daily auto backup should run now. */
export function dailyBackupDue(lastBackupAt: string | null, now: Date): boolean {
  return !lastBackupAt || now.getTime() - Date.parse(lastBackupAt) >= DAY;
}
