import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Dialog, Field, Input, MoneyInput, Select } from '../../components/ui';
import { unwrap } from '../../../shared/types';
import { today, type Item } from '../../../shared/masters';
import { formatDate } from '../../../shared/dates';
import { DOCUMENT_CONFIG, type SaleDocument, type SaleLine } from '../../../shared/sales';
import {
  duplicateSerials,
  expiryStatus,
  parseSerials,
  type BatchInput,
} from '../../../shared/inventory';
import { useSales } from '../sales/common';

const blankBatch = (): BatchInput => ({ number: '', expDate: '', mfgDate: '', mrp: 0 });

/** Small button under a bill line's item name: pick or enter batch and serial numbers. */
export function LineStock({
  doc,
  line,
  item,
  index,
  patch,
}: {
  doc: SaleDocument;
  line: SaleLine;
  item: Item;
  index: number;
  patch: (index: number, value: Partial<SaleLine>) => void;
}) {
  const { t } = useTranslation(),
    { settings } = useSales();
  const [open, setOpen] = useState(false);
  const sign = DOCUMENT_CONFIG[doc.type].stockSign;
  const batches = Boolean(settings.batches) && item.trackBatches;
  const serials = Boolean(settings.serials) && item.trackSerials;
  if (item.type === 'service' || sign === 0 || (!batches && !serials)) return null;
  const parts: string[] = [];
  if (batches)
    parts.push(
      sign > 0
        ? line.batch?.number
          ? t('inventory.batch.short', { number: line.batch.number })
          : t('inventory.batch.add')
        : line.batchId
          ? t('inventory.batch.chosen')
          : t('inventory.batch.auto'),
    );
  if (serials)
    parts.push(t('inventory.serial.count', { count: line.serials?.length ?? 0, qty: line.qty }));
  const short =
    serials && (line.serials?.length ?? 0) !== line.qty + (line.freeQty ?? 0) ? 'warn' : '';
  return (
    <>
      <button
        type="button"
        className={`link line-stock ${short}`}
        aria-label={`${t('inventory.batch.title')} ${index + 1}`}
        onClick={() => setOpen(true)}
      >
        {parts.join(' · ')}
      </button>
      {open && (
        <LineStockDialog
          doc={doc}
          line={line}
          item={item}
          inbound={sign > 0}
          batches={batches}
          serials={serials}
          onSave={(value) => {
            patch(index, value);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LineStockDialog({
  doc,
  line,
  item,
  inbound,
  batches,
  serials,
  onSave,
  onClose,
}: {
  doc: SaleDocument;
  line: SaleLine;
  item: Item;
  inbound: boolean;
  batches: boolean;
  serials: boolean;
  onSave: (value: Partial<SaleLine>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    { firmId, settings } = useSales();
  const [batch, setBatch] = useState<BatchInput>(line.batch ?? blankBatch()),
    [batchId, setBatchId] = useState<number | null>(line.batchId ?? null),
    [text, setText] = useState((line.serials ?? []).join('\n')),
    [picked, setPicked] = useState<string[]>(line.serials ?? []),
    [problem, setProblem] = useState('');
  const units = line.qty + (line.freeQty ?? 0);
  const stock = useQuery({
    queryKey: ['batches', firmId, item.id, doc.godownId],
    queryFn: async () => unwrap(await window.api.inventory.batches(firmId, item.id, doc.godownId)),
    enabled: batches && !inbound,
  });
  const available = useQuery({
    queryKey: ['serials', firmId, item.id],
    queryFn: async () => unwrap(await window.api.inventory.serials(firmId, item.id, true)),
    enabled: serials && !inbound,
  });
  const chosen = stock.data?.find((b) => b.id === batchId);
  const expired = chosen && expiryStatus(chosen.expDate, today()) === 'expired';
  // Serials already on this line count as available while editing it.
  const options = [
    ...new Set([...(line.serials ?? []), ...(available.data ?? []).map((s) => s.serial)]),
  ];
  function save() {
    const list = inbound ? parseSerials(text) : picked;
    if (serials && list.length !== units)
      return setProblem(t('inventory.error.serialCount', { count: units }));
    if (serials && duplicateSerials(list).length)
      return setProblem(
        t('inventory.error.serialDuplicate', { list: duplicateSerials(list).join(', ') }),
      );
    if (batches && inbound && !batch.number.trim()) return setProblem(t('inventory.error.batchNo'));
    onSave({
      ...(batches
        ? inbound
          ? { batch: { ...batch, number: batch.number.trim() } }
          : { batchId }
        : {}),
      ...(serials ? { serials: list } : {}),
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${t('inventory.batch.title')} · ${item.name}`}
      description={t('inventory.batch.units', { count: units })}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {batches && inbound && (
          <div className="form-grid">
            <Field id="batch-number" label={t('inventory.batch.number')} help="inventory-batch">
              <Input
                id="batch-number"
                autoFocus
                maxLength={60}
                value={batch.number}
                onChange={(e) => setBatch({ ...batch, number: e.target.value })}
              />
            </Field>
            <Field id="batch-exp" label={t('inventory.batch.exp')}>
              <Input
                id="batch-exp"
                type="date"
                value={batch.expDate}
                onChange={(e) => setBatch({ ...batch, expDate: e.target.value })}
              />
            </Field>
            <Field id="batch-mfg" label={t('inventory.batch.mfg')}>
              <Input
                id="batch-mfg"
                type="date"
                value={batch.mfgDate}
                onChange={(e) => setBatch({ ...batch, mfgDate: e.target.value })}
              />
            </Field>
            <Field id="batch-mrp" label={t('inventory.batch.mrp')}>
              <MoneyInput
                id="batch-mrp"
                value={batch.mrp}
                onValueChange={(v) => setBatch({ ...batch, mrp: v })}
              />
            </Field>
          </div>
        )}
        {batches && !inbound && (
          <Field id="batch-pick" label={t('inventory.batch.label')} help="inventory-fefo">
            <Select
              label={t('inventory.batch.label')}
              value={String(batchId ?? '')}
              options={[
                { value: '', label: t('inventory.batch.autoLong') },
                ...(stock.data ?? []).map((b) => ({
                  value: String(b.id),
                  label: `${b.number} · ${b.expDate ? formatDate(b.expDate, settings) : t('inventory.batch.noExpiry')} · ${t('inventory.batch.left', { qty: b.qty })}${
                    expiryStatus(b.expDate, today()) === 'expired'
                      ? ` · ${t('inventory.expiry.expired')}`
                      : ''
                  }`,
                })),
              ]}
              onChange={(v) => setBatchId(Number(v) || null)}
            />
          </Field>
        )}
        {expired && (
          <p role="alert" className="field-error">
            {t('inventory.batch.expiredWarning')}
          </p>
        )}
        {serials && inbound && (
          <Field
            id="serial-text"
            label={t('inventory.serial.enter', { count: units })}
            help="inventory-serial"
          >
            <textarea
              id="serial-text"
              className="input"
              rows={6}
              data-scan
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('inventory.serial.pasteHint')}
            />
          </Field>
        )}
        {serials && !inbound && (
          <fieldset className="serial-pick">
            <legend>{t('inventory.serial.pick', { picked: picked.length, count: units })}</legend>
            {!options.length && <p className="muted">{t('inventory.serial.noneInStock')}</p>}
            {options.map((s) => (
              <Checkbox
                key={s}
                label={s}
                checked={picked.includes(s)}
                onCheckedChange={(v) =>
                  setPicked(v ? [...picked, s] : picked.filter((x) => x !== s))
                }
              />
            ))}
          </fieldset>
        )}
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        <Button type="submit">{t('inventory.batch.apply')}</Button>
      </form>
    </Dialog>
  );
}
