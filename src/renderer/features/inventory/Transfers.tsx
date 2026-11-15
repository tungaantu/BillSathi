import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  HelpTip,
  IconButton,
  Input,
  Select,
  useToast,
} from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import { formatDate } from '../../../shared/dates';
import type { TransferInput } from '../../../shared/inventory';
import type { StockTransfer } from '../../../shared/inventory-api';
import { useSales } from '../sales/common';
import { useGodowns } from './common';

type Line = { itemId: number | null; qty: string; batchId: number | null };

function BatchSelect({
  itemId,
  from,
  line,
  set,
}: {
  itemId: number;
  from: number;
  line: Line;
  set: (l: Line) => void;
}) {
  const { t } = useTranslation(),
    { firmId } = useSales();
  const batches = useQuery({
    queryKey: ['batches', firmId, itemId, from],
    queryFn: async () => unwrap(await window.api.inventory.batches(firmId, itemId, from)),
  });
  return (
    <Select
      label={t('inventory.batch.label')}
      value={String(line.batchId ?? '')}
      options={[
        { value: '', label: t('inventory.batch.any') },
        ...(batches.data ?? [])
          .filter((b) => b.qty > 0)
          .map((b) => ({ value: String(b.id), label: `${b.number} · ${b.qty}` })),
      ]}
      onChange={(v) => set({ ...line, batchId: Number(v) || null })}
    />
  );
}

function TransferDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId, items, settings, invalidate, error } = useSales(),
    toast = useToast();
  const godowns = useGodowns().data ?? [];
  const [date, setDate] = useState(today()),
    [fromId, setFrom] = useState(godowns[0]?.id ?? 0),
    [toId, setTo] = useState(godowns[1]?.id ?? 0),
    [note, setNote] = useState(''),
    [lines, setLines] = useState<Line[]>([{ itemId: null, qty: '1', batchId: null }]),
    [problem, setProblem] = useState(''),
    form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const products = items.filter((i) => i.type !== 'service');
  const setLine = (index: number, value: Line) =>
    setLines(lines.map((l, i) => (i === index ? value : l)));
  async function save() {
    const ready = lines.filter((l) => l.itemId);
    if (!fromId || !toId || fromId === toId) return setProblem(t('inventory.error.sameGodown'));
    if (!ready.length || ready.some((l) => !(Number(l.qty) > 0)))
      return setProblem(t('inventory.error.lines'));
    const input: TransferInput = {
      date,
      fromId,
      toId,
      note,
      lines: ready.map((l) => ({ itemId: l.itemId!, qty: Number(l.qty), batchId: l.batchId })),
    };
    try {
      unwrap(await window.api.inventory.saveTransfer(firmId, input));
      await invalidate();
      toast(t('inventory.transfer.saved'));
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'negativeStock')
        setProblem(t('inventory.error.notEnough'));
      else error(e);
    }
  }
  const godownOptions = godowns.map((g) => ({ value: String(g.id), label: g.name }));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('inventory.transfer.new')}>
      <form
        ref={form}
        className="stack"
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-grid">
          <Field id="transfer-from" label={t('inventory.transfer.from')} help="inventory-transfer">
            <Select
              label={t('inventory.transfer.from')}
              value={String(fromId)}
              options={godownOptions}
              onChange={(v) => setFrom(Number(v))}
            />
          </Field>
          <Field id="transfer-to" label={t('inventory.transfer.to')}>
            <Select
              label={t('inventory.transfer.to')}
              value={String(toId)}
              options={godownOptions}
              onChange={(v) => setTo(Number(v))}
            />
          </Field>
          <Field id="transfer-date" label={t('inventory.transfer.date')}>
            <Input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        {lines.map((line, i) => {
          const item = products.find((p) => p.id === line.itemId);
          return (
            <div className="transfer-line" key={i}>
              <Select
                label={`${t('inventory.col.item')} ${i + 1}`}
                value={String(line.itemId ?? '')}
                options={products.map((p) => ({
                  value: String(p.id),
                  label: `${p.name} · ${p.qty}`,
                }))}
                onChange={(v) => setLine(i, { ...line, itemId: Number(v), batchId: null })}
              />
              <Input
                aria-label={`${t('inventory.col.qty')} ${i + 1}`}
                type="number"
                min="0.001"
                step="0.001"
                value={line.qty}
                onChange={(e) => setLine(i, { ...line, qty: e.target.value })}
              />
              {item?.trackBatches && Boolean(settings.batches) && (
                <BatchSelect
                  itemId={item.id}
                  from={fromId}
                  line={line}
                  set={(l) => setLine(i, l)}
                />
              )}
              <IconButton
                label={t('sales.remove')}
                onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines([...lines, { itemId: null, qty: '1', batchId: null }])}
        >
          <Plus size={16} /> {t('inventory.transfer.addLine')}
        </Button>
        <Field id="transfer-note" label={t('inventory.transfer.note')}>
          <Input
            id="transfer-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        <Button type="submit">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

export function Transfers() {
  const { t } = useTranslation(),
    { firmId, settings, invalidate, error } = useSales(),
    toast = useToast();
  const godowns = useGodowns().data ?? [];
  const [creating, setCreating] = useState(false),
    [removing, setRemoving] = useState<StockTransfer | null>(null);
  const list = useQuery({
    queryKey: ['transfers', firmId],
    queryFn: async () => unwrap(await window.api.inventory.transfers(firmId)),
  });
  async function output(id: number, mode: 'pdf' | 'print') {
    try {
      const path = unwrap(await window.api.inventory.printTransfer(firmId, id, mode));
      if (path) toast(t('inventory.fileSaved'));
    } catch (e) {
      error(e);
    }
  }
  async function remove(id: number) {
    try {
      unwrap(await window.api.inventory.deleteTransfer(firmId, id));
      await invalidate();
      toast(t('inventory.transfer.deleted'));
    } catch (e) {
      error(e);
    }
  }
  const canCreate = godowns.length > 1;
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('nav.stockTransfers')}</h1>
          <p className="muted">
            {t('inventory.transfer.intro')} <HelpTip id="inventory-transfer" />
          </p>
        </div>
        <div data-tour="inventory-new">
          <Button disabled={!canCreate} onClick={() => setCreating(true)}>
            {t('inventory.transfer.new')}
          </Button>
        </div>
      </div>
      {!canCreate && <p className="muted">{t('inventory.transfer.needTwo')}</p>}
      <section className="card table-scroll" data-tour="inventory-list">
        {!list.data?.length ? (
          <EmptyState
            title={t('inventory.transfer.empty')}
            description={t('inventory.transfer.emptyBody')}
            action={t(canCreate ? 'inventory.transfer.new' : 'inventory.godown.new')}
            onAction={() => (canCreate ? setCreating(true) : (location.hash = 'godowns'))}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('inventory.transfer.date')}</th>
                <th>{t('inventory.transfer.from')}</th>
                <th>{t('inventory.transfer.to')}</th>
                <th className="num">{t('inventory.transfer.lines')}</th>
                <th>{t('sales.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>{formatDate(r.date, settings)}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td className="num">{r.lines.length}</td>
                  <td className="button-row" data-tour="inventory-actions">
                    <Button variant="secondary" onClick={() => void output(r.id, 'print')}>
                      {t('reports.print')}
                    </Button>
                    <Button variant="ghost" onClick={() => void output(r.id, 'pdf')}>
                      {t('reports.pdf')}
                    </Button>
                    <Button variant="ghost" onClick={() => setRemoving(r)}>
                      {t('masters.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {creating && <TransferDialog onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t('inventory.transfer.deleteTitle', { number: removing?.number ?? '' })}
        onConfirm={() => {
          if (removing) void remove(removing.id);
          setRemoving(null);
        }}
      >
        {t('inventory.transfer.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
