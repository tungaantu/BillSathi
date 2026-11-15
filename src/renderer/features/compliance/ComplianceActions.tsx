import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
import { EinvoiceDialog } from './EinvoiceDialog';
import { EwayDialog } from './EwayDialog';
import './compliance.css';

/** E-way bill / e-invoice actions on the invoice preview (sale invoices and credit notes only). */
export function ComplianceActions({ id }: { id: number }) {
  const { t } = useTranslation(),
    { firmId } = useMasters();
  const [dialog, setDialog] = useState<'eway' | 'einvoice' | null>(null);
  const doc = useQuery({
    queryKey: ['sale-type', firmId, id],
    queryFn: async () => unwrap(await window.api.sales.get(firmId, id)),
  });
  const record = useQuery({
    queryKey: ['compliance-record', firmId, id],
    queryFn: async () => unwrap(await window.api.compliance.record(firmId, id)),
  });
  if (!doc.data || !['sale', 'sale_return'].includes(doc.data.type)) return null;
  return (
    <div className="compliance-actions" data-tour="compliance-actions">
      <Button variant="secondary" onClick={() => setDialog('eway')}>
        {t('compliance.eway.open')}
      </Button>
      {record.data?.ewbNo && (
        <Badge tone="success">{t('compliance.badge.ewb', { no: record.data.ewbNo })}</Badge>
      )}
      <Button variant="secondary" onClick={() => setDialog('einvoice')}>
        {t('compliance.einv.open')}
      </Button>
      {record.data?.einvoice && <Badge tone="success">{t('compliance.badge.irn')}</Badge>}
      <EwayDialog id={id} open={dialog === 'eway'} onOpenChange={(v) => !v && setDialog(null)} />
      <EinvoiceDialog
        id={id}
        open={dialog === 'einvoice'}
        onOpenChange={(v) => !v && setDialog(null)}
      />
    </div>
  );
}
