import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, EmptyState, HelpTip, Input, Select, useToast } from '../../components/ui';
import { useSales } from '../sales/common';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import { formatDate } from '../../../shared/dates';
import type { RecurrenceInput } from '../../../shared/customer-features';
import { useNavigation } from '../../app/state';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
export function RecurringDialog({ sourceId, onClose }: { sourceId: number; onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId, invalidate, error } = useSales(),
    toast = useToast();
  const [value, set] = useState<RecurrenceInput>({
    sourceId,
    frequency: 'monthly',
    day: new Date().getDate(),
    start: today(),
    end: '',
    mode: 'draft',
  });
  const [busy, setBusy] = useState(false),
    form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  async function save() {
    setBusy(true);
    try {
      unwrap(await window.api.customers.recur(firmId, value));
      await invalidate();
      toast(t('saved'));
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t('orders.makeRecurring')}
    >
      <form
        ref={form}
        className="stack"
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p>
          {t('orders.recurringIntro')} <HelpTip id="orders-recurrence" />
        </p>
        <label>
          {t('orders.frequency')}
          <Select
            label={t('orders.frequency')}
            value={value.frequency}
            onChange={(frequency) =>
              set({
                ...value,
                frequency: frequency as RecurrenceInput['frequency'],
                day: frequency === 'weekly' ? 1 : value.day,
              })
            }
            options={['daily', 'weekly', 'monthly', 'yearly'].map((v) => ({
              value: v,
              label: t(`orders.${v}`),
            }))}
          />
        </label>
        {value.frequency !== 'daily' && (
          <label>
            {t('orders.day')}
            <HelpTip id="orders-recurrence" />
            <Input
              type="number"
              min="1"
              max={value.frequency === 'weekly' ? 7 : 31}
              required
              value={value.day}
              onChange={(e) => set({ ...value, day: Number(e.target.value) })}
            />
          </label>
        )}
        <label>
          {t('orders.start')}
          <Input
            type="date"
            required
            value={value.start}
            onChange={(e) => set({ ...value, start: e.target.value })}
          />
        </label>
        <label>
          {t('orders.end')}
          <Input
            type="date"
            min={value.start}
            value={value.end}
            onChange={(e) => set({ ...value, end: e.target.value })}
          />
        </label>
        <label>
          {t('orders.mode')}
          <HelpTip id="orders-recurrence" />
          <Select
            label={t('orders.mode')}
            value={value.mode}
            onChange={(mode) => set({ ...value, mode: mode as 'draft' | 'save' })}
            options={['draft', 'save'].map((v) => ({ value: v, label: t(`orders.${v}`) }))}
          />
        </label>
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </form>
    </Dialog>
  );
}
export function Recurring() {
  const { t } = useTranslation(),
    { firmId, settings, invalidate, error } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['recurring', firmId],
    queryFn: async () => unwrap(await window.api.customers.recurring(firmId)),
  });
  async function run() {
    setBusy(true);
    try {
      const count = unwrap(await window.api.customers.run(firmId));
      await invalidate();
      toast(t('orders.created', { count }));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="page-heading" data-tour="customer-new">
        <div>
          <h1>{t('nav.recurring')}</h1>
          <p>
            {t('orders.recurringIntro')} <HelpTip id="orders-recurrence" />
          </p>
        </div>
        <Button disabled={busy} onClick={() => void run()}>
          {t('orders.runNow')}
        </Button>
      </div>
      <section className="card table-scroll" data-tour="customer-list">
        {query.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void query.refetch()}
          />
        ) : !query.data?.length ? (
          <EmptyState
            title={t('orders.noRecurring')}
            description={t('orders.noRecurringBody')}
            action={t('nav.invoices')}
            onAction={() => navigate('invoices')}
          />
        ) : (
          <table>
            <thead>
              <tr>
                {['source', 'frequency', 'next', 'mode'].map((k) => (
                  <th key={k}>{t(`orders.${k}`)}</th>
                ))}
                <th>{t('sales.status')}</th>
                <th>{t('sales.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`invoices/preview/${r.sourceId}`)}
                    >
                      {t('orders.source')} #{r.sourceId}
                    </Button>
                  </td>
                  <td>{t(`orders.${r.frequency}`)}</td>
                  <td>
                    {r.end && r.next > r.end ? t('sales.closed') : formatDate(r.next, settings)}
                  </td>
                  <td>{t(`orders.${r.mode}`)}</td>
                  <td>
                    {t(r.paused ? 'orders.paused' : 'orders.active')}
                    {r.error && <p role="alert">{t(r.error)}</p>}
                  </td>
                  <td data-tour="customer-actions">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void window.api.customers
                          .pause(firmId, r.id, !r.paused)
                          .then(unwrap)
                          .then(invalidate)
                          .then(() => toast(t('saved')))
                          .catch(error)
                      }
                    >
                      {t(r.paused ? 'orders.resume' : 'orders.pause')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
