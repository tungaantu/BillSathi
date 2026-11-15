import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  HelpTip,
  MoneyInput,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
import { useSales } from '../sales/common';
import type { PartyRate } from '../../../shared/customer-features';
export function PartyFeatures({ partyId, tab }: { partyId: number; tab: string }) {
  const { t } = useTranslation(),
    { firmId, items, settings, invalidate, error } = useSales(),
    toast = useToast();
  const [rate, setRate] = useState<PartyRate>({ partyId, itemId: 0, price: 0, inclusive: false }),
    [removing, setRemoving] = useState<PartyRate | null>(null),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['customer-profile', firmId, partyId],
    queryFn: async () => unwrap(await window.api.customers.profile(firmId, partyId)),
  });
  async function save(value = rate, remove = false) {
    setBusy(true);
    try {
      unwrap(await window.api.customers.rate(firmId, value, remove));
      await invalidate();
      setRemoving(null);
      toast(t('saved'), remove ? { undo: () => void save(value) } : undefined);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  if (query.isError)
    return (
      <EmptyState
        title={t('error')}
        description={t('storage')}
        action={t('retry')}
        onAction={() => void query.refetch()}
      />
    );
  return (
    <div className="stack">
      <h3>
        {t(tab === 'prices' ? 'orders.prices' : 'orders.loyalty')}{' '}
        <HelpTip id={tab === 'prices' ? 'orders-prices' : 'orders-redeem'} />
      </h3>
      {tab === 'prices' ? (
        <>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Select
              label={t('sales.item')}
              value={String(rate.itemId || '')}
              options={items.map((i) => ({ value: String(i.id), label: i.name }))}
              onChange={(v) => {
                const i = items.find((i) => i.id === Number(v))!;
                setRate({ ...rate, itemId: i.id, price: i.salePrice, inclusive: i.inclusive });
              }}
            />
            <label>
              {t('sales.price')}
              <MoneyInput
                value={rate.price}
                onValueChange={(price) => setRate({ ...rate, price })}
              />
            </label>
            <Checkbox
              label={t('sales.incl')}
              checked={rate.inclusive}
              onCheckedChange={(inclusive) => setRate({ ...rate, inclusive })}
            />
            <Button type="submit" disabled={!rate.itemId || busy}>
              {t('save')}
            </Button>
          </form>
          {!query.data?.rates.length ? (
            <EmptyState
              title={t('orders.prices')}
              description={t('orders.noRates')}
              action={t('sales.addItem')}
              onAction={() =>
                document
                  .querySelector<HTMLButtonElement>('.master-detail button[role="combobox"]')
                  ?.click()
              }
            />
          ) : (
            query.data.rates.map((r) => (
              <div className="allocation-row" key={r.itemId}>
                <span>
                  {items.find((i) => i.id === r.itemId)?.name} ·{' '}
                  {t(r.source === 'remembered' ? 'orders.lastPrice' : 'orders.special')}
                </span>
                <MoneyText value={r.price} />
                <span>{t(r.inclusive ? 'sales.incl' : 'sales.excl')}</span>
                <Button variant="ghost" onClick={() => setRate(r)}>
                  {t('edit')}
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(r)}>
                  {t('delete')}
                </Button>
              </div>
            ))
          )}
        </>
      ) : (
        <>
          <p>{t('orders.available', { points: query.data?.points ?? 0 })}</p>
          {!query.data?.ledger.length ? (
            <EmptyState
              title={t('orders.loyalty')}
              description={t('orders.noPoints')}
              action={t('masters.saleForParty')}
              onAction={() => {
                location.hash = `invoices/party/${partyId}`;
              }}
            />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('sales.date')}</th>
                  <th>{t('orders.kind')}</th>
                  <th>{t('orders.points')}</th>
                </tr>
              </thead>
              <tbody>
                {query.data.ledger.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date, settings)}</td>
                    <td>{t(`orders.${e.kind === 'redeem' ? 'redeemEntry' : e.kind}`)}</td>
                    <td>{e.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => {
          if (!v) setRemoving(null);
        }}
        title={t('orders.removePrice')}
        onConfirm={() => void save(removing!, true)}
      >
        {t('orders.removePriceBody')}
      </ConfirmDialog>
    </div>
  );
}
