import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupsToPrune,
  buildManifest,
  dailyBackupDue,
  normalizeBackupConfig,
  reminderState,
  safeFirmName,
  validateManifest,
} from './backup';
import { daysLeft, purgeCutoff, restoreClash, type SeriesRow } from './recycle';
import { auditLabel, diffRecords, humanizeField, isMoneyField, parseAudit } from './audit';

const manifest = () =>
  buildManifest({
    appVersion: '0.1.0',
    schemaVersion: 100,
    createdAt: '2026-11-10T10:00:00.000Z',
    firms: ['Sharma Traders'],
    counts: { parties: 3, items: 4, transactions: 5 },
    assets: { images: 1, attachments: 0 },
    dbBytes: 1024,
    dbSha256: 'a'.repeat(64),
  });

describe('backup manifest and naming', () => {
  it('accepts its own manifest, rejects strangers and newer schemas in plain categories', () => {
    expect(validateManifest(manifest(), 100)).toMatchObject({ ok: true });
    expect(validateManifest(manifest(), 101)).toMatchObject({ ok: true });
    expect(validateManifest(manifest(), 99)).toEqual({ ok: false, reason: 'newer' });
    expect(validateManifest({ hello: 'world' }, 100)).toEqual({ ok: false, reason: 'notBackup' });
    expect(validateManifest(null, 100)).toEqual({ ok: false, reason: 'notBackup' });
    expect(validateManifest({ ...manifest(), dbSha256: 'xyz' }, 100).ok).toBe(false);
  });
  it('names files BillSathi-<firm>-<YYYY-MM-DD-HHmm>.bsbk', () => {
    const at = new Date(2026, 10, 9, 7, 5);
    expect(backupFileName('Sharma Traders & Sons!', at)).toBe(
      'BillSathi-Sharma-Traders-Sons-2026-11-09-0705.bsbk',
    );
    expect(backupFileName('शर्मा', at, 'prerestore')).toBe(
      'BillSathi-prerestore-शर्मा-2026-11-09-0705.bsbk',
    );
    expect(safeFirmName('///')).toBe('Business');
  });
  it('normalises stored configuration', () => {
    expect(normalizeBackupConfig(undefined)).toMatchObject({
      auto: false,
      keep: 10,
      frequency: 'daily',
    });
    expect(
      normalizeBackupConfig({ auto: true, keep: 500, frequency: 'close', folder: ' ' }),
    ).toMatchObject({
      auto: true,
      keep: 100,
      frequency: 'close',
      folder: null,
    });
    expect(normalizeBackupConfig({ keep: 0, lastBackupAt: 'nonsense' })).toMatchObject({
      keep: 1,
      lastBackupAt: null,
    });
  });
});

describe('retention pruning', () => {
  const file = (name: string, mtimeMs: number) => ({ name, mtimeMs });
  it('keeps the newest N regular backups and never prunes safety or foreign files', () => {
    const files = [
      ...Array.from({ length: 12 }, (_, i) =>
        file(`BillSathi-Shop-2026-11-${10 + i}-0900.bsbk`, i),
      ),
      file('BillSathi-prerestore-Shop-2026-01-01-0900.bsbk', -100),
      file('notes.txt', -200),
    ];
    const doomed = backupsToPrune(files, 10);
    expect(doomed).toEqual([
      'BillSathi-Shop-2026-11-11-0900.bsbk',
      'BillSathi-Shop-2026-11-10-0900.bsbk',
    ]);
    expect(backupsToPrune(files.slice(0, 3), 10)).toEqual([]);
    expect(backupsToPrune(files.slice(0, 3), 0)).toHaveLength(2);
  });
});

describe('backup reminder and schedule', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  it('reminds after 7 days and reports how long ago', () => {
    expect(reminderState('2026-11-11T10:00:00Z', null, now)).toEqual({ daysSince: 9, due: true });
    expect(reminderState('2026-11-14T10:00:00Z', null, now)).toEqual({ daysSince: 6, due: false });
  });
  it('with no backup yet counts from when the business was created', () => {
    expect(reminderState(null, '2026-11-01T00:00:00Z', now)).toEqual({
      daysSince: null,
      due: true,
    });
    expect(reminderState(null, '2026-11-19T00:00:00Z', now).due).toBe(false);
    expect(reminderState(null, null, now).due).toBe(false);
  });
  it('runs the daily auto backup only once a day', () => {
    expect(dailyBackupDue(null, now)).toBe(true);
    expect(dailyBackupDue('2026-11-20T01:00:00Z', now)).toBe(false);
    expect(dailyBackupDue('2026-11-19T09:59:00Z', now)).toBe(true);
  });
});

describe('recycle bin rules', () => {
  const row = (over: Partial<SeriesRow>): SeriesRow => ({
    id: 1,
    firmId: 1,
    type: 'sale',
    prefix: 'INV-',
    number: 7,
    deletedAt: '2026-11-01T00:00:00Z',
    ...over,
  });
  it('detects a live document that took the number', () => {
    const target = row({});
    expect(restoreClash(target, [target, row({ id: 2, number: 8, deletedAt: null })])).toBeNull();
    expect(restoreClash(target, [target, row({ id: 2, deletedAt: null })])?.id).toBe(2);
    expect(
      restoreClash(target, [target, row({ id: 3, deletedAt: '2026-11-02T00:00:00Z' })]),
    ).toBeNull();
    expect(
      restoreClash(target, [target, row({ id: 4, prefix: 'EST-', deletedAt: null })]),
    ).toBeNull();
    expect(restoreClash(target, [target, row({ id: 5, firmId: 2, deletedAt: null })])).toBeNull();
  });
  it('keeps items 30 days', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(purgeCutoff(now)).toBe('2026-10-11T00:00:00.000Z');
    expect(daysLeft('2026-11-10T00:00:00Z', now)).toBe(30);
    expect(daysLeft('2026-10-25T00:00:00Z', now)).toBe(14);
    expect(daysLeft('2026-09-01T00:00:00Z', now)).toBe(0);
  });
});

describe('audit trail readability', () => {
  it('lists only the fields that changed, with added and removed fields', () => {
    const before = { name: 'Rice', salePrice: 5000, hsn: '1006', metadata: '{"x":1}' };
    const after = { name: 'Rice', salePrice: 5500, code: 'R1', metadata: '{"x":2}' };
    expect(diffRecords(before, after)).toEqual([
      { path: 'salePrice', before: '5000', after: '5500', kind: 'changed' },
      { path: 'hsn', before: '1006', after: null, kind: 'removed' },
      { path: 'code', before: null, after: 'R1', kind: 'added' },
    ]);
    expect(diffRecords(null, { a: 1 })).toEqual([
      { path: 'a', before: null, after: '1', kind: 'added' },
    ]);
  });
  it('flattens nested documents and arrays', () => {
    const changes = diffRecords(
      { document: { lines: [{ name: 'A', qty: 1 }] } },
      {
        document: {
          lines: [
            { name: 'A', qty: 2 },
            { name: 'B', qty: 1 },
          ],
        },
      },
    );
    expect(changes.map((c) => c.path)).toEqual([
      'document.lines[1].qty',
      'document.lines[2].name',
      'document.lines[2].qty',
    ]);
  });
  it('humanizes field names, spots money, parses safely and labels rows', () => {
    expect(humanizeField('document.lines[2].salePrice')).toBe('Lines 2 · Sale Price');
    expect(isMoneyField('document.lines[1].price')).toBe(true);
    expect(isMoneyField('qty')).toBe(false);
    expect(parseAudit('{"a":1}')).toEqual({ a: 1 });
    expect(parseAudit('not json')).toBe('not json');
    expect(parseAudit(null)).toBeNull();
    const pad = (p: string, n: number) => `${p}${String(n).padStart(4, '0')}`;
    expect(auditLabel('txns', { prefix: 'INV-', number: 3, type: 'sale' }, null, pad)).toEqual({
      kind: 'doc',
      text: 'INV-0003',
      docType: 'sale',
    });
    expect(auditLabel('parties', null, { name: 'Ravi' }, pad)).toEqual({
      kind: 'name',
      text: 'Ravi',
    });
    expect(auditLabel('settings', { key: 'zoom' }, { key: 'zoom' }, pad).kind).toBe('setting');
    expect(auditLabel('firms', null, null, pad).kind).toBe('none');
  });
});
