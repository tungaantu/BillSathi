import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { Button, MoneyText, useToast } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import './payments.css';

/** Dashboard alert for UPI payments that were seen in a bank alert but not confirmed yet. */
export function UpiAlert() {
  const { t } = useTranslation(),
    { firm } = useApp(),
    { navigate } = useNavigation(),
    toast = useToast(),
    client = useQueryClient();
  const firmId = firm!.id;
  const synced = useRef(false);
  // Once per visit, ask YouPI (if connected) whether the bank statement confirmed any seen payments.
  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    void window.api.payments
      .sync(firmId)
      .then(unwrap)
      .then(async (result) => {
        if (result.confirmed) {
          toast(t('payments.alert.confirmedToast', { count: result.confirmed }));
          await client.invalidateQueries();
        }
      })
      .catch(() => {});
  }, [firmId, client, toast, t]);
  const query = useQuery({
    queryKey: ['payment-alert', firmId],
    queryFn: async () => unwrap(await window.api.payments.alert(firmId)),
  });
  const data = query.data;
  if (!data || (!data.seenRecorded && !data.waitingToRecord)) return null;
  return (
    <div className="upi-alert" role="status">
      <BellRing size={22} />
      <div>
        {data.seenRecorded > 0 && (
          <>
            <strong>{t('payments.alert.seen', { count: data.seenRecorded })}</strong>
            <p className="muted">
              <MoneyText value={data.seenRecordedAmount} /> · {t('payments.alert.seenBody')}
            </p>
          </>
        )}
        {data.waitingToRecord > 0 && (
          <p>
            <strong>{t('payments.alert.waiting', { count: data.waitingToRecord })}</strong>
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={() => navigate('bankMatch')}>
        {t('payments.alert.action')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          void window.api.payments
            .sync(firmId)
            .then(unwrap)
            .then(async (result) => {
              if (result.confirmed)
                toast(t('payments.alert.confirmedToast', { count: result.confirmed }));
              await client.invalidateQueries();
            })
            .catch(() => {});
        }}
      >
        {t('payments.alert.check')}
      </Button>
    </div>
  );
}
