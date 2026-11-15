import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Field, Input, Select, useToast } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
import {
  EINVOICE_SUPPLY_TYPES,
  einvoiceAckSchema,
  type EinvoiceSupplyType,
} from '../../../shared/compliance-api';
import { Guide, IssueList, SummaryLine } from './parts';

interface AckForm {
  irn: string;
  ackNo: string;
  ackDate: string;
  signedQr: string;
}

function Body({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast(),
    client = useQueryClient(),
    { firmId, error } = useMasters();
  const record = useQuery({
    queryKey: ['compliance-record', firmId, id],
    queryFn: async () => unwrap(await window.api.compliance.record(firmId, id)),
  });
  const [supply, setSupply] = useState<EinvoiceSupplyType | null>(null),
    [ack, setAck] = useState<AckForm | null>(null),
    [busy, setBusy] = useState(false),
    [invalid, setInvalid] = useState(false);
  const supplyType = supply ?? record.data?.supplyType ?? 'B2B';
  const saved = record.data?.einvoice;
  const form: AckForm = ack ?? {
    irn: saved?.irn ?? '',
    ackNo: saved?.ackNo ?? '',
    ackDate: saved?.ackDate ?? '',
    signedQr: saved?.signedQr ?? '',
  };
  const check = useQuery({
    queryKey: ['einvoice-check', firmId, id, supplyType],
    queryFn: async () =>
      unwrap(await window.api.compliance.einvoiceCheck(firmId, id, { supplyType })),
    placeholderData: keepPreviousData,
  });
  const blocked = !check.data || check.data.issues.some((i) => i.severity === 'error');
  const refresh = () => client.invalidateQueries({ queryKey: ['compliance-record', firmId, id] });
  async function save() {
    setBusy(true);
    try {
      const result = unwrap(await window.api.compliance.einvoiceSave(firmId, id, { supplyType }));
      if (result.path) {
        toast(t('compliance.saved'));
        await refresh();
      }
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveAck() {
    const parsed = einvoiceAckSchema.safeParse(form);
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    try {
      unwrap(await window.api.compliance.einvoiceSaveAck(firmId, id, parsed.data));
      toast(t('compliance.einv.ackSaved'));
      setAck(null);
      await refresh();
    } catch (e) {
      error(e);
    }
  }
  async function clearAck() {
    try {
      unwrap(await window.api.compliance.einvoiceSaveAck(firmId, id, null));
      toast(t('compliance.einv.ackCleared'));
      setAck(null);
      await refresh();
    } catch (e) {
      error(e);
    }
  }
  const set = (key: keyof AckForm, value: string) => {
    setInvalid(false);
    setAck({ ...form, [key]: value });
  };
  return (
    <div className="compliance-body">
      <p className="muted">{t('compliance.einv.intro')}</p>
      <Guide id="einvoice" prefix="compliance.einv.guide" />
      <Field id="einv-supply" label={t('compliance.einv.supplyType')} help="compliance-einv-supply">
        <Select
          label={t('compliance.einv.supplyType')}
          value={supplyType}
          onChange={(v) => setSupply(v as EinvoiceSupplyType)}
          options={EINVOICE_SUPPLY_TYPES.map((v) => ({
            value: v,
            label: t(`compliance.einv.supply.${v}`),
          }))}
        />
      </Field>
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
      <section className="compliance-section compliance-body">
        <h3>{t('compliance.einv.ackTitle')}</h3>
        <Field id="einv-irn" label={t('compliance.einv.irn')} help="compliance-einv-irn">
          <Input
            id="einv-irn"
            maxLength={64}
            value={form.irn}
            onChange={(e) => set('irn', e.target.value.trim())}
          />
        </Field>
        <div className="form-grid">
          <Field id="einv-ackno" label={t('compliance.einv.ackNo')} help="compliance-einv-ackNo">
            <Input
              id="einv-ackno"
              inputMode="numeric"
              maxLength={20}
              value={form.ackNo}
              onChange={(e) => set('ackNo', e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field
            id="einv-ackdate"
            label={t('compliance.einv.ackDate')}
            help="compliance-einv-ackDate"
          >
            <Input
              id="einv-ackdate"
              placeholder="2026-11-10 12:30:00"
              maxLength={30}
              value={form.ackDate}
              onChange={(e) => set('ackDate', e.target.value)}
            />
          </Field>
        </div>
        <Field id="einv-qr" label={t('compliance.einv.signedQr')} help="compliance-einv-qr">
          <textarea
            id="einv-qr"
            className="input"
            maxLength={8000}
            value={form.signedQr}
            onChange={(e) => set('signedQr', e.target.value.trim())}
          />
        </Field>
        {invalid && (
          <p className="field-error" role="alert">
            {t('compliance.einv.ackInvalid')}
          </p>
        )}
        <div className="button-row">
          <Button variant="secondary" onClick={() => void saveAck()}>
            {t('compliance.einv.ackSave')}
          </Button>
          {saved && (
            <Button variant="ghost" onClick={() => void clearAck()}>
              {t('compliance.einv.ackClear')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

export function EinvoiceDialog({
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
      title={t('compliance.einv.title')}
      className="compliance-dialog"
    >
      <Body id={id} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
