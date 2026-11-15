import { customerLine } from '../../../shared/customer-features';
import { useCustomerRates } from '../customers/common';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  HelpTip,
  Input,
  MoneyInput,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { ItemSheet } from '../items/ItemSheet';
import { LineStock } from '../inventory/LineStock';
import { useScanner } from '../inventory/common';
import { findByCode } from '../../../shared/inventory';
import {
  blankLine,
  DOCUMENT_CONFIG,
  type SaleDocument,
  type SaleLine,
} from '../../../shared/sales';
import type { Item } from '../../../shared/masters';
import { formatINR } from '../../../shared/money';
import { useSales } from './common';
import type { LineResult } from '../../../shared/gst-calc';
export function ItemGrid({
  doc,
  update,
  results,
}: {
  doc: SaleDocument;
  update: (p: Partial<SaleDocument> | ((doc: SaleDocument) => Partial<SaleDocument>)) => void;
  results: LineResult[];
}) {
  const { t } = useTranslation(),
    { items, lookups, settings } = useSales(),
    toast = useToast();
  const [adding, setAdding] = useState<number | 'new' | null>(null),
    [search, setSearch] = useState('');
  const rates = useCustomerRates();
  const itemOptions = items.map((i) => ({
    value: String(i.id),
    label: `${i.name} · ${i.code} ${i.barcode && i.barcode !== i.code ? i.barcode : ''} · ${t('sales.stock')} ${i.qty} · ${formatINR(DOCUMENT_CONFIG[doc.type].price === 'purchase' ? i.purchasePrice : i.salePrice)}`,
  }));
  const itemLine = (item: Item) =>
    customerLine(
      doc,
      item,
      settings.gst ? (lookups.taxes.find((t) => t.id === item.taxRateId)?.rateBps ?? 0) : 0,
      rates.data ?? [],
      settings,
    );
  const add = (item: Item) => {
    update({ lines: [...doc.lines, itemLine(item)] });
    setSearch('');
    setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>('.invoice-grid tbody tr:last-child input')
          ?.focus(),
      40,
    );
  }; // A barcode scanned anywhere on the bill (outside a text box) adds that item.
  useScanner((code) => {
    const item = findByCode(items, code);
    if (item) add(item);
    else toast(t('pos.notFound', { code }), { error: true });
  });

  function patch(index: number, patch: Partial<SaleLine>) {
    const lines = [...doc.lines];
    lines[index] = { ...lines[index], ...patch };
    update({ lines });
  }
  function remove(index: number) {
    const removed = doc.lines[index];
    update({ lines: doc.lines.filter((_, i) => i !== index) });
    toast(t('sales.rowRemoved'), {
      undo: () =>
        update((current) => ({
          lines: [...current.lines.slice(0, index), removed, ...current.lines.slice(index)],
        })),
    });
  }
  function keyboard(event: KeyboardEvent<HTMLTableElement>) {
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target)) return;
    const row = target.closest<HTMLTableRowElement>('tr[data-row]');
    if (!row) return;
    if (event.ctrlKey && event.key === 'Delete') {
      event.preventDefault();
      remove(Number(row.dataset.row));
      return;
    }
    if (event.key !== 'Enter' || !target.matches('input,select')) return;
    event.preventDefault();
    const controls = Array.from(
      row.querySelectorAll<HTMLElement>('input,select,button[role="combobox"]'),
    );
    const next = controls[controls.indexOf(target) + 1];
    if (next) next.focus();
    else {
      update({ lines: [...doc.lines, blankLine()] });
      setTimeout(
        () =>
          document
            .querySelector<HTMLButtonElement>(
              '.invoice-grid tbody tr:last-child button[role="combobox"]',
            )
            ?.click(),
        40,
      );
    }
  }
  const qty = (index: number, line: SaleLine, value: number, unit = line.unitId) => {
    const item = items.find((i) => i.id === line.itemId);
    if (item) {
      try {
        const priced = customerLine(
          doc,
          item,
          line.taxBps,
          rates.data ?? [],
          settings,
          value,
          unit,
        );
        patch(index, { qty: value, unitId: unit, price: priced.price });
      } catch {
        patch(index, { qty: value, unitId: unit });
      }
    } else patch(index, { qty: value, unitId: unit });
  };
  const columns = [
    'item',
    'qty',
    ...(settings.freeQty ? ['freeQty'] : []),
    'unit',
    'price',
    'inclusive',
    'discountPercent',
    'discount',
    'taxRate',
    'tax',
    'amount',
  ];
  return (
    <section className="card sales-grid">
      <div className="sales-grid-bar" data-item-add>
        <Select
          label={t('sales.addItem')}
          value={search}
          options={[...itemOptions, { value: 'add', label: t('masters.newItem') }]}
          onChange={(v) =>
            v === 'add' ? setAdding('new') : add(items.find((i) => i.id === Number(v))!)
          }
        />
        <Button variant="secondary" onClick={() => setAdding('new')}>
          {t('masters.newItem')}
        </Button>
        <HelpTip id="sale-grid" />
      </div>
      {!doc.lines.length ? (
        <EmptyState
          title={t('sales.noLines')}
          description={t('sales.gridHelp')}
          action={t('sales.addItem')}
          onAction={() =>
            document.querySelector<HTMLButtonElement>('[data-item-add] button')?.click()
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="invoice-grid" onKeyDown={keyboard}>
            <thead>
              <tr>
                {columns.map((k) => (
                  <th key={k}>
                    {t(`sales.${k}`)}
                    <HelpTip id={`sale-${k}`} />
                  </th>
                ))}
                <th>{t('sales.remove')}</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} data-row={i}>
                  <td>
                    <Select
                      label={`${t('sales.item')} ${i + 1}`}
                      value={String(line.itemId ?? '')}
                      options={[...itemOptions, { value: 'add', label: t('masters.newItem') }]}
                      onChange={(v) => {
                        if (v === 'add') setAdding(i);
                        else {
                          patch(i, itemLine(items.find((item) => item.id === Number(v))!));
                          setTimeout(
                            () =>
                              document
                                .querySelector<HTMLInputElement>(
                                  `.invoice-grid tr[data-row="${i}"] input`,
                                )
                                ?.focus(),
                            40,
                          );
                        }
                      }}
                    />
                    <small>{line.hsn}</small>
                    {(() => {
                      const item = items.find((x) => x.id === line.itemId);
                      return item ? (
                        <LineStock doc={doc} line={line} item={item} index={i} patch={patch} />
                      ) : null;
                    })()}
                    {(rates.data ?? []).some(
                      (r) =>
                        r.partyId === doc.partyId &&
                        r.itemId === line.itemId &&
                        (r.source === 'remembered'
                          ? settings.rememberPartyPrice
                          : settings.partyRates),
                    ) && <small className="badge">{t('orders.special')}</small>}
                  </td>
                  <td>
                    <Input
                      aria-label={`${t('sales.qty')} ${i + 1}`}
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={line.qty}
                      onChange={(e) => qty(i, line, Number(e.target.value))}
                    />
                  </td>
                  {settings.freeQty && (
                    <td>
                      <Input
                        aria-label={`${t('sales.freeQty')} ${i + 1}`}
                        type="number"
                        step="0.001"
                        min="0"
                        value={line.freeQty}
                        onChange={(e) => patch(i, { freeQty: Number(e.target.value) })}
                      />
                    </td>
                  )}
                  <td>
                    <select
                      className="input"
                      aria-label={`${t('sales.unit')} ${i + 1}`}
                      value={line.unitId ?? ''}
                      onChange={(e) => qty(i, line, line.qty, Number(e.target.value) || null)}
                    >
                      <option value="">{t('masters.none')}</option>
                      {lookups.units
                        .filter((u) => {
                          const item = items.find((item) => item.id === line.itemId);
                          return u.id === item?.unitId || u.id === item?.secondaryUnitId;
                        })
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.symbol}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <MoneyInput
                      aria-label={`${t('sales.price')} ${i + 1}`}
                      value={line.price}
                      onValueChange={(price) => patch(i, { price })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label={`${t('sales.inclusive')} ${i + 1}`}
                      value={line.inclusive ? 'yes' : 'no'}
                      onChange={(e) => patch(i, { inclusive: e.target.value === 'yes' })}
                    >
                      <option value="no">{t('sales.excl')}</option>
                      <option value="yes">{t('sales.incl')}</option>
                    </select>
                  </td>
                  <td>
                    <Input
                      aria-label={`${t('sales.discountPercent')} ${i + 1}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.discountBps / 100}
                      onChange={(e) =>
                        patch(i, {
                          discountBps: Math.round(Number(e.target.value) * 100),
                          discountAmount: 0,
                        })
                      }
                    />
                  </td>
                  <td>
                    <MoneyInput
                      aria-label={`${t('sales.discount')} ${i + 1}`}
                      value={line.discountAmount}
                      onValueChange={(discountAmount) =>
                        patch(i, { discountAmount, discountBps: 0 })
                      }
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label={`${t('sales.taxRate')} ${i + 1}`}
                      value={line.taxBps}
                      onChange={(e) => patch(i, { taxBps: Number(e.target.value) })}
                    >
                      {[...new Set([...lookups.taxes.map((r) => r.rateBps), line.taxBps])].map(
                        (rate) => (
                          <option key={rate} value={rate}>
                            {rate / 100}%
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td>
                    <MoneyText
                      value={
                        (results[i]?.cgst ?? 0) +
                        (results[i]?.sgst ?? 0) +
                        (results[i]?.igst ?? 0) +
                        (results[i]?.cess ?? 0)
                      }
                    />
                  </td>
                  <td>
                    <MoneyText value={results[i]?.total ?? 0} />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => remove(i)}
                      aria-label={`${t('sales.remove')} ${i + 1}`}
                    >
                      {t('sales.remove')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding !== null && (
        <ItemSheet
          item={null}
          onClose={() => setAdding(null)}
          onSaved={(item) =>
            typeof adding === 'number' ? patch(adding, itemLine(item)) : add(item)
          }
        />
      )}
    </section>
  );
}
