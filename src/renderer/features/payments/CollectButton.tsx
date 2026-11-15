import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QrCode } from 'lucide-react';
import { Button } from '../../components/ui';
import { useSales } from '../sales/common';
import { CollectDialog } from './CollectDialog';

/** "Collect via UPI" button; shows itself only for posted sale invoices that still have a balance. */
export function CollectUpiButton({
  invoiceId,
  variant = 'secondary',
}: {
  invoiceId: number;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { t } = useTranslation(),
    { txns } = useSales();
  const [open, setOpen] = useState(false);
  const invoice = txns.find((x) => x.id === invoiceId);
  if (!invoice || invoice.type !== 'sale' || invoice.status !== 'posted' || invoice.balance <= 0)
    return null;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <QrCode size={16} />
        {t('payments.collect')}
      </Button>
      {open && (
        <CollectDialog
          invoiceId={invoiceId}
          balance={invoice.balance}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
