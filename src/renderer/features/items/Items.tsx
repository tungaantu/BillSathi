import { formatDate } from '../../../shared/dates';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import type { Item } from '../../../shared/masters';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  MoneyText,
  Select,
  Table,
  Tabs,
  useToast,
  useShowMore,
} from '../../components/ui';
import { useMasters } from '../masters/common';
import { LookupManager } from '../masters/LookupManager';
import { ItemSheet } from './ItemSheet';
import { AdjustStock } from './AdjustStock';
export function Items({ selected, create = false }: { selected?: number; create?: boolean }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { firmId, settings, lookups, invalidate, error } = useMasters();
  const [tab, setTab] = useState('product'),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [low, setLow] = useState(false);
  const [selection, setSelection] = useState<number | undefined>(selected),
    [edit, setEdit] = useState<Item | null | undefined>(create ? null : undefined);
  const [deleting, setDeleting] = useState(false),
    [adjust, setAdjust] = useState(false);
  const query = useQuery({
    queryKey: ['items', firmId],
    queryFn: async () => unwrap(await window.api.masters.items(firmId)),
  });
  const items = query.data ?? [],
    selectedItem = items.find((i) => i.id === selection);
  const currentTab =
    selectedItem && !['categories', 'units'].includes(tab) ? selectedItem.type : tab;
  const rows = items.filter(
    (i) =>
      i.type === currentTab &&
      `${i.name} ${i.code} ${i.hsn}`.toLowerCase().includes(search.toLowerCase()) &&
      (category === 'all' || i.categoryId === Number(category)) &&
      (!low || i.qty <= i.minStock),
  );
  const { visible: shownRows, more } = useShowMore(rows);
  const item = selectedItem ?? rows[0];
  const movements = useQuery({
    queryKey: ['movements', firmId, item?.id],
    queryFn: async () => unwrap(await window.api.masters.movements(firmId, item!.id)),
    enabled: Boolean(item),
  });
  const empty = (
    <EmptyState
      title={t('masters.noItems')}
      description={t('masters.itemsBody')}
      action={t('masters.newItem')}
      onAction={() => setEdit(null)}
    />
  );
  async function remove() {
    if (!item) return;
    const id = item.id;
    try {
      unwrap(await window.api.masters.remove(firmId, 'items', id));
      setDeleting(false);
      setSelection(undefined);
      await invalidate();
      toast(t('masters.deleted'), {
        undo: () => {
          void window.api.masters
            .remove(firmId, 'items', id, true)
            .then(unwrap)
            .then(() => invalidate())
            .then(() => toast(t('masters.restored')))
            .catch(error);
        },
      });
    } catch (e) {
      error(e);
    }
  }
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('masters.inventory')}</span>
          <h1>{t('nav.items')}</h1>
          <p className="muted">{t('masters.itemsBody')}</p>
        </div>
        <Button data-tour="master-new" onClick={() => setEdit(null)}>
          <Plus size={17} />
          {t('masters.newItem')}
        </Button>
      </div>
      <Tabs
        value={currentTab}
        onValueChange={(v) => {
          setTab(v);
          setSelection(undefined);
        }}
        tabs={['product', 'service', 'categories', 'units'].map((value) => ({
          value,
          label: t(`masters.tab.${value}`),
        }))}
      />
      {['categories', 'units'].includes(currentTab) ? (
        <LookupManager key={currentTab} kind={currentTab as 'categories' | 'units'} />
      ) : query.isError ? (
        <EmptyState
          title={t('error')}
          description={t('storage')}
          action={t('retry')}
          onAction={() => void query.refetch()}
        />
      ) : (
        <div className="master-split">
          <section className="card master-list" data-tour="master-list">
            <Input
              aria-label={t('search')}
              placeholder={t('masters.itemSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label={t('masters.categoryId')}
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: t('masters.all') },
                ...lookups.categories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            {currentTab === 'product' && Boolean(settings.stock) && (
              <Checkbox label={t('masters.lowStock')} checked={low} onCheckedChange={setLow} />
            )}
            {!rows.length ? (
              query.isPending ? (
                <p>{t('loading')}</p>
              ) : (
                empty
              )
            ) : (
              <div className="master-rows">
                {shownRows.map((i) => (
                  <button
                    key={i.id}
                    className={`master-row ${item?.id === i.id ? 'selected' : ''}`}
                    onClick={() => setSelection(i.id)}
                  >
                    <span>
                      <strong>{i.name}</strong>
                      <small>{i.code || i.hsn || t('masters.noCode')}</small>
                    </span>
                    <span>
                      {currentTab === 'product' && Boolean(settings.stock) ? (
                        <strong className={i.qty <= i.minStock ? 'danger' : ''}>
                          {i.qty.toFixed(Number(settings.qtyDecimals ?? 3))}{' '}
                          {lookups.units.find((u) => u.id === i.unitId)?.symbol}
                        </strong>
                      ) : (
                        <MoneyText value={i.salePrice} />
                      )}
                    </span>
                  </button>
                ))}
                {more}
              </div>
            )}
          </section>
          <section className="card master-detail stack" data-tour="master-detail">
            {item ? (
              <>
                <div className="section-heading">
                  <div>
                    <h2>{item.name}</h2>
                    <p className="muted">
                      {item.code} {item.hsn && ` · ${t('masters.hsn')}: ${item.hsn}`}
                    </p>
                  </div>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => setEdit(item)}>
                      {t('masters.edit')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleting(true)}>
                      {t('masters.delete')}
                    </Button>
                  </div>
                </div>
                {item.image && <img className="item-image" src={item.image} alt={item.name} />}
                <div className="master-stats">
                  <div>
                    <span>{t('masters.salePrice')}</span>
                    <MoneyText value={item.salePrice} />
                  </div>
                  <div>
                    <span>{t('masters.purchasePrice')}</span>
                    <MoneyText value={item.purchasePrice} />
                  </div>
                  {item.type === 'product' && Boolean(settings.stock) && (
                    <>
                      <div>
                        <span>{t('masters.qty')}</span>
                        <strong className={item.qty <= item.minStock ? 'danger' : ''}>
                          {item.qty.toFixed(Number(settings.qtyDecimals ?? 3))}
                        </strong>
                      </div>
                      <div>
                        <span>{t('masters.stockValue')}</span>
                        <MoneyText value={item.value} />
                      </div>
                    </>
                  )}
                </div>
                {item.type === 'product' && Boolean(settings.stock) && (
                  <>
                    <div className="section-heading">
                      <h3>{t('masters.movements')}</h3>
                      <Button variant="secondary" onClick={() => setAdjust(true)}>
                        {t('masters.adjustStock')}
                      </Button>
                    </div>
                    {movements.isError ? (
                      <Button onClick={() => void movements.refetch()}>{t('retry')}</Button>
                    ) : (
                      <Table
                        data={movements.data ?? []}
                        empty={
                          <EmptyState
                            title={t('masters.noMovements')}
                            description={t('masters.adjustHelp')}
                            action={t('masters.adjustStock')}
                            onAction={() => setAdjust(true)}
                          />
                        }
                        columns={[
                          {
                            accessorKey: 'date',
                            header: t('masters.date'),
                            cell: ({ row }) => formatDate(row.original.date, settings),
                          },
                          {
                            accessorKey: 'reason',
                            header: t('masters.reason'),
                            cell: (c) =>
                              c.getValue<string>() === 'opening'
                                ? t('masters.txn.opening')
                                : c.getValue<string>()?.replace(/^adjust:/, ''),
                          },
                          { accessorKey: 'qty', header: t('masters.qty') },
                          {
                            accessorKey: 'value',
                            header: t('masters.stockValue'),
                            cell: (c) => <MoneyText value={c.getValue<number>()} />,
                          },
                        ]}
                      />
                    )}
                  </>
                )}
                {item.type === 'service' && (
                  <EmptyState
                    title={t('masters.noTransactions')}
                    description={t('masters.serviceBody')}
                    action={t('newSale')}
                    onAction={() => {
                      location.hash = 'invoices';
                    }}
                  />
                )}
              </>
            ) : (
              empty
            )}
          </section>
        </div>
      )}
      {edit !== undefined && (
        <ItemSheet key={edit?.id ?? 'new'} item={edit} onClose={() => setEdit(undefined)} />
      )}
      {adjust && item && <AdjustStock item={item} onClose={() => setAdjust(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('masters.deleteItem')}
        onConfirm={() => void remove()}
      >
        {t('masters.confirmDelete', { name: item?.name })}
      </ConfirmDialog>
    </div>
  );
}
