import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Field, Input, useToast } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
import {
  blankTransport,
  type BulkEwayResult,
  type ComplianceIssue,
  type Transport,
} from '../../../shared/compliance-api';
import { Guide, TransportFields } from './parts';
import { financialYearStart } from './dates';
import { today } from '../../../shared/masters';

function Reasons({ issues }: { issues: ComplianceIssue[] }) {
  const { t } = useTranslation();
  return (
    <>
      {issues.map((issue, i) => (
        <span key={i}>
          {i ? ' · ' : ''}
          {t(`compliance.issue.${issue.code}`, issue.params ?? {})}
        </span>
      ))}
    </>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { firmId, error } = useMasters();
  const [from, setFrom] = useState(financialYearStart()),
    [to, setTo] = useState(today()),
    [transport, setTransport] = useState<Transport>(blankTransport()),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<BulkEwayResult | null>(null);
  async function run() {
    setBusy(true);
    try {
      const done = unwrap(await window.api.compliance.ewayBulk(firmId, from, to, transport));
      setResult(done);
      if (done.path) toast(t('compliance.bulk.done', { count: done.included }));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="compliance-body">
      <p className="muted">{t('compliance.bulk.intro')}</p>
      <Guide id="eway" prefix="compliance.eway.guide" />
      <div className="form-grid">
        <Field id="bulk-from" label={t('compliance.bulk.from')} help="compliance-bulk-range">
          <Input
            id="bulk-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field id="bulk-to" label={t('compliance.bulk.to')} help="compliance-bulk-range">
          <Input
            id="bulk-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <p className="muted">{t('compliance.bulk.defaults')}</p>
      <TransportFields value={transport} onChange={setTransport} prefix="bulk" />
      {result && (
        <section className="compliance-checks" aria-live="polite">
          {result.included === 0 && <p className="muted">{t('compliance.bulk.none')}</p>}
          {result.warnings.length > 0 && (
            <div>
              <h3>{t('compliance.bulk.notes', { count: result.warnings.length })}</h3>
              <ul className="compliance-list">
                {result.warnings.map((w) => (
                  <li key={w.id}>
                    <strong>{w.label}</strong>: <Reasons issues={w.issues} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div>
              <h3>{t('compliance.bulk.skipped', { count: result.skipped.length })}</h3>
              <ul className="compliance-list">
                {result.skipped.map((s) => (
                  <li key={s.id}>
                    <strong>{s.label}</strong>: <Reasons issues={s.issues} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('compliance.close')}
        </Button>
        <Button disabled={busy || !from || !to || from > to} onClick={() => void run()}>
          {t('compliance.bulk.export')}
        </Button>
      </div>
    </div>
  );
}

export function EwayBulk({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('compliance.bulk.title')}
      className="compliance-dialog"
    >
      <Body onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
