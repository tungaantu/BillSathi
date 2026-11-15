import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../components/ui';
import { useApp } from '../../app/state';
import { unwrap } from '../../../shared/types';
import type { BadgeMap, PaymentBadge } from '../../../shared/payments-api';
import './payments.css';

const empty: BadgeMap = { invoices: {}, payments: {} };
/** UPI / Seen / Confirmed badges for invoice and Payment-In rows. */
export function usePaymentBadges(): BadgeMap {
  const { firm } = useApp();
  const query = useQuery({
    queryKey: ['payment-badges', firm?.id],
    queryFn: async () => unwrap(await window.api.payments.badges(firm!.id)),
    enabled: Boolean(firm),
  });
  return query.data ?? empty;
}

export function PaymentBadgeChip({ badge }: { badge: PaymentBadge | undefined }) {
  const { t } = useTranslation();
  if (!badge) return null;
  return (
    <Tooltip text={t(`payments.badge.${badge}.tip`)}>
      <span
        className={`badge small ${badge === 'confirmed' ? 'upi-confirmed' : badge === 'seen' ? 'upi-seen' : ''}`}
      >
        {t(`payments.badge.${badge}`)}
      </span>
    </Tooltip>
  );
}
