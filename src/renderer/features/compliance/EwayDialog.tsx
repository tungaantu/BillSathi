import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Field, Input, useToast } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
import { blankTransport, ewbNumberSchema, type Transport } from '../../../shared/compliance-api';
import { Guide, IssueList, SummaryLine, TransportFields } from './parts';

function Body({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast(),
    client = useQueryClient(),
    { firmId, error } = useMasters();
  const record = useQuery({
    queryKey: ['compliance-record', firmId, id],
    queryFn: async () => unwrap(await window.api.compliance.record(firmId, id)),
  });
  const [transport, setTransport] = useState<Transport>(blankTransport()),
    [debounced, setDebounced] = useState<Transport>(transport),
    [seeded, setSeeded] = useState(false),
    [ewbNo, setEwbNo] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  if (record.data && !seeded) {
    setSeeded(true);
    if (record.data.transport) {
      setTransport(record.data.transport);
      setDebounced(record.data.transport);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(transport), 350);
    return () => clearTimeout(timer);
  }, [transport]);
  const check = useQuery({
    queryKey: ['eway-check', firmId, id, debounced],
    queryFn: async () => unwrap(await window.api.compliance.ewayCheck(firmId, id, debounced)),
    placeholderData: keepPreviousData,
    enabled: seeded || record.isError,
  });
  const blocked = !check.data || check.data.issues.some((i) => i.severity === 'error');
  const savedNo = record.data?.ewbNo ?? '';
  const numberText = ewbNo ?? savedNo;
  async function save() {
    setBusy(true);
    try {
      const result = unwrap(await window.api.compliance.ewaySave(firmId, id, transport));
      if (result.path) {
        toast(t('compliance.saved'));
        await client.invalidateQueries({ queryKey: ['compliance-record', firmId, id] });
      }
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveNumber() {
    try {
      unwrap(await window.api.compliance.ewaySaveNumber(firmId, id, numberText.trim()));
      toast(t('compliance.eway.ewbNoSaved'));
      setEwbNo(null);
      await client.invalidateQueries({ queryKey: ['compliance-record', firmId, id] });
    } catch (e) {
      error(e);
    }
  }
  const numberValid = numberText === '' || ewbNumberSchema.safeParse(numberText.trim()).success;
  return (
    <div className="compliance-body">
      <p className="muted">{t('compliance.eway.intro')}</p>
      <Guide id="eway" prefix="compliance.eway.guide" />
      <TransportFields value={transport} onChange={setTransport} prefix="ewb" />
      <section className="compliance-checks" aria-live="polite">
        <h3>{t('compliance.issues')}</h3>
        {check.isError ? (
          <p className="danger">{t('storage')}</p>
        ) : check.data ? (
          <>
            <IssueList issues={check.data.issues} onNavigate={onClose} />
            <SummaryLine summary={check.data.summary} />
          </>
        ) : (
          <p className="muted">{t('compliance.checking')}</p>
        )}
      </section>
      {blocked && check.data && <p className="muted">{t('compliance.cannotSave')}</p>}
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('compliance.close')}
        </Button>
        <Button disabled={busy || blocked} onClick={() => void save()}>
          {t('compliance.save')}
        </Button>
      </div>
      <section className="compliance-section">
        <Field
          id="ewb-number"
          label={t('compliance.eway.ewbNo')}
          help="compliance-eway-ewbNo"
          error={numberValid ? undefined : t('compliance.eway.ewbNoInvalid')}
        >
          <div className="button-row">
            <Input
              id="ewb-number"
              inputMode="numeric"
              maxLength={12}
              value={numberText}
              onChange={(e) => setEwbNo(e.target.value.replace(/\D/g, ''))}
            />
            <Button
              variant="secondary"
              disabled={!numberValid || numberText.trim() === savedNo}
              onClick={() => void saveNumber()}
            >
              {t('compliance.eway.ewbNoSave')}
            </Button>
          </div>
        </Field>
      </section>
    </div>
  );
}

export function EwayDialog({
  id,
  open,
  onOpenChange,
}: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('compliance.eway.title')}
      className="compliance-dialog"
    >
      <Body id={id} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
