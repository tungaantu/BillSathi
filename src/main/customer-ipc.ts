import { shell } from 'electron';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { DatabaseContext } from './db';
import * as s from './db/schema';
import { salesRead } from './db/sales-read';
import { masterRepository } from './db/masters';
import { customerMessages } from './services/customer-messages';
import { recurringInvoices } from './services/recurring-invoices';
import { loyaltyBalance } from './db/customer-loyalty';
import { partyRateSchema, whatsappLink } from '../shared/customer-features';
import { today } from '../shared/masters';

export function registerCustomerIpc(
  context: DatabaseContext,
  handle: (channel: string, fn: (...args: unknown[]) => unknown) => void,
) {
  const read = salesRead(context),
    masters = masterRepository(context),
    messages = customerMessages(context),
    recurring = recurringInvoices(context);
  const id = (v: unknown) => z.number().int().positive().parse(v);
  const rates = (firm: number) => {
    read.repo.get(firm);
    return context.db.select().from(s.partyRates).where(eq(s.partyRates.firmId, firm)).all();
  };
  handle('customers:rates', (f) => rates(id(f)));
  handle('customers:profile', (f, p) => {
    const firm = id(f),
      party = id(p);
    if (!masters.parties(firm).some((r) => r.id === party)) throw new Error('notFound');
    return {
      rates: rates(firm).filter((r) => r.partyId === party),
      points: loyaltyBalance(context, firm, party),
      ledger: context.db
        .select()
        .from(s.loyaltyEntries)
        .where(and(eq(s.loyaltyEntries.firmId, firm), eq(s.loyaltyEntries.partyId, party)))
        .all()
        .reverse(),
    };
  });
  handle('customers:rate', (f, input, remove) => {
    const firm = id(f),
      rate = { ...partyRateSchema.parse(input), source: 'special' };
    if (
      !masters.parties(firm).some((p) => p.id === rate.partyId) ||
      !masters.items(firm).some((i) => i.id === rate.itemId)
    )
      throw new Error('validation');
    context.sqlite.transaction(() => {
      const where = and(
        eq(s.partyRates.firmId, firm),
        eq(s.partyRates.partyId, rate.partyId),
        eq(s.partyRates.itemId, rate.itemId),
      );
      const before = context.db.select().from(s.partyRates).where(where).get();
      if (z.boolean().parse(remove ?? false)) context.db.delete(s.partyRates).where(where).run();
      else
        context.db
          .insert(s.partyRates)
          .values({ ...rate, firmId: firm })
          .onConflictDoUpdate({
            target: [s.partyRates.firmId, s.partyRates.partyId, s.partyRates.itemId],
            set: rate,
          })
          .run();
      read.repo.audit(
        firm,
        'party_rates',
        rate.itemId,
        remove ? 'delete' : before ? 'update' : 'create',
        before,
        remove ? null : rate,
      );
    })();
  });
  handle('customers:recurring', (f) => recurring.list(id(f)));
  handle('customers:recur', (f, input) => recurring.create(id(f), input));
  handle('customers:pause', (f, i, p) => recurring.pause(id(f), id(i), z.boolean().parse(p)));
  handle('customers:run', (f) => recurring.run(id(f)));
  handle('customers:reminders', (f) => messages.reminders(id(f)));
  handle('customers:message', (f, i) => messages.message(id(f), id(i)));
  handle('customers:whatsapp', (phone, message) =>
    shell.openExternal(
      whatsappLink(z.string().max(20).parse(phone), z.string().max(12000).parse(message)),
    ),
  );
  handle('customers:alerts', (f) => {
    const firm = id(f);
    return {
      created: read
        .list(firm)
        .filter(
          (t) =>
            JSON.parse(read.own(firm, t.id).metadata).recurring &&
            read.own(firm, t.id).createdAt?.slice(0, 10) === today(),
        ).length,
      due: messages.reminders(firm).length,
    };
  });
}
