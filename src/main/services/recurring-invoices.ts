import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from '../db';
import * as s from '../db/schema';
import { salesRepository } from '../db/sales';
import {
  catchUp,
  firstOccurrence,
  recurrenceSchema,
  type Recurrence,
} from '../../shared/customer-features';
import { today } from '../../shared/masters';
import { blankDocument } from '../../shared/sales';
import { addDays } from '../../shared/customer-features';

export function recurringInvoices(context: DatabaseContext) {
  const sales = salesRepository(context),
    { repo } = sales;
  function list(firm: number): Recurrence[] {
    repo.get(firm);
    return context.db
      .select()
      .from(s.recurringInvoices)
      .where(eq(s.recurringInvoices.firmId, firm))
      .all() as Recurrence[];
  }
  function create(firm: number, input: unknown) {
    const rule = recurrenceSchema.parse(input),
      source = sales.get(firm, rule.sourceId);
    if (source.type !== 'sale' || source.status !== 'posted' || source.deletedAt)
      throw new Error('validation');
    return context.sqlite.transaction(() => {
      const row = context.db
        .insert(s.recurringInvoices)
        .values({ ...rule, firmId: firm, next: firstOccurrence(rule) })
        .returning()
        .get();
      repo.audit(firm, 'recurring_invoices', row.id, 'create', null, row);
      return row.id;
    })();
  }
  function pause(firm: number, id: number, paused: boolean) {
    const before = list(firm).find((r) => r.id === id);
    if (!before) throw new Error('notFound');
    context.sqlite.transaction(() => {
      context.db
        .update(s.recurringInvoices)
        .set({ paused, error: '' })
        .where(eq(s.recurringInvoices.id, id))
        .run();
      repo.audit(firm, 'recurring_invoices', id, 'update', before, { paused });
    })();
  }
  function run(firm: number, through = today()) {
    let count = 0;
    for (const rule of list(firm).filter((r) => !r.paused)) {
      const source = sales.get(firm, rule.sourceId);
      if (source.deletedAt || source.status !== 'posted') continue;
      const pending = catchUp(rule, through);
      for (const on of pending.dates) {
        try {
          context.sqlite.transaction(() => {
            const current = list(firm).find((r) => r.id === rule.id)!;
            if (current.paused || current.next !== on) return;
            const blank = blankDocument('sale', source.placeOfSupply, repo.getSettings(firm));
            const doc = {
              ...source,
              date: on,
              dueDate: source.paymentTerms
                ? addDays(on, source.paymentTerms)
                : source.dueDate
                  ? addDays(
                      on,
                      Math.max(
                        0,
                        Math.round(
                          (Date.parse(source.dueDate) - Date.parse(source.date)) / 86400000,
                        ),
                      ),
                    )
                  : '',
              prefix: blank.prefix,
              number: sales.next(firm, 'sale', blank.prefix),
              refTxnId: null,
              payments: [],
              attachmentIds: [],
              loyaltyRedeem: 0,
              loyaltyDiscount: 0,
            };
            const created =
              rule.mode === 'draft' ? sales.saveDraft(firm, doc) : sales.save(firm, null, doc);
            const row = sales.own(firm, created.id);
            context.db
              .update(s.txns)
              .set({
                metadata: JSON.stringify({
                  ...JSON.parse(row.metadata),
                  recurring: rule.id,
                  occurrence: on,
                }),
              })
              .where(eq(s.txns.id, created.id))
              .run();
            const next = catchUp({ ...rule, next: on }, on, 1).next;
            context.db
              .update(s.recurringInvoices)
              .set({ next, error: '' })
              .where(eq(s.recurringInvoices.id, rule.id))
              .run();
            repo.audit(
              firm,
              'recurring_invoices',
              rule.id,
              'update',
              { next: on },
              { next, created: created.id },
            );
          })();
          count++;
        } catch {
          // Pause the failing rule so other businesses and rules can continue safely.
          context.sqlite.transaction(() => {
            context.db
              .update(s.recurringInvoices)
              .set({ paused: true, error: 'orders.recurringError' })
              .where(and(eq(s.recurringInvoices.firmId, firm), eq(s.recurringInvoices.id, rule.id)))
              .run();
            repo.audit(firm, 'recurring_invoices', rule.id, 'update', rule, {
              paused: true,
              error: 'orders.recurringError',
            });
          })();
          break;
        }
      }
    }
    return count;
  }
  return { list, create, pause, run };
}
