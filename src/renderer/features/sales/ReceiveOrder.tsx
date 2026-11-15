import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, Input, EmptyState, HelpTip } from '../../components/ui';
import { useSales } from './common';
import { unwrap } from '../../../shared/types';
import { remainingOrderLines } from '../../../shared/purchase-orders';
import type { DocumentType, SaleLine } from '../../../shared/sales';
export function ReceiveOrder({
  id,
  target = 'purchase',
  onClose,
  onConvert,
}: {
  id: number;
  target?: DocumentType;
  onClose: () => void;
  onConvert: (qty: number[]) => void;
}) {
  const { t } = useTranslation(),
    { firmId, txns, error } = useSales();
  const [lines, setLines] = useState<SaleLine[]>([]),
    [qty, setQty] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const source = unwrap(await window.api.sales.get(firmId, id));
      const bills = await Promise.all(
        txns
          .filter(
            (t) =>
              (source.type === 'purchase_order'
                ? t.type === 'purchase'
                : ['sale', 'delivery_challan', 'challan_return'].includes(t.type)) &&
              !['cancelled', 'draft'].includes(t.status),
          )
          .map(async (t) => unwrap(await window.api.sales.get(firmId, t.id))),
      );
      const remaining = remainingOrderLines(
        source,
        bills.filter((b) => b.refTxnId === id),
      );
      if (active) {
        setLines(remaining);
        setQty(remaining.map((l) => l.qty));
      }
    })().catch(error);
    return () => {
      active = false;
    };
  }, [firmId, id, txns, error]);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t(target === 'purchase' ? 'sales.receiveOrder' : 'orders.convertTitle')}
    >
      <p>
        {t(target === 'purchase' ? 'sales.receiveOrderBody' : 'orders.convertBody')}{' '}
        <HelpTip id="orders" />
      </p>
      {!lines.length ? (
        <EmptyState
          title={t('loading')}
          description={t(target === 'purchase' ? 'sales.receiveOrderBody' : 'orders.convertBody')}
          action={t('cancel')}
          onAction={onClose}
        />
      ) : (
        lines.map((l, i) => (
          <label className="allocation-row" key={i}>
            {l.name}
            <span>{t('sales.remainingQty', { qty: l.qty })}</span>
            <Input
              aria-label={l.name}
              type="number"
              min="0"
              max={l.qty}
              step="0.001"
              value={qty[i]}
              onChange={(e) => setQty(qty.map((q, j) => (j === i ? Number(e.target.value) : q)))}
            />
          </label>
        ))
      )}
      <div className="form-actions">
        <Button
          disabled={!qty.some((q) => q > 0) || qty.some((q, i) => q < 0 || q > lines[i].qty)}
          onClick={() => onConvert(qty)}
        >
          {t(
            target === 'purchase'
              ? 'sales.convertBill'
              : target === 'delivery_challan'
                ? 'orders.convertChallan'
                : target === 'challan_return'
                  ? 'orders.returnChallan'
                  : 'sales.convert',
          )}
        </Button>
      </div>
    </Dialog>
  );
}
