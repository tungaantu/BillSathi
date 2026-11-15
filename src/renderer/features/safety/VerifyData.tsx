import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import type { VerifyCheck, VerifyId, VerifyReport } from '../../../shared/safety-api';
import { Button, ConfirmDialog, EmptyState, HelpTip, useToast } from '../../components/ui';
import { useApp } from '../../app/state';
import { formatWhen } from './format';

const ICONS = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle } as const;

export function VerifyData() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { firm, error } = useApp();
  const firmId = firm!.id;
  const [report, setReport] = useState<VerifyReport | null>(null),
    [busy, setBusy] = useState(false),
    [fixing, setFixing] = useState<VerifyId | null>(null);
  async function run() {
    setBusy(true);
    try {
      setReport(unwrap(await window.api.safety.verify.run(firmId)));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function fix() {
    const id = fixing;
    setFixing(null);
    if (!id) return;
    setBusy(true);
    try {
      setReport(unwrap(await window.api.safety.verify.fix(firmId, id)));
      await client.invalidateQueries();
      toast(t('safety.verify.fixed'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const problems = report?.checks.filter((c) => c.status !== 'ok').length ?? 0;
  const row = (c: VerifyCheck) => {
    const Icon = ICONS[c.status];
    return (
      <li key={c.id} className={`verify-row ${c.status}`}>
        <Icon size={22} className="verify-icon" aria-hidden />
        <div>
          <strong>
            {t(`safety.verify.${c.id}.title`)} <HelpTip id={`safetyVerify-${c.id}`} />
          </strong>
          <p className="muted">
            {c.status === 'ok'
              ? t(`safety.verify.${c.id}.ok`)
              : t(`safety.verify.${c.id}.problem`, { count: c.count })}
          </p>
          {c.details.length > 0 && (
            <ul className="verify-details">
              {c.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
              {c.count > c.details.length && (
                <li className="muted">
                  {t('safety.verify.more', { count: c.count - c.details.length })}
                </li>
              )}
            </ul>
          )}
        </div>
        {c.fixable && (
          <Button variant="secondary" disabled={busy} onClick={() => setFixing(c.id)}>
            {t('safety.verify.fix')}
          </Button>
        )}
        <span className="sr-only">{t(`safety.verify.status.${c.status}`)}</span>
      </li>
    );
  };
  return (
    <div className="stack">
      <div className="page-heading" data-tour="safety-head">
        <div>
          <span className="eyebrow">{t('nav.utilities')}</span>
          <h1>
            {t('nav.verifyData')} <HelpTip id="safetyVerify" />
          </h1>
          <p className="muted">{t('safety.verify.intro')}</p>
        </div>
        {report && (
          <Button disabled={busy} onClick={() => void run()} data-tour="safety-actions">
            {busy ? t('safety.verify.running') : t('safety.verify.again')}
          </Button>
        )}
      </div>
      <section className="card stack" data-tour="safety-main">
        {!report ? (
          <EmptyState
            title={t('safety.verify.emptyTitle')}
            description={busy ? t('safety.verify.running') : t('safety.verify.emptyBody')}
            action={t('safety.verify.run')}
            onAction={() => void run()}
            icon={<ShieldCheck size={30} />}
          />
        ) : (
          <>
            <div
              className={`info-banner ${problems ? 'warning-banner' : 'success-banner'}`}
              role="status"
            >
              {problems ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              <div>
                <strong>
                  {problems
                    ? t('safety.verify.attention', { count: problems })
                    : t('safety.verify.allGood')}
                </strong>
                <p>
                  {t('safety.verify.checkedAt', { when: formatWhen(report.ranAt, i18n.language) })}
                </p>
              </div>
            </div>
            <ul className="verify-list" data-tour="safety-list">
              {report.checks.map(row)}
            </ul>
          </>
        )}
      </section>
      <ConfirmDialog
        open={fixing !== null}
        onOpenChange={(v) => !v && setFixing(null)}
        title={t('safety.verify.fixTitle')}
        onConfirm={() => void fix()}
      >
        {t('safety.verify.fixBody')}
      </ConfirmDialog>
    </div>
  );
}
