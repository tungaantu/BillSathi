import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, useToast } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
export function CustomerAlerts({ dashboard = false }: { dashboard?: boolean }) {
  const { firm, settings } = useApp(),
    { navigate } = useNavigation(),
    { t } = useTranslation(),
    toast = useToast();
  const seen = useRef(0);
  const query = useQuery({
    queryKey: ['customer-alerts', firm!.id],
    queryFn: async () => unwrap(await window.api.customers.alerts(firm!.id)),
    refetchInterval: 60000,
  });
  useEffect(() => {
    if (!dashboard && query.data && query.data.created > seen.current) {
      toast(t('orders.created', { count: query.data.created - seen.current }));
      seen.current = query.data.created;
    }
  }, [dashboard, query.data, t, toast]);
  if (!dashboard) return null;
  return (
    <div className="toolbar">
      {Boolean(query.data?.created) && (
        <Button variant="secondary" onClick={() => navigate('invoices')}>
          {t('orders.todayCreated', { count: query.data!.created })}
        </Button>
      )}
      {settings.reminders && Boolean(query.data?.due) && (
        <Button variant="secondary" onClick={() => navigate('reminders')}>
          {t('orders.remindToday', { count: query.data!.due })}
        </Button>
      )}
    </div>
  );
}
