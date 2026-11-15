import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { Button } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';

/** Dashboard nudge: batches that have expired or expire within 30 days. */
export function InventoryAlerts() {
  const { firm, settings } = useApp(),
    { navigate } = useNavigation(),
    { t } = useTranslation();
  const expiry = useQuery({
    queryKey: ['batchExpiry', firm!.id],
    queryFn: async () => unwrap(await window.api.inventory.expiry(firm!.id)),
    enabled: Boolean(settings.batches),
  });
  const rows = expiry.data ?? [];
  const expired = rows.filter((r) => r.status === 'expired').length,
    soon = rows.filter((r) => r.status === 'expiring30').length;
  if (!settings.batches || (!expired && !soon)) return null;
  return (
    <div className="toolbar">
      {expired > 0 && (
        <Button variant="secondary" onClick={() => navigate('batchExpiry')}>
          <CalendarClock size={16} /> {t('inventory.alert.expired', { count: expired })}
        </Button>
      )}
      {soon > 0 && (
        <Button variant="secondary" onClick={() => navigate('batchExpiry')}>
          <CalendarClock size={16} /> {t('inventory.alert.soon', { count: soon })}
        </Button>
      )}
    </div>
  );
}
