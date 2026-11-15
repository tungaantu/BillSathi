import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from './index';
import { repositories } from './repositories';
import { salesRepository } from './sales';
import { financeRepository } from './finance';
import { masterRepository } from './masters';
import { blankBank } from '../../shared/finance';
import {
  blankDocument,
  blankLine,
  documentLineFromItem,
  dueAfter,
  totals,
} from '../../shared/sales';
import { today } from '../../shared/masters';
import * as s from './schema';
export function seedFinanceDemo(context: DatabaseContext, firm: number) {
  const repo = repositories(context);
  if (!repo.get(firm).demo || repo.getSettings(firm)['demo.phase4']) return;
  context.sqlite.transaction(() => {
    const before = {
      txns: context.db
        .select()
        .from(s.txns)
        .where(eq(s.txns.firmId, firm))
        .all()
        .map((t) => t.id),
      accounts: context.db
        .select()
        .from(s.paymentAccounts)
        .where(eq(s.paymentAccounts.firmId, firm))
        .all()
        .map((a) => a.id),
      loans: context.db
        .select()
        .from(s.loans)
        .where(eq(s.loans.firmId, firm))
        .all()
        .map((l) => l.id),
    };
    const finance = financeRepository(context),
      sales = salesRepository(context),
      masters = masterRepository(context),
      company = repo.get(firm);
    const banks = [
      finance.saveAccount(firm, null, {
        ...blankBank(),
        name: 'Market current account',
        bankName: 'Demo Commerce Bank',
        accountNumber: '123456789012',
        ifsc: 'DEMO0000123',
        upiId: 'demo@upi',
        openingBalance: 2500000,
        printOnInvoice: true,
        isDefault: true,
      }),
      finance.saveAccount(firm, null, {
        ...blankBank(),
        name: 'Reserve account',
        bankName: 'Demo Savings Bank',
        accountNumber: '987654321012',
        openingBalance: 1000000,
      }),
    ];
    const parties = masters.parties(firm),
      items = masters.items(firm),
      cash = finance.accounts(firm).find((a) => a.type === 'cash')!,
      cheque = finance.accounts(firm).find((a) => a.type === 'cheque')!;
    if (!parties.length || !items.length) throw new Error('validation');
    for (let i = 0; i < 8; i++) {
      const party = parties[(i + 5) % parties.length],
        item = items[i % items.length];
      const bill = sales.save(firm, null, {
        ...blankDocument('purchase', company.stateCode),
        partyId: party.id,
        partyName: party.name,
        phone: party.phone,
        number: sales.next(firm, 'purchase', 'PUR-'),
        date: dueAfter(today(), -i),
        supplierBillNo: `SUP-${101 + i}`,
        supplierBillDate: dueAfter(today(), -i),
        lines: [documentLineFromItem('purchase', item, 0, 5 + i)],
        payments: i % 3 === 0 ? [{ accountId: cash.id, amount: 10000, reference: '' }] : [],
      });
      const paid = Math.min(10000, bill.balance);
      if (i < 3 && paid)
        sales.receipt(firm, {
          type: 'payment_out',
          partyId: party.id,
          amount: paid,
          discount: 0,
          accountId: i === 0 ? cheque.id : banks[0],
          date: today(),
          prefix: 'PAY-',
          number: i + 1,
          description: 'Demo supplier payment',
          allocations: [{ invoiceId: bill.id, amount: paid }],
          auto: false,
          reference: i === 0 ? 'DEMO-CH-01' : '',
          chequeDate: dueAfter(today(), 2),
          attachmentIds: [],
        });
    }
    const categories = sales.categories(firm, 'expense');
    for (let i = 0; i < 10; i++) {
      const doc = {
        ...blankDocument('expense', company.stateCode),
        number: sales.next(firm, 'expense', 'EXP-'),
        date: dueAfter(today(), -(i % 7)),
        categoryId: categories[i % categories.length].id,
        lines: [
          {
            ...blankLine(),
            name: 'Demo business expense',
            price: (i + 1) * 10000,
            taxBps: i % 3 === 0 ? 1800 : 0,
          },
        ],
      };
      sales.save(firm, null, {
        ...doc,
        payments: [
          {
            accountId: i % 2 ? banks[0] : cash.id,
            amount: totals(doc, company.stateCode).total,
            reference: '',
          },
        ],
      });
    }
    finance.adjust(firm, {
      amount: 500000,
      date: today(),
      direction: 1,
      description: 'Demo cash introduced',
    });
    finance.transfer(firm, {
      fromId: banks[0],
      toId: cash.id,
      amount: 50000,
      date: today(),
      description: 'Demo cash withdrawal',
    });
    const party = parties[0],
      item = items[1];
    sales.save(firm, null, {
      ...blankDocument('sale', company.stateCode),
      partyId: party.id,
      partyName: party.name,
      number: sales.next(firm, 'sale', 'INV-'),
      lines: [documentLineFromItem('sale', item, 0, 1)],
      payments: [
        {
          accountId: cheque.id,
          amount: 1000,
          reference: 'DEMO-CH-02',
          chequeDate: dueAfter(today(), 1),
        },
      ],
    });
    sales.save(firm, null, {
      ...blankDocument('purchase_order', company.stateCode),
      partyId: party.id,
      partyName: party.name,
      lines: [documentLineFromItem('purchase_order', items[2], 0, 10)],
    });
    const loan = finance.loan(firm, {
      name: 'Demo working capital',
      partyId: null,
      amount: 1000000,
      interestBps: 1200,
      accountId: banks[1],
      date: today(),
    });
    finance.emi(firm, {
      loanId: loan,
      principal: 50000,
      interest: 10000,
      accountId: banks[1],
      date: today(),
      description: 'Demo loan instalment',
    });
    for (const [key, value] of Object.entries({
      'demo.phase4': true,
      'demo.txnIds': context.db
        .select()
        .from(s.txns)
        .where(eq(s.txns.firmId, firm))
        .all()
        .filter((t) => !before.txns.includes(t.id))
        .map((t) => t.id),
      'demo.accountIds': context.db
        .select()
        .from(s.paymentAccounts)
        .where(eq(s.paymentAccounts.firmId, firm))
        .all()
        .filter((a) => !before.accounts.includes(a.id))
        .map((a) => a.id),
      'demo.loanIds': context.db
        .select()
        .from(s.loans)
        .where(eq(s.loans.firmId, firm))
        .all()
        .filter((l) => !before.loans.includes(l.id))
        .map((l) => l.id),
    }))
      context.db
        .insert(s.settings)
        .values({ firmId: firm, key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: [s.settings.firmId, s.settings.key],
          set: { value: JSON.stringify(value) },
        })
        .run();
    repo.audit(firm, 'firms', firm, 'seed_finance_demo', null, { seeded: true });
  })();
}
export function upgradeDemo(context: DatabaseContext) {
  for (const firm of context.db
    .select()
    .from(s.firms)
    .where(and(eq(s.firms.demo, true)))
    .all())
    seedFinanceDemo(context, firm.id);
}
