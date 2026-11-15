import { RecurringDialog } from '../customers/Recurring';
import { MessageDialog } from '../customers/Messages';
import { ReceiveOrder } from './ReceiveOrder';
import { ExpenseSummary } from './ExpenseSummary';
import type { DocumentType } from '../../../shared/sales';
import { formatDate } from '../../../shared/dates';
import { salesRoute } from './drafts';
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  EmptyState,
  Input,
  MoneyText,
  Select,
  useToast,
  useShowMore,
} from '../../components/ui';
import { useNavigation } from '../../app/state';
import { useSales, SaleField } from './common';
import { unwrap } from '../../../shared/types';
import { displayDocumentNumber } from '../../../shared/numbering';
import { sumPaise } from '../../../shared/money';
import type { SaleSummary } from '../../../shared/sales';
import { today } from '../../../shared/masters';
import { requirePin } from '../safety/lock';
import { CollectDialog } from '../payments/CollectDialog';
import { PaymentBadgeChip, usePaymentBadges } from '../payments/PaymentBadge';
export function SalesList({
  type,
  onNew,
  onEdit,
}: {
  type: string;
  onNew: () => void;
  onEdit: (id: number, mode: 'edit' | 'duplicate' | 'return') => void;
}) {
  const { t } = useTranslation(),
    { firmId, parties, settings, error, invalidate } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast();
  const [search, setSearch] = useState(''),
    [party, setParty] = useState(''),
    [status, setStatus] = useState(''),
    [period, setPeriod] = useState('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [bin, setBin] = useState(false);
  const [category, setCategory] = useState('');
  const grouped = ['expense', 'other_income'].includes(type);
  const categories = useQuery({
    queryKey: ['expense-categories', firmId, type === 'other_income' ? 'other_income' : 'expense'],
    queryFn: async () =>
      unwrap(
        await window.api.sales.categories(
          firmId,
          type === 'other_income' ? 'other_income' : 'expense',
        ),
      ),
    enabled: grouped,
  });
  const [recurring, setRecurring] = useState<number | null>(null);
  const [message, setMessage] = useState<{ phone: string; message: string } | null>(null);
  const [target, setTarget] = useState<DocumentType>('purchase');
  const [receiving, setReceiving] = useState<number | null>(null);
  const [collect, setCollect] = useState<{ id: number; balance: number } | null>(null);
  const badges = usePaymentBadges();
  const [confirm, setConfirm] = useState<{
    id: number;
    action: 'delete' | 'cancel' | 'close';
  } | null>(null);
  const query = useQuery({
    queryKey: ['sales', firmId, type, bin],
    queryFn: async () => unwrap(await window.api.sales.list(firmId, type, bin)),
  });
  const on = today();
  const rows = (query.data ?? []).filter(
    (r) =>
      (!party || r.partyId === Number(party)) &&
      (!category || r.categoryId === Number(category)) &&
      (!status || r.paymentStatus === status) &&
      (!search ||
        `${r.partyName} ${displayDocumentNumber({ ...r, firmId })}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (period === 'all' ||
        (period === 'today' && r.date === on) ||
        (period === 'month' && r.date.slice(0, 7) === on.slice(0, 7)) ||
        (period === 'year' && r.date.slice(0, 4) === on.slice(0, 4))),
  );
  const { visible: shownRows, more } = useShowMore(rows);
  if (['expense', 'other_income'].includes(type))
    rows.sort((a, b) => (a.categoryId ?? 0) - (b.categoryId ?? 0) || b.date.localeCompare(a.date));
  const active = rows.filter((r) => !['cancelled', 'converted'].includes(r.status));
  async function action(id: number, a: 'delete' | 'restore' | 'cancel' | 'reopen' | 'close') {
    try {
      unwrap(await window.api.sales.action(firmId, id, a));
      await invalidate();
      toast(
        t('saved'),
        ['delete', 'cancel', 'close'].includes(a)
          ? { undo: () => void action(id, a === 'delete' ? 'restore' : 'reopen') }
          : undefined,
      );
    } catch (e) {
      error(e);
    } finally {
      setConfirm(null);
    }
  }
  async function convert(id: number, target: DocumentType, quantities?: number[]) {
    try {
      const saved = unwrap(await window.api.sales.convert(firmId, id, target, quantities));
      await invalidate();
      setReceiving(null);
      toast(t('saved'));
      navigate(`${salesRoute(saved.type)}/preview/${saved.id}`);
    } catch (e) {
      error(e);
    }
  }
  const output = async (id: number, a: 'print' | 'whatsapp') => {
    try {
      unwrap(await window.api.sales.output(firmId, id, a));
    } catch (e) {
      error(e);
    }
  };
  const actions = (r: SaleSummary) => {
    if (bin) return [{ label: t('sales.restore'), onSelect: () => void action(r.id, 'restore') }];
    const posted = [
      'posted',
      'open',
      'partially_received',
      'partially_delivered',
      'draft',
    ].includes(r.status);
    return [
      ...(type === 'sale' && r.status === 'posted'
        ? [{ label: t('orders.makeRecurring'), onSelect: () => setRecurring(r.id) }]
        : []),
      {
        label: t('orders.message'),
        onSelect: () =>
          void window.api.customers
            .message(firmId, r.id)
            .then(unwrap)
            .then(setMessage)
            .catch(error),
      },
      ...(['sale_order', 'delivery_challan'].includes(type) &&
      ['open', 'partially_delivered'].includes(r.status)
        ? [
            {
              label: t('sales.convert'),
              onSelect: () => {
                setTarget('sale');
                setReceiving(r.id);
              },
            },
            ...(type === 'sale_order' && settings.challan
              ? [
                  {
                    label: t('orders.convertChallan'),
                    onSelect: () => {
                      setTarget('delivery_challan');
                      setReceiving(r.id);
                    },
                  },
                ]
              : []),
            ...(type === 'delivery_challan' && settings.challanReturns
              ? [
                  {
                    label: t('orders.returnChallan'),
                    onSelect: () => {
                      setTarget('challan_return');
                      setReceiving(r.id);
                    },
                  },
                ]
              : []),
            {
              label: t('sales.closeEstimate'),
              onSelect: () => setConfirm({ id: r.id, action: 'close' }),
            },
          ]
        : []),
      ...[
        {
          label: t('sales.view'),
          onSelect: () => navigate(`${salesRoute(r.type)}/preview/${r.id}`),
        },
        ...(type === 'sale' && r.status === 'posted' && r.balance > 0
          ? [
              {
                label: t('payments.collect'),
                onSelect: () => setCollect({ id: r.id, balance: r.balance }),
              },
            ]
          : []),
        { label: t('sales.duplicate'), onSelect: () => onEdit(r.id, 'duplicate') },
        { label: t('sales.print'), onSelect: () => void output(r.id, 'print') },
        { label: t('sales.share'), onSelect: () => void output(r.id, 'whatsapp') },
      ],
      ...(posted
        ? [{ label: t('edit'), onSelect: () => requirePin(() => onEdit(r.id, 'edit')) }]
        : []),
      ...(['sale', 'purchase'].includes(type) && posted
        ? [{ label: t('sales.return'), onSelect: () => onEdit(r.id, 'return') }]
        : []),
      ...(type === 'purchase_order' && ['open', 'partially_received'].includes(r.status)
        ? [
            {
              label: t('sales.convertBill'),
              onSelect: () => {
                setTarget('purchase');
                setReceiving(r.id);
              },
            },
            {
              label: t('sales.closeEstimate'),
              onSelect: () => setConfirm({ id: r.id, action: 'close' }),
            },
          ]
        : []),
      ...(['estimate', 'proforma'].includes(type) && r.status === 'open'
        ? [
            { label: t('sales.convert'), onSelect: () => void convert(r.id, 'sale') },
            ...(settings.orders
              ? [
                  {
                    label: t('sales.convertOrder'),
                    onSelect: () => void convert(r.id, 'sale_order'),
                  },
                ]
              : []),
            {
              label: t('sales.closeEstimate'),
              onSelect: () => setConfirm({ id: r.id, action: 'close' }),
            },
          ]
        : []),
      ...(posted
        ? [
            {
              label: t('sales.cancelDocument'),
              onSelect: () => setConfirm({ id: r.id, action: 'cancel' }),
            },
          ]
        : []),
      ...(['cancelled', 'closed'].includes(r.status)
        ? [{ label: t('sales.reopen'), onSelect: () => void action(r.id, 'reopen') }]
        : []),
      { label: t('delete'), onSelect: () => setConfirm({ id: r.id, action: 'delete' }) },
    ];
  };
  return (
    <div className="stack" data-tour="sales-work">
      {['expense', 'other_income'].includes(type) && (
        <ExpenseSummary rows={rows} type={type as 'expense' | 'other_income'} />
      )}
      <div className="sales-filters card">
        {grouped && (
          <SaleField name="category">
            <Select
              label={t('sales.category')}
              value={category}
              onChange={setCategory}
              options={[
                { value: '', label: t('sales.all') },
                ...(categories.data ?? []).map((c) => ({
                  value: String(c.id),
                  label: t(`category.${c.name}`, { defaultValue: c.name }),
                })),
              ]}
            />
          </SaleField>
        )}
        <SaleField name="search">
          <Input id="sale-search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </SaleField>
        <SaleField name="party">
          <Select
            label={t('sales.party')}
            value={party}
            onChange={setParty}
            options={[
              { value: '', label: t('sales.all') },
              ...parties.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
          />
        </SaleField>
        <SaleField name="status">
          <Select
            label={t('sales.status')}
            value={status}
            onChange={setStatus}
            options={[
              '',
              ...([
                'estimate',
                'proforma',
                'sale_order',
                'delivery_challan',
                'purchase_order',
              ].includes(type)
                ? ['open', 'partially_received', 'partially_delivered', 'converted', 'closed']
                : ['draft', 'paid', 'partial', 'unpaid', 'overdue']),
              'cancelled',
            ].map((value) => ({ value, label: t(`sales.${value || 'all'}`) }))}
          />
        </SaleField>
        <SaleField name="period">
          <Select
            label={t('sales.period')}
            value={period}
            onChange={setPeriod}
            options={['all', 'today', 'month', 'year'].map((value) => ({
              value,
              label: t(`sales.${value}`),
            }))}
          />
        </SaleField>
        <SaleField name="from">
          <Input
            id="sale-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </SaleField>
        <SaleField name="to">
          <Input id="sale-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </SaleField>
      </div>
      <div className="sales-strip" data-tour="sales-actions">
        {['total', 'received', 'balance'].map((k) => (
          <div className="card" key={k}>
            <span>{t(`sales.${k}`)}</span>
            <MoneyText value={sumPaise(active.map((r) => r[k as 'total']))} />
          </div>
        ))}
        <Button variant="secondary" onClick={() => setBin(!bin)}>
          {t(bin ? 'sales.active' : 'sales.recycleBin')}
        </Button>
      </div>
      <section className="card sales-table">
        {query.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void query.refetch()}
          />
        ) : !rows.length ? (
          <EmptyState
            title={t('sales.empty')}
            description={t('sales.emptyBody')}
            action={t('sales.new')}
            onAction={onNew}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    'number',
                    'date',
                    'party',
                    'status',
                    'total',
                    'received',
                    'balance',
                    'actions',
                  ].map((k) => (
                    <th key={k}>{t(`sales.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, index) => (
                  <Fragment key={r.id}>
                    {grouped &&
                      (index === 0 || shownRows[index - 1].categoryId !== r.categoryId) && (
                        <tr className="expense-group">
                          <th colSpan={8}>
                            {t(
                              `category.${categories.data?.find((c) => c.id === r.categoryId)?.name}`,
                              {
                                defaultValue:
                                  categories.data?.find((c) => c.id === r.categoryId)?.name ??
                                  t('sales.category'),
                              },
                            )}
                          </th>
                        </tr>
                      )}
                    <tr>
                      <td>{displayDocumentNumber({ ...r, firmId })}</td>
                      <td>{formatDate(r.date, settings)}</td>
                      <td>{r.partyName || t('sales.walkIn')}</td>
                      <td>
                        <span className="badge-row">
                          <span className={`badge ${r.paymentStatus === 'paid' ? 'success' : ''}`}>
                            {t(`sales.${r.paymentStatus}`)}
                          </span>
                          <PaymentBadgeChip
                            badge={
                              ['payment_in', 'payment_out'].includes(type)
                                ? badges.payments[r.id]
                                : badges.invoices[r.id]
                            }
                          />
                        </span>
                      </td>
                      <td>
                        <MoneyText value={r.total} />
                      </td>
                      <td>
                        <MoneyText value={r.received} />
                      </td>
                      <td>
                        <MoneyText value={r.balance} />
                      </td>
                      <td>
                        <DropdownMenu
                          trigger={<Button variant="secondary">{t('sales.actions')}</Button>}
                          items={actions(r)}
                        />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            {more}
          </div>
        )}
      </section>
      {receiving !== null && (
        <ReceiveOrder
          id={receiving}
          target={target}
          onClose={() => setReceiving(null)}
          onConvert={(qty) => void convert(receiving, target, qty)}
        />
      )}
      {recurring && <RecurringDialog sourceId={recurring} onClose={() => setRecurring(null)} />}
      {message && <MessageDialog value={message} onClose={() => setMessage(null)} />}
      {collect && (
        <CollectDialog
          invoiceId={collect.id}
          balance={collect.balance}
          onClose={() => setCollect(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={t('sales.confirmTitle')}
        onConfirm={() => {
          if (!confirm) return;
          const { id, action: kind } = confirm;
          setConfirm(null);
          requirePin(() => void action(id, kind));
        }}
      >
        {t(`sales.confirm.${confirm?.action ?? 'delete'}`)}
      </ConfirmDialog>
    </div>
  );
}
