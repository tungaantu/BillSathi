import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HelpTip, Input } from '../../components/ui';
import { useSales } from '../sales/common';
import { unwrap } from '../../../shared/types';
import { redemption, editablePoints } from '../../../shared/customer-features';
import type { SaleDocument } from '../../../shared/sales';
export function LoyaltyRedeem({
  doc,
  id,
  maximum,
  update,
}: {
  doc: SaleDocument;
  id: number | null;
  maximum: number;
  update: (patch: Partial<SaleDocument>) => void;
}) {
  const { t } = useTranslation(),
    { firmId, settings, error } = useSales();
  const query = useQuery({
    queryKey: ['customer-profile', firmId, doc.partyId],
    queryFn: async () => unwrap(await window.api.customers.profile(firmId, doc.partyId!)),
    enabled: Boolean(doc.partyId && settings.loyalty),
  });
  if (!settings.loyalty || !doc.partyId || doc.type !== 'sale') return null;
  const available = query.data ? editablePoints(query.data, id) : 0;
  return (
    <label className="field">
      {t('orders.redeem')} <HelpTip id="orders-redeem" />
      <small>{t('orders.available', { points: available })}</small>
      <Input
        type="number"
        min="0"
        max={Math.max(0, available)}
        step="1"
        value={doc.loyaltyRedeem ?? 0}
        onChange={(e) => {
          const loyaltyRedeem = Number(e.target.value);
          try {
            update({
              loyaltyRedeem,
              loyaltyDiscount: redemption(
                loyaltyRedeem,
                available,
                Number(settings.loyaltyValuePaise),
                maximum,
              ),
            });
          } catch (e) {
            error(e);
          }
        }}
      />
    </label>
  );
}
