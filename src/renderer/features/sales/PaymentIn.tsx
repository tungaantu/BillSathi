import { formatDate } from '../../../shared/dates';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Input,
  MoneyInput,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { useNavigation } from '../../app/state';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { SaleField, SaleMoney, SaleText, useSales } from './common';
import {
  allocateOldest,
  receiptSchema,
  receiptDraftSchema,
  type Receipt,
} from '../../../shared/sales';
import { today } from '../../../shared/masters';
import { sumPaise } from '../../../shared/money';
import { displayDocumentNumber } from '../../../shared/numbering';
import { unwrap } from '../../../shared/types';
import { CollectUpiButton } from '../payments/CollectButton';
export function PaymentIn({
  type = 'payment_in',
  id,
  duplicate = false,
}: {
  type?: 'payment_in' | 'payment_out';
  id?: number;
  duplicate?: boolean;
}) {
  const { t } = useTranslation(),
    { firmId, parties, accounts, txns, settings, error, invalidate } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast();
  const storageKey = `billsathi-receipt-draft-${type}-${firmId}-${id ?? 0}-${duplicate}`;
  const [doc, set] = useState<Receipt>(() => {
    try {
      const parsed = receiptDraftSchema.safeParse(
        JSON.parse(localStorage.getItem(storageKey) ?? 'null'),
      );
      if (parsed.success) return parsed.data;
    } catch {
      /* Start a fresh receipt if local data is incomplete. */
    }
    return {
      type,
      attachmentIds: [],
      reference: '',
      chequeDate: '',
      partyId: 0,
      amount: 0,
      discount: 0,
      accountId: 0,
      date: today(),
      prefix: String(settings[`prefix.${type}`] ?? (type === 'payment_out' ? 'PAY-' : 'RCPT-')),
      number: 1,
      description: '',
      allocations: [],
      auto: true,
    };
  });
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(doc)), [storageKey, doc]);
  const [busy, setBusy] = useState(false),
    [invalid, setInvalid] = useState(false);
  const [originalAllocations, setOriginalAllocations] = useState<Receipt['allocations']>([]);
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const update = (patch: Partial<Receipt>) => set((v) => ({ ...v, ...patch }));
  useEffect(() => {
    if (!id) return;
    let active = true;
    void window.api.sales
      .getReceipt(firmId, id)
      .then(unwrap)
      .then(async (r) => {
        if (duplicate)
          r = {
            ...r,
            date: today(),
            attachmentIds: [],
            number: unwrap(await window.api.sales.next(firmId, type, r.prefix)),
          };
        if (active) {
          set(r);
          if (!duplicate) setOriginalAllocations(r.allocations);
        }
      })
      .catch(error);
    return () => {
      active = false;
    };
  }, [firmId, id, duplicate, type, error]);
  useEffect(() => {
    if (id && !duplicate) return;
    let current = true;
    void window.api.sales
      .next(firmId, type, doc.prefix)
      .then(unwrap)
      .then((number) => {
        if (current) set((v) => ({ ...v, number }));
      })
      .catch(error);
    return () => {
      current = false;
    };
  }, [firmId, type, doc.prefix, id, duplicate, error]);
  const open = txns.filter(
    (t) =>
      t.type === (type === 'payment_out' ? 'purchase' : 'sale') &&
      t.partyId === doc.partyId &&
      (t.balance > 0 ||
        Boolean(id && !duplicate && originalAllocations.some((a) => a.invoiceId === t.id))) &&
      t.status === 'posted',
  );
  const editableOpen =
    id && !duplicate
      ? open.map((i) => ({
          ...i,
          balance: sumPaise([
            i.balance,
            originalAllocations.find((a) => a.invoiceId === i.id)?.amount ?? 0,
          ]),
        }))
      : open;
  const allocated = doc.auto
    ? allocateOldest(sumPaise([doc.amount, doc.discount]), editableOpen)
    : doc.allocations;
  async function save() {
    if (busy || form.current?.querySelector('[aria-invalid="true"]')) return;
    const parsed = receiptSchema.safeParse({ ...doc, accountId: doc.accountId || accounts[0]?.id });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      unwrap(await window.api.sales.receipt(firmId, parsed.data, duplicate ? undefined : id));
      localStorage.removeItem(storageKey);
      await invalidate();
      toast(t('saved'));
      navigate(type === 'payment_out' ? 'paymentOut' : 'paymentIn');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={form}
      className="stack"
      onKeyDown={advanceField}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="muted">{t('sales.autosaved')}</p>
      <section className="card form-grid sales-header" data-tour="sales-work">
        <SaleField name="party">
          <Select
            label={t('sales.party')}
            value={String(doc.partyId || '')}
            onChange={(v) => update({ partyId: Number(v), allocations: [] })}
            options={parties.map((p) => ({ value: String(p.id), label: `${p.name} · ${p.phone}` }))}
          />
        </SaleField>
        <SaleMoney
          name={type === 'payment_out' ? 'paidNow' : 'received'}
          value={doc.amount}
          onChange={(amount) => update({ amount })}
        />
        <SaleMoney
          name="paymentDiscount"
          value={doc.discount}
          onChange={(discount) => update({ discount })}
        />
        <SaleField name="account">
          <Select
            label={t('sales.account')}
            value={String(doc.accountId || accounts[0]?.id || '')}
            onChange={(v) => update({ accountId: Number(v) })}
            options={accounts.map((a) => ({
              value: String(a.id),
              label:
                a.type === 'bank' ? a.name : t(`sales.account.${a.type}`, { defaultValue: a.name }),
            }))}
          />
        </SaleField>
        <SaleText name="date" type="date" value={doc.date} onChange={(date) => update({ date })} />
        <SaleText name="prefix" value={doc.prefix} onChange={(prefix) => update({ prefix })} />
        <SaleField name="number">
          <Input
            id="sale-number"
            type="number"
            min="1"
            value={doc.number}
            onChange={(e) => update({ number: Number(e.target.value) })}
          />
        </SaleField>
        <SaleText
          name="description"
          value={doc.description}
          onChange={(description) => update({ description })}
        />
        <SaleText
          name="paymentReference"
          value={doc.reference}
          onChange={(reference) => update({ reference })}
        />
        {accounts.find((a) => a.id === (doc.accountId || accounts[0]?.id))?.type === 'cheque' && (
          <SaleText
            name="chequeDate"
            type="date"
            value={doc.chequeDate || doc.date}
            onChange={(chequeDate) => update({ chequeDate })}
          />
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void window.api.sales
              .attach(firmId)
              .then(unwrap)
              .then((file) => {
                if (file) update({ attachmentIds: [...doc.attachmentIds, file.id] });
              })
              .catch(error)
          }
        >
          {t('sales.attach')}
        </Button>
        {doc.attachmentIds.map((id) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => void window.api.sales.attachment(firmId, id).then(unwrap).catch(error)}
          >
            {t('sales.attachment', { id })}
          </Button>
        ))}
      </section>
      <section className="card sales-header stack">
        <SaleField name="allocation">
          <Checkbox
            label={t('sales.autoAllocate')}
            checked={doc.auto}
            onCheckedChange={(auto) => update({ auto, allocations: allocated })}
          />
        </SaleField>
        {!open.length && <p className="muted">{t('sales.noOpenInvoices')}</p>}
        {editableOpen.map((invoice) => (
          <div key={invoice.id} className="allocation-row">
            <span>
              {displayDocumentNumber({ ...invoice, firmId })} · {formatDate(invoice.date, settings)}{' '}
              <CollectUpiButton invoiceId={invoice.id} variant="ghost" />
            </span>
            <MoneyText value={invoice.balance} />
            <MoneyInput
              aria-label={t('sales.allocateInvoice', {
                number: displayDocumentNumber({ ...invoice, firmId }),
              })}
              disabled={doc.auto}
              value={allocated.find((a) => a.invoiceId === invoice.id)?.amount ?? 0}
              onValueChange={(amount) =>
                update({
                  allocations: [
                    ...doc.allocations.filter((a) => a.invoiceId !== invoice.id),
                    { invoiceId: invoice.id, amount },
                  ],
                })
              }
            />
          </div>
        ))}
        <p>
          {t('sales.unallocated')}:{' '}
          <MoneyText
            value={sumPaise([doc.amount, doc.discount, -sumPaise(allocated.map((a) => a.amount))])}
          />
        </p>
      </section>
      {invalid && (
        <p role="alert" className="field-error">
          {t('sales.receiptInvalid')}
        </p>
      )}
      <div className="form-actions" data-tour="sales-actions">
        <Button
          variant="secondary"
          onClick={() => navigate(type === 'payment_out' ? 'paymentOut' : 'paymentIn')}
        >
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
