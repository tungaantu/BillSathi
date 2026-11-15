import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { DatabaseContext } from '../../db';
import { txns } from '../../db/schema';
import { salesRepository } from '../../db/sales';
import { masterRepository } from '../../db/masters';
import type { ComplianceRecord } from '../../../shared/compliance-api';
import type { Party } from '../../../shared/masters';
import type { ComplianceSource, Counterparty } from './common';

/** Loads invoices for the pure builders and keeps IRN / e-way bill data with the invoice. */
export function complianceStore(context: DatabaseContext) {
  const sales = salesRepository(context),
    masters = masterRepository(context);

  function counterparty(doc: ReturnType<typeof sales.get>, party: Party | undefined): Counterparty {
    return {
      name: doc.partyName || party?.name || '',
      gstin: (doc.partyGstin || party?.gstin || '').trim(),
      stateCode: party?.stateCode || doc.placeOfSupply,
      address: (doc.billingAddress || party?.billingAddress || '').trim(),
      phone: doc.phone || party?.phone || '',
      email: party?.email ?? '',
    };
  }

  function source(firm: number, id: number): ComplianceSource {
    const doc = sales.get(firm, id);
    const party = doc.partyId ? masters.parties(firm).find((p) => p.id === doc.partyId) : undefined;
    const units = Object.fromEntries(
      masters.lookups(firm).units.map((u) => [u.id, { name: u.name, symbol: u.symbol }]),
    );
    let original: ComplianceSource['original'];
    if (doc.refTxnId) {
      try {
        const o = sales.get(firm, doc.refTxnId);
        original = { prefix: o.prefix, number: o.number, date: o.date };
      } catch {
        original = undefined;
      }
    }
    return {
      firm: sales.repo.get(firm),
      party: counterparty(doc, party),
      shippingAddress: doc.shippingAddress || party?.shippingAddress || '',
      doc,
      units,
      original,
    };
  }

  const readRecord = (firm: number, id: number): ComplianceRecord => {
    const meta = JSON.parse(sales.own(firm, id).metadata) as { compliance?: ComplianceRecord };
    return meta.compliance ?? {};
  };

  /** Merge into the invoice's compliance record; `undefined` values remove a field. */
  function saveRecord(firm: number, id: number, patch: Partial<ComplianceRecord>) {
    return context.sqlite.transaction(() => {
      const row = sales.own(firm, id);
      const meta = JSON.parse(row.metadata) as Record<string, unknown> & {
        compliance?: ComplianceRecord;
      };
      const merged: ComplianceRecord = { ...meta.compliance, ...patch };
      for (const key of Object.keys(merged) as (keyof ComplianceRecord)[])
        if (merged[key] === undefined) delete merged[key];
      meta.compliance = merged;
      context.db
        .update(txns)
        .set({ metadata: JSON.stringify(meta) })
        .where(eq(txns.id, id))
        .run();
      sales.repo.audit(firm, 'txns', id, 'compliance', { compliance: meta.compliance }, merged);
      return merged;
    })();
  }

  /** E-invoice block for the printed invoice: IRN, acknowledgement and the signed QR image. */
  async function printBlock(firm: number, id: number) {
    const ack = readRecord(firm, id).einvoice;
    if (!ack) return undefined;
    let qr: string | undefined;
    try {
      if (ack.signedQr)
        qr = await QRCode.toDataURL(ack.signedQr, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'L',
        });
    } catch {
      qr = undefined; // text too long for a QR code: the IRN is still printed
    }
    return { irn: ack.irn, ackNo: ack.ackNo, ackDate: ack.ackDate, qr };
  }

  return { source, readRecord, saveRecord, printBlock, sales, masters };
}
