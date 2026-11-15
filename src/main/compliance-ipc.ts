import { writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import type { DatabaseContext } from './db';
import { complianceStore } from './services/compliance/store';
import { ewayCheck, ewayFile, type EwayBill } from './services/compliance/ewaybill';
import { einvoiceCheck } from './services/compliance/einvoice';
import { tallyData } from './services/compliance/tally-data';
import { buildMastersXml, buildVouchersXml, countMasters } from './services/compliance/tally-xml';
import { normalizeAckDate } from './services/compliance/common';
import { displayDocumentNumber } from '../shared/numbering';
import {
  EWB_THRESHOLD_PAISE,
  einvoiceAckSchema,
  einvoiceOptionsSchema,
  ewbNumberSchema,
  tallyOptionsSchema,
  transportSchema,
  type BulkEwayResult,
  type CheckResult,
  type SaveResult,
  type TallyCounts,
  type TallySaveResult,
} from '../shared/compliance-api';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerComplianceIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const store = complianceStore(context);
  const id = (v: unknown) => z.number().int().positive().parse(v);
  const window = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  async function saveText(defaultName: string, filter: string, ext: string, text: string) {
    const result = await dialog.showSaveDialog(window(), {
      defaultPath: defaultName,
      filters: [{ name: filter, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, text, 'utf8');
    return result.filePath;
  }
  const fileSafe = (text: string) => text.replace(/[^a-z0-9_-]/gi, '_');

  handle('compliance:record', (f, i) => store.readRecord(id(f), id(i)));

  function ewayResult(f: number, i: number, transportInput: unknown) {
    const transport = transportSchema.parse(transportInput);
    const checked = ewayCheck(store.source(f, i), transport);
    return { transport, bill: checked.bill, result: toResult(checked, store.readRecord(f, i)) };
  }
  const toResult = (
    checked: { issues: CheckResult['issues']; summary: CheckResult['summary'] },
    record: CheckResult['record'],
  ): CheckResult => ({ issues: checked.issues, summary: checked.summary, record });

  handle('compliance:ewayCheck', (f, i, t) => ewayResult(id(f), id(i), t).result);
  handle('compliance:ewaySave', async (f, i, t): Promise<SaveResult> => {
    const firm = id(f),
      invoice = id(i);
    const { transport, bill, result } = ewayResult(firm, invoice, t);
    if (!bill) return { ...result, path: null };
    const path = await saveText(
      `EWB-${fileSafe(bill.docNo)}.json`,
      'JSON',
      'json',
      JSON.stringify(ewayFile([bill]), null, 2),
    );
    if (path) store.saveRecord(firm, invoice, { transport });
    return { ...result, path, record: store.readRecord(firm, invoice) };
  });
  handle('compliance:ewaySaveNumber', (f, i, n) =>
    store.saveRecord(id(f), id(i), {
      ewbNo: n === '' ? undefined : ewbNumberSchema.parse(n),
    }),
  );
  handle('compliance:ewayBulk', async (f, from, to, t): Promise<BulkEwayResult> => {
    const firm = id(f),
      start = isoDate.parse(from),
      end = isoDate.parse(to);
    const transport = transportSchema.parse(t);
    if (start > end) throw new Error('validation');
    const bills: EwayBill[] = [];
    const skipped: BulkEwayResult['skipped'] = [],
      warnings: BulkEwayResult['warnings'] = [];
    const rows = store.sales
      .list(firm, 'sale')
      .filter((r) => r.status === 'posted' && r.date >= start && r.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    for (const row of rows) {
      const label = displayDocumentNumber({ ...row, firmId: firm });
      const checked = ewayCheck(store.source(firm, row.id), transport);
      const small = row.total < EWB_THRESHOLD_PAISE;
      if (!checked.bill || small) {
        skipped.push({
          id: row.id,
          label,
          issues: checked.issues.filter(
            (x) => x.severity === 'error' || x.code === 'belowThreshold',
          ),
        });
      } else {
        bills.push(checked.bill);
        const notes = checked.issues.filter((x) => x.severity === 'warning');
        if (notes.length) warnings.push({ id: row.id, label, issues: notes });
      }
    }
    const path = bills.length
      ? await saveText(
          `EWB-${start}_to_${end}.json`,
          'JSON',
          'json',
          JSON.stringify(ewayFile(bills), null, 2),
        )
      : null;
    return { path, included: bills.length, skipped, warnings };
  });

  function einvoiceResult(f: number, i: number, optionsInput: unknown) {
    const options = einvoiceOptionsSchema.parse(optionsInput);
    const checked = einvoiceCheck(store.source(f, i), options);
    return { options, json: checked.json, result: toResult(checked, store.readRecord(f, i)) };
  }
  handle('compliance:einvoiceCheck', (f, i, o) => einvoiceResult(id(f), id(i), o).result);
  handle('compliance:einvoiceSave', async (f, i, o): Promise<SaveResult> => {
    const firm = id(f),
      invoice = id(i);
    const { options, json, result } = einvoiceResult(firm, invoice, o);
    if (!json) return { ...result, path: null };
    const path = await saveText(
      `EINV-${fileSafe(json.DocDtls.No)}.json`,
      'JSON',
      'json',
      JSON.stringify([json], null, 2),
    );
    if (path) store.saveRecord(firm, invoice, { supplyType: options.supplyType });
    return { ...result, path, record: store.readRecord(firm, invoice) };
  });
  handle('compliance:einvoiceSaveAck', (f, i, ack) =>
    store.saveRecord(id(f), id(i), {
      einvoice:
        ack === null
          ? undefined
          : (({ ackDate, ...rest }) => ({ ...rest, ackDate: normalizeAckDate(ackDate) }))(
              einvoiceAckSchema.parse(ack),
            ),
    }),
  );

  function tally(f: unknown, o: unknown) {
    const firm = id(f),
      options = tallyOptionsSchema.parse(o);
    if (options.from > options.to || (!options.masters && !options.vouchers))
      throw new Error('validation');
    return { options, build: tallyData(context, firm, options) };
  }
  const counts = (built: ReturnType<typeof tally>['build'], masters: boolean): TallyCounts => ({
    ...(masters ? countMasters(built.data) : { ledgers: 0, stockItems: 0, units: 0 }),
    vouchers: built.data.vouchers.length,
    warnings: built.warnings,
  });
  handle('compliance:tallyCount', (f, o) => {
    const { options, build } = tally(f, o);
    return counts(build, options.masters);
  });
  handle('compliance:tallySave', async (f, o): Promise<TallySaveResult | null> => {
    const { options, build } = tally(f, o);
    const stamp = `${options.from}_to_${options.to}`;
    const result = await dialog.showSaveDialog(window(), {
      defaultPath: `Tally-${stamp}.xml`,
      filters: [{ name: 'Tally XML', extensions: ['xml'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const stem = join(
      dirname(result.filePath),
      basename(result.filePath, extname(result.filePath)),
    );
    const paths: string[] = [];
    const both = options.masters && options.vouchers;
    if (options.masters) {
      const path = `${stem}${both ? '-masters' : ''}.xml`;
      writeFileSync(path, buildMastersXml(build.data), 'utf8');
      paths.push(path);
    }
    if (options.vouchers) {
      const path = `${stem}${both ? '-vouchers' : ''}.xml`;
      writeFileSync(path, buildVouchersXml(build.data), 'utf8');
      paths.push(path);
    }
    return { ...counts(build, options.masters), paths };
  });
}
