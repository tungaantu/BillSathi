import { and, between, eq, isNull } from 'drizzle-orm';
import type { DatabaseContext } from '../../db';
import * as s from '../../db/schema';
import { repositories } from '../../db/repositories';
import { masterRepository } from '../../db/masters';
import { baseQuantity } from '../../../shared/masters';
import { displayDocumentNumber } from '../../../shared/numbering';
import type { TallyOptions, TallyVoucherKind } from '../../../shared/compliance-api';
import { extractPincode, stateName } from './common';
import { uqcFor } from './uqc';
import {
  uniqueNames,
  type TallyAccountLedger,
  type TallyData,
  type TallyParty,
  type TallyStockItem,
  type TallyVoucher,
} from './tally-xml';

const GOODS: TallyVoucherKind[] = ['sale', 'purchase', 'sale_return', 'purchase_return'];
/** A payment taken together with a goods bill becomes its own Receipt / Payment voucher. */
const SETTLEMENT: Record<string, TallyVoucherKind> = {
  sale: 'payment_in',
  purchase_return: 'payment_in',
  purchase: 'payment_out',
  sale_return: 'payment_out',
};
const DEFAULT_ACCOUNT = /^(cash|bank|upi|cheque|card)$/;
const accountName = (name: string, type: string) =>
  name === type && DEFAULT_ACCOUNT.test(name)
    ? { cash: 'Cash', bank: 'Bank', upi: 'UPI', cheque: 'Cheque', card: 'Card' }[type]!
    : name;

export interface TallyBuild {
  data: TallyData;
  warnings: { code: string; count: number }[];
}

/** Reads the books and shapes them for tally-xml.ts (all money in integer paise). */
export function tallyData(
  context: DatabaseContext,
  firm: number,
  options: TallyOptions,
): TallyBuild {
  const db = context.db;
  const company = repositories(context).get(firm);
  const masters = masterRepository(context);
  const warnings: TallyBuild['warnings'] = [];
  const lookups = masters.lookups(firm);
  const unitById = new Map(lookups.units.map((u) => [u.id, u]));
  const allTxns = db
    .select()
    .from(s.txns)
    .where(and(eq(s.txns.firmId, firm), eq(s.txns.status, 'posted'), isNull(s.txns.deletedAt)))
    .all();

  // Customer or supplier? Anyone we only ever buy from / pay is a Sundry Creditor.
  const buys = new Set<number>(),
    sells = new Set<number>();
  for (const t of allTxns) {
    if (!t.partyId) continue;
    if (['purchase', 'purchase_return', 'payment_out'].includes(t.type)) buys.add(t.partyId);
    else sells.add(t.partyId);
  }
  const rawParties = masters.parties(firm);
  const partyNames = uniqueNames(rawParties.map((p) => p.name));
  const partyLedger = new Map(rawParties.map((p, i) => [p.id, partyNames[i]]));
  const duplicates = partyNames.filter((n, i) => n !== rawParties[i].name.trim()).length;
  if (duplicates) warnings.push({ code: 'duplicateParties', count: duplicates });
  const parties: TallyParty[] = rawParties.map((p) => ({
    ledgerName: partyLedger.get(p.id)!,
    group: buys.has(p.id) && !sells.has(p.id) ? 'Sundry Creditors' : 'Sundry Debtors',
    gstin: p.gstin,
    gstType: p.gstType,
    stateName: stateName(p.stateCode),
    address: p.billingAddress,
    pincode: String(extractPincode(p.billingAddress) ?? ''),
    phone: p.phone,
    email: p.email,
    openingBalance: p.openingBalance,
  }));

  const products = masters.items(firm).filter((i) => i.type === 'product');
  const itemNames = uniqueNames(products.map((i) => i.name));
  const itemById = new Map(products.map((i, n) => [i.id, { item: i, name: itemNames[n] }]));
  const taxRows = db.select().from(s.taxRates).all();
  const unitSymbol = (id: number | null) => (id ? (unitById.get(id)?.symbol ?? 'Nos') : 'Nos');
  const usedUnits = new Set<string>(['Nos']);
  const stockItems: TallyStockItem[] = products.map((i) => {
    const rate = taxRows.find((r) => r.id === i.taxRateId);
    const unit = unitSymbol(i.unitId);
    usedUnits.add(unit);
    return {
      name: itemById.get(i.id)!.name,
      unit,
      hsn: i.hsn,
      taxBps: rate?.rateBps ?? 0,
      cessBps: i.cessBps ?? 0,
      exempt: Boolean(rate?.exempt),
    };
  });
  const units = [...usedUnits].map((symbol) => {
    const unit = lookups.units.find((u) => u.symbol === symbol);
    return { symbol, uqc: uqcFor(unit?.name ?? symbol) };
  });

  const accountRows = db
    .select()
    .from(s.paymentAccounts)
    .where(and(eq(s.paymentAccounts.firmId, firm), isNull(s.paymentAccounts.deletedAt)))
    .all();
  const ledgerOfAccount = new Map(accountRows.map((a) => [a.id, accountName(a.name, a.type)]));
  const accounts: TallyAccountLedger[] = accountRows.map((a) => ({
    name: accountName(a.name, a.type),
    parent: a.type === 'cash' ? 'Cash-in-Hand' : 'Bank Accounts',
  }));

  const vouchers: TallyVoucher[] = [];
  if (options.vouchers) {
    const kinds = new Set<string>(options.voucherKinds);
    const settlementWanted = new Set(options.voucherKinds);
    const inRange = db
      .select()
      .from(s.txns)
      .where(
        and(
          eq(s.txns.firmId, firm),
          eq(s.txns.status, 'posted'),
          isNull(s.txns.deletedAt),
          between(s.txns.date, options.from, options.to),
        ),
      )
      .all()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const links = db.select().from(s.paymentLinks).all();
    const byId = new Map(allTxns.map((t) => [t.id, t]));
    for (const t of inRange) {
      const meta = JSON.parse(t.metadata) as { partyGstin?: string };
      const party = t.partyId ? rawParties.find((p) => p.id === t.partyId) : undefined;
      const partyName = t.partyId
        ? (partyLedger.get(t.partyId) ?? options.ledgers.cash)
        : options.ledgers.cash;
      const number = displayDocumentNumber(t);
      const payments = db
        .select()
        .from(s.txnPayments)
        .where(eq(s.txnPayments.txnId, t.id))
        .all()
        .map((p) => ({
          ledger: ledgerOfAccount.get(p.accountId) ?? options.ledgers.cash,
          amount: p.amount,
        }))
        .filter((p) => p.amount > 0);
      const base = {
        number,
        date: t.date,
        partyName,
        partyGstin: meta.partyGstin ?? party?.gstin ?? '',
        placeOfSupply: stateName(t.placeOfSupply ?? ''),
        narration: t.description ?? '',
        total: t.total,
        cgst: t.cgst,
        sgst: t.sgst,
        igst: t.igst,
        cess: t.cess,
        chargesTaxable: 0,
        lines: [],
        payments: [],
        discount: 0,
        against: [],
      } satisfies Omit<TallyVoucher, 'kind'>;
      if (GOODS.includes(t.type as TallyVoucherKind)) {
        if (kinds.has(t.type)) {
          const lines = db
            .select()
            .from(s.txnLines)
            .where(eq(s.txnLines.txnId, t.id))
            .all()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((l) => {
              const found = l.itemId ? itemById.get(l.itemId) : undefined;
              if (!found)
                return {
                  stock: false,
                  name: l.name,
                  unit: '',
                  qty: l.qty,
                  freeQty: l.freeQty ?? 0,
                  taxable: l.taxable,
                };
              const { item, name } = found;
              const secondary = l.unitId && l.unitId === item.secondaryUnitId;
              const factor = secondary ? item.conversion : 1;
              const convert = (qty: number) => {
                try {
                  return baseQuantity(qty, factor);
                } catch {
                  return Math.round(qty * factor * 1000) / 1000;
                }
              };
              return {
                stock: true,
                name,
                unit: unitSymbol(item.unitId),
                qty: convert(l.qty),
                freeQty: convert(l.freeQty ?? 0),
                taxable: l.taxable,
              };
            });
          const charges = db
            .select()
            .from(s.additionalCharges)
            .where(eq(s.additionalCharges.txnId, t.id))
            .all()
            .reduce((n, c) => n + c.taxable, 0);
          vouchers.push({
            ...base,
            kind: t.type as TallyVoucherKind,
            lines,
            chargesTaxable: charges,
          });
        }
        const settle = SETTLEMENT[t.type];
        if (settle && settlementWanted.has(settle)) {
          const settled = payments.filter((p) => p.ledger !== partyName);
          const amount = settled.reduce((n, p) => n + p.amount, 0);
          if (amount > 0)
            vouchers.push({
              ...base,
              kind: settle,
              number: `${number}/${settle === 'payment_in' ? 'R' : 'P'}`,
              total: amount,
              payments: settled,
              against: [{ ref: number, amount }],
              narration: '',
            });
        }
      } else if (['payment_in', 'payment_out'].includes(t.type) && kinds.has(t.type)) {
        const against = links
          .filter((l) => l.paymentTxnId === t.id)
          .flatMap((l) => {
            const invoice = byId.get(l.invoiceTxnId);
            return invoice ? [{ ref: displayDocumentNumber(invoice), amount: l.amount }] : [];
          });
        vouchers.push({
          ...base,
          kind: t.type as TallyVoucherKind,
          payments,
          discount: t.discount,
          against,
        });
      }
    }
  }
  return {
    data: {
      company: options.companyName || company.name,
      ledgerNames: options.ledgers,
      parties: options.masters ? parties : [],
      stockItems: options.masters ? stockItems : [],
      units: options.masters ? units : [],
      accounts: options.masters ? accounts : [],
      vouchers,
      includeOpening: options.openingBalances,
    },
    warnings,
  };
}
