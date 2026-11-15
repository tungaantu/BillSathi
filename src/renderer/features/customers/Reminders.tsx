import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  HelpTip,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
import { useSales } from '../sales/common';
import { useNavigation } from '../../app/state';
import { MessageDialog } from './Messages';
import type { Reminder } from '../../../shared/customer-features';
export function Reminders() {
  const { t } = useTranslation(),
    { firmId, settings, error } = useSales(),
    toast = useToast(),
    { navigate } = useNavigation();
  const [kind, setKind] = useState('payment'),
    [selected, setSelected] = useState<string[]>([]),
    [queue, setQueue] = useState<Reminder[]>([]),
    [index, setIndex] = useState(0);
  const query = useQuery({
    queryKey: ['reminders', firmId],
    queryFn: async () => unwrap(await window.api.customers.reminders(firmId)),
  });
  const rows = (query.data ?? []).filter((r) => r.kind === kind),
    chosen = rows.filter((r) => selected.includes(r.key));
  return (
    <div className="stack">
      <div className="page-heading" data-tour="customer-new">
        <div>
          <h1>{t('nav.reminders')}</h1>
          <p>
            {t('orders.remindersIntro')} <HelpTip id="orders-messages" />
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('settings/messages')}>
          {t('orders.template')}
        </Button>
      </div>
      <div className="card toolbar" data-tour="customer-actions">
        <Select
          label={t('masters.type')}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSelected([]);
          }}
          options={['payment', 'service'].map((v) => ({ value: v, label: t(`orders.${v}`) }))}
        />
        <Checkbox
          label={t('orders.selectAll')}
          checked={rows.length > 0 && chosen.length === rows.length}
          onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.key) : [])}
        />
        <Button
          disabled={!chosen.length}
          onClick={() => {
            setQueue(chosen);
            setIndex(0);
          }}
        >
          {t('orders.queue')}
        </Button>
        <Button
          variant="secondary"
          disabled={!chosen.length}
          onClick={() =>
            void navigator.clipboard
              .writeText(chosen.map((r) => r.message).join('\n\n'))
              .then(() => toast(t('orders.copied')))
              .catch(error)
          }
        >
          {t('orders.copyAll')}
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
        ) : !rows.length ? (
          <EmptyState
            title={t('orders.noReminders')}
            description={t('orders.noRemindersBody')}
            action={t('nav.invoices')}
            onAction={() => navigate('invoices')}
          />
        ) : (
          <table>
            <thead>
              <tr>
                {['sales.party', 'orders.due', 'orders.age', 'sales.balance', 'sales.actions'].map(
                  (k) => (
                    <th key={k}>{t(k)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <Checkbox
                      label={r.party}
                      checked={selected.includes(r.key)}
                      onCheckedChange={(v) =>
                        setSelected(v ? [...selected, r.key] : selected.filter((k) => k !== r.key))
                      }
                    />
                    {r.item && <small>{r.item}</small>}
                  </td>
                  <td>{formatDate(r.due, settings)}</td>
                  <td>{r.age}</td>
                  <td>
                    <MoneyText value={r.amount} />
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQueue([r]);
                        setIndex(0);
                      }}
                    >
                      {t('orders.message')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {queue[index] && (
        <MessageDialog
          key={queue[index].key}
          value={queue[index]}
          position={t('orders.queuePosition', { current: index + 1, total: queue.length })}
          onClose={() => setQueue([])}
          next={() => (index + 1 < queue.length ? setIndex(index + 1) : setQueue([]))}
        />
      )}
    </div>
  );
}
