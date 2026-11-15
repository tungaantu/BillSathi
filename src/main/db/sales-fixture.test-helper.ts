import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './index';
import { repositories } from './repositories';
import { masterRepository } from './masters';
import { salesRepository } from './sales';
import { blankItem, blankParty } from '../../shared/masters';
import { blankDocument, lineFromItem, type Receipt } from '../../shared/sales';
export async function setupSales() {
  const path = mkdtempSync(join(tmpdir(), 'billsathi-sales-')),
    context = await openDatabase(path);
  const repo = repositories(context),
    masters = masterRepository(context),
    sales = salesRepository(context);
  const firm = repo.create({
    name: 'Sales Test',
    phone: '9876543210',
    category: 'grocery',
    stateCode: '29',
    gstin: '',
    pan: '',
    address: 'Bengaluru',
    email: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    upiId: 'test@upi',
    demo: false,
  });
  const party = masters.saveParty(firm.id, null, {
    ...blankParty('29'),
    name: 'Customer',
    creditLimit: 1000000,
  });
  const item = masters.saveItem(firm.id, null, {
    ...blankItem(),
    name: 'Book',
    code: 'BOOK',
    unitId: masters.lookups(firm.id).units[0].id,
    salePrice: 10000,
    purchasePrice: 6000,
    openingQty: 20,
    openingPrice: 6000,
  });
  const accounts = sales.accounts(firm.id),
    cash = accounts.find((a) => a.type === 'cash')!,
    upi = accounts.find((a) => a.type === 'upi')!;
  const document = (qty = 1) => ({
    ...blankDocument('sale', '29'),
    date: '2026-11-10',
    partyId: party.id,
    partyName: party.name,
    phone: '9876543210',
    roundMode: 'off' as const,
    lines: [lineFromItem(item, 1800, qty)],
  });
  const receipt = (amount: number): Receipt => ({
    type: 'payment_in',
    attachmentIds: [],
    reference: '',
    chequeDate: '',
    partyId: party.id,
    amount,
    discount: 0,
    accountId: cash.id,
    date: '2026-11-10',
    prefix: 'RCPT-',
    number: sales.next(firm.id, 'payment_in', 'RCPT-'),
    description: '',
    allocations: [],
    auto: true,
  });
  return { path, context, repo, masters, sales, firm, party, item, cash, upi, document, receipt };
}
