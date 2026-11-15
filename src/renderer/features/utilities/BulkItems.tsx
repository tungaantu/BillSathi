import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  HelpTip,
  Input,
  MoneyInput,
  Select,
  useShowMore,
  useToast,
} from '../../components/ui';
import { useSaveShortcut } from '../../app/keyboard';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import type { Item, ItemPatch } from '../../../shared/masters';
import { useMasters } from '../masters/common';
import './utilities.css';

type Patch = Omit<ItemPatch, 'id'>;

/** Utilities → Bulk update items: change prices, GST rate, HSN or low-stock level of many items at once. */
export function BulkItems() {
  const { t } = useTranslation(),
    { firmId, lookups, invalidate, error } = useMasters(),
    { navigate } = useNavigation(),
    toast = useToast();
  const items = useQuery({
    queryKey: ['items', firmId],
    queryFn: async () => unwrap(await window.api.masters.items(firmId)),
  });
  const [changes, setChanges] = useState<Record<number, Patch>>({}),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [busy, setBusy] = useState(false),
    form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const rows = (items.data ?? []).filter(
    (i) =>
      `${i.name} ${i.code} ${i.hsn}`.toLowerCase().includes(search.toLowerCase()) &&
      (!category || i.categoryId === Number(category)),
  );
  const { visible, more } = useShowMore(rows, 100);
  const count = Object.keys(changes).length;
  const value = <K extends keyof Patch>(i: Item, key: K) =>
    (changes[i.id]?.[key] ?? i[key as keyof Item]) as NonNullable<Patch[K]>;
  const set = (i: Item, patch: Patch) =>
    setChanges((all) => ({ ...all, [i.id]: { ...all[i.id], ...patch } }));
  async function save() {
    if (!count) return;
    setBusy(true);
    try {
      const n = unwrap(
        await window.api.masters.bulkUpdate(
          firmId,
          Object.entries(changes).map(([id, patch]) => ({ id: Number(id), ...patch })),
        ),
      );
      setChanges({});
      await invalidate();
      toast(t('bulk.saved', { count: n }));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const taxes = lookups.taxes.map((x) => ({ value: String(x.id), label: x.name }));
  return (
    <form
      ref={form}
      className="stack bulk-items"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="page-heading">
        <div>
          <h1>{t('nav.bulkItems')}</h1>
          <p className="muted">
            {t('bulk.intro')} <HelpTip id="bulk-items" />
          </p>
        </div>
        <div className="button-row" data-tour="inventory-actions">
          <Button variant="ghost" disabled={!count || busy} onClick={() => setChanges({})}>
            {t('bulk.discard')}
          </Button>
          <Button type="submit" disabled={!count || busy}>
            {t('bulk.save', { count })}
          </Button>
        </div>
      </div>
      <section className="card toolbar" data-tour="inventory-new">
        <Input
          aria-label={t('bulk.search')}
          placeholder={t('bulk.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label={t('masters.category')}
          value={category}
          options={[
            { value: '', label: t('reports.all') },
            ...lookups.categories.map((c) => ({
              value: String(c.id),
              label: t(`category.${c.name}`, { defaultValue: c.name }),
            })),
          ]}
          onChange={setCategory}
        />
      </section>
      <section className="card table-scroll" data-tour="inventory-list">
        {!rows.length ? (
          <EmptyState
            title={t('bulk.empty')}
            description={t('bulk.emptyBody')}
            action={t('masters.newItem')}
            onAction={() => navigate('items/new')}
          />
        ) : (
          <>
            <table className="bulk-table">
              <thead>
                <tr>
                  <th>{t('inventory.col.item')}</th>
                  <th>{t('bulk.col.salePrice')}</th>
                  <th>{t('bulk.col.purchasePrice')}</th>
                  <th>{t('bulk.col.mrp')}</th>
                  <th>{t('bulk.col.tax')}</th>
                  <th>{t('bulk.col.hsn')}</th>
                  <th>{t('bulk.col.minStock')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id} className={changes[i.id] ? 'changed' : ''}>
                    <td>
                      <strong>{i.name}</strong>
                      <small className="muted"> {i.code}</small>
                    </td>
                    {(['salePrice', 'purchasePrice', 'mrp'] as const).map((k) => (
                      <td key={k}>
                        <MoneyInput
                          aria-label={`${t(`bulk.col.${k}`)} ${i.name}`}
                          value={value(i, k)}
                          onValueChange={(v) => set(i, { [k]: v })}
                        />
                      </td>
                    ))}
                    <td>
                      <Select
                        label={`${t('bulk.col.tax')} ${i.name}`}
                        value={String(value(i, 'taxRateId') ?? '')}
                        options={[{ value: '', label: t('bulk.noTax') }, ...taxes]}
                        onChange={(v) => set(i, { taxRateId: Number(v) || null })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`${t('bulk.col.hsn')} ${i.name}`}
                        inputMode="numeric"
                        maxLength={8}
                        value={value(i, 'hsn')}
                        onChange={(e) => set(i, { hsn: e.target.value.replace(/\D/g, '') })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`${t('bulk.col.minStock')} ${i.name}`}
                        type="number"
                        min="0"
                        step="0.001"
                        value={value(i, 'minStock')}
                        onChange={(e) => set(i, { minStock: Math.max(0, Number(e.target.value)) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {more}
          </>
        )}
      </section>
    </form>
  );
}
