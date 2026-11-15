import { eq } from 'drizzle-orm';
import { setupSales } from '../../db/sales-fixture.test-helper';
import * as s from '../../db/schema';
import { reportService } from './index';

export async function reportsFixture() {
  const f = await setupSales();
  const { context, firm, item, party } = f;
  context.db.update(s.stockLedger).set({ date: '2026-01-01' }).run();
  context.db.update(s.parties).set({ openingDate: '2026-01-01' }).run();
  context.db.update(s.firms).set({ gstin: '29ABCDE1234F1ZW' }).where(eq(s.firms.id, firm.id)).run();
  let number = 0;
  const txn = (input: {
    type?: string;
    date?: string;
    taxable: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    qty?: number;
    stockValue?: number;
    ref?: number;
    pos?: string;
    partyId?: number | null;
    itc?: boolean;
    rc?: boolean;
    status?: string;
    deleted?: boolean;
    gstin?: string;
  }) =>
    context.sqlite.transaction(() => {
      const cgst = input.cgst ?? 0,
        sgst = input.sgst ?? 0,
        igst = input.igst ?? 0;
      const total = input.taxable + cgst + sgst + igst;
      const doc = context.db
        .insert(s.txns)
        .values({
          firmId: firm.id,
          type: input.type ?? 'sale',
          partyId: input.partyId === undefined ? party.id : input.partyId,
          prefix: 'TEST-',
          number: ++number,
          date: input.date ?? '2026-11-10',
          dueDate: '2026-11-11',
          placeOfSupply: input.pos ?? '29',
          status: input.status ?? 'posted',
          refTxnId: input.ref,
          taxable: input.taxable,
          total,
          cgst,
          sgst,
          igst,
          itcEligible: input.itc ?? true,
          reverseCharge: input.rc ?? false,
          deletedAt: input.deleted ? '2026-11-10' : null,
          metadata: input.gstin ? JSON.stringify({ partyGstin: input.gstin }) : '{}',
          createdAt: '2026-11-10',
          updatedAt: '2026-11-10',
        })
        .returning()
        .get()!;
      context.db
        .insert(s.txnLines)
        .values({
          txnId: doc.id,
          itemId: item.id,
          name: item.name,
          hsn: '4901',
          qty: input.qty ?? 1,
          unitId: item.unitId,
          taxable: input.taxable,
          total,
          cgst,
          sgst,
          igst,
          taxBps: cgst || igst ? 1800 : 0,
        })
        .run();
      if (input.stockValue !== undefined)
        context.db
          .insert(s.stockLedger)
          .values({
            firmId: firm.id,
            itemId: item.id,
            txnId: doc.id,
            date: doc.date,
            qty: input.qty ?? 1,
            value: input.stockValue,
            reason: doc.type,
          })
          .run();
      return doc;
    })();
  const service = reportService(context, () => '2026-11-30');
  const filters = { from: '2026-11-01', to: '2026-11-30', asOn: '2026-11-30' };
  return { ...f, txn, service, filters };
}
