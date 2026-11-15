import type { DatabaseContext } from '../db';
import { salesRead } from '../db/sales-read';
import { masterRepository } from '../db/masters';
import {
  addDays,
  renderMessage,
  type Reminder,
  type MessageValues,
} from '../../shared/customer-features';
import { today } from '../../shared/masters';
import { formatINR, paiseToDecimal, sumPaise } from '../../shared/money';
import { formatDate } from '../../shared/dates';
import { displayDocumentNumber } from '../../shared/numbering';
import { en, hi } from '../../renderer/i18n/modules/orders';

export function customerMessages(context: DatabaseContext) {
  const read = salesRead(context),
    masters = masterRepository(context);
  function values(
    firm: number,
    party: string,
    amount: number,
    balance: number,
    due: string,
    doc = '',
  ): MessageValues {
    const company = read.repo.get(firm),
      settings = read.repo.getSettings(firm);
    return {
      party,
      doc_no: doc,
      amount: formatINR(amount),
      balance: formatINR(balance),
      due_date: due ? formatDate(due, settings) : '',
      firm: company.name,
      upi_link: company.upiId
        ? `upi://pay?${new URLSearchParams({
            pa: company.upiId,
            pn: company.name,
            am: paiseToDecimal(balance),
            cu: 'INR',
          })}`
        : '',
    };
  }
  function render(firm: number, kind: string, input: MessageValues) {
    const settings = read.repo.getSettings(firm),
      strings = settings.language === 'hi' ? hi : en;
    return renderMessage(
      String(
        settings[`message.${kind}`] ??
          strings[kind === 'service' ? 'orders.defaultService' : 'orders.defaultMessage'],
      ),
      input,
    );
  }
  function message(firm: number, id: number) {
    const doc = read.get(firm, id);
    return {
      phone: doc.phone || masters.parties(firm).find((p) => p.id === doc.partyId)?.phone || '',
      message: render(
        firm,
        doc.status === 'cancelled' ? 'cancelled' : doc.type,
        values(
          firm,
          doc.partyName,
          doc.total,
          doc.balance,
          doc.dueDate,
          displayDocumentNumber(doc),
        ),
      ),
    };
  }
  function reminders(firm: number, on = today()): Reminder[] {
    const settings = read.repo.getSettings(firm),
      horizon = addDays(on, Number(settings.remindDays ?? 0));
    const invoices = read
      .list(firm, 'sale')
      .filter((t) => t.status === 'posted' && t.balance > 0 && t.dueDate && t.dueDate <= horizon);
    const results: Reminder[] = [];
    for (const party of masters.parties(firm)) {
      if (party.balance <= 0 || !party.active) continue;
      const due = invoices.filter((t) => t.partyId === party.id);
      if (!due.length) continue;
      const first = due.map((t) => t.dueDate!).sort()[0];
      const amount = Math.min(party.balance, sumPaise(due.map((t) => t.balance)));
      results.push({
        key: `p-${party.id}`,
        partyId: party.id,
        party: party.name,
        phone: party.phone,
        amount,
        due: first,
        age: Math.max(0, Math.floor((Date.parse(on) - Date.parse(first)) / 86400000)),
        kind: 'payment',
        message: render(
          firm,
          'reminder',
          values(
            firm,
            party.name,
            amount,
            amount,
            first,
            due.map((t) => displayDocumentNumber({ ...t, firmId: firm })).join(', '),
          ),
        ),
      });
    }
    const items = masters.items(firm).filter((i) => i.serviceReminderDays > 0);
    const sales = read.list(firm, 'sale').filter((t) => t.status === 'posted');
    for (const party of masters.parties(firm).filter((p) => p.active))
      for (const item of items) {
        const last = sales
          .filter(
            (t) =>
              t.partyId === party.id &&
              read.get(firm, t.id).lines.some((l) => l.itemId === item.id),
          )
          .map((t) => t.date)
          .sort()
          .at(-1);
        if (!last) continue;
        const due = addDays(last, item.serviceReminderDays);
        if (due > horizon) continue;
        results.push({
          key: `s-${party.id}-${item.id}`,
          partyId: party.id,
          party: party.name,
          phone: party.phone,
          item: item.name,
          amount: 0,
          due,
          age: Math.max(0, Math.floor((Date.parse(on) - Date.parse(due)) / 86400000)),
          kind: 'service',
          message: render(firm, 'service', values(firm, party.name, 0, 0, due, item.name)),
        });
      }
    return results.sort((a, b) => a.due.localeCompare(b.due));
  }
  return { message, reminders };
}
