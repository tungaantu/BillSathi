import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, DatabaseBackup, Lock, LockOpen } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  HelpTip,
  MoneyText,
  useToast,
} from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
import { requirePinIfSet } from '../safety';
import './utilities.css';

/** Utilities → Close financial year: backup, preview what carries forward, then lock the year. */
export function CloseYear() {
  const { t } = useTranslation(),
    { firm, settings, error, refresh } = useApp(),
    { navigate } = useNavigation(),
    toast = useToast();
  const firmId = firm!.id;
  const [backup, setBackup] = useState(''),
    [reset, setReset] = useState(false),
    [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['fyStatus', firmId],
    queryFn: async () => unwrap(await window.api.fy.status(firmId)),
  });
  const next = status.data?.next ?? null;
  const preview = useQuery({
    queryKey: ['fyPreview', firmId, next?.startYear],
    queryFn: async () => unwrap(await window.api.fy.preview(firmId, next!.startYear)),
    enabled: Boolean(next),
  });
  const date = (d: string) => formatDate(d, settings);
  async function takeBackup() {
    setBusy(true);
    try {
      const done = unwrap(await window.api.safety.backup.run(false));
      if (done) setBackup(done.path);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    try {
      unwrap(await window.api.fy.close(firmId, next!.startYear, backup, reset));
      toast(t('fy.closed', { label: next!.label }));
      setBackup('');
      await refresh();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  function reopen() {
    requirePinIfSet(() => {
      void window.api.fy
        .reopen(firmId)
        .then(unwrap)
        .then(async () => {
          toast(t('fy.reopened'));
          await refresh();
        })
        .catch(error);
    });
  }
  const p = preview.data;
  const history = status.data?.history ?? [];
  const latestOpen = history.find((h) => !h.reopenedAt);
  return (
    <div className="stack close-year">
      <div className="page-heading">
        <div>
          <h1>{t('nav.closeYear')}</h1>
          <p className="muted">
            {t('fy.intro')} <HelpTip id="fy-close" />
          </p>
        </div>
        <Badge tone={status.data?.closedThrough ? 'success' : ''}>
          <Lock size={14} />{' '}
          {status.data?.closedThrough
            ? t('fy.closedThrough', { date: date(status.data.closedThrough) })
            : t('fy.noneClosed')}
        </Badge>
      </div>
      {!next ? (
        <section className="card">
          <EmptyState
            title={t('fy.nothing')}
            description={t('fy.nothingBody')}
            action={t('nav.reports')}
            onAction={() => navigate('reports')}
          />
        </section>
      ) : (
        <>
          <section className="card stack fy-step" data-tour="fy-backup">
            <h2>
              <span className="fy-num">1</span> {t('fy.step1')}
            </h2>
            <p className="muted">{t('fy.step1Body')}</p>
            {backup ? (
              <p className="success">
                <CheckCircle2 size={16} /> {t('fy.backupDone', { path: backup })}
              </p>
            ) : (
              <Button disabled={busy} onClick={() => void takeBackup()}>
                <DatabaseBackup size={16} /> {t('fy.backupNow')}
              </Button>
            )}
          </section>
          <section className="card stack fy-step" data-tour="fy-preview">
            <h2>
              <span className="fy-num">2</span>{' '}
              {t('fy.step2', { label: next.label, start: date(next.start), end: date(next.end) })}
            </h2>
            <p className="muted">{t('fy.step2Body')}</p>
            {p && (
              <>
                <div className="report-summary">
                  {(
                    [
                      ['receivable', p.totals.receivable],
                      ['payable', p.totals.payable],
                      ['cashBank', p.totals.cashBank],
                      ['stockValue', p.totals.stockValue],
                    ] as const
                  ).map(([k, v]) => (
                    <div className="card" key={k}>
                      <span className="muted small">{t(`fy.total.${k}`)}</span>
                      <strong className="money">
                        <MoneyText value={v} />
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="fy-lists">
                  <FyList
                    title={t('fy.list.accounts')}
                    rows={p.accounts.map((a) => [a.name, a.balance])}
                  />
                  <FyList
                    title={t('fy.list.parties')}
                    rows={p.parties.map((x) => [x.name, x.balance])}
                  />
                  <FyList
                    title={t('fy.list.stock')}
                    rows={p.stock.map((s) => [`${s.name} · ${s.qty}`, s.value])}
                  />
                  <FyList
                    title={t('fy.list.unpaid')}
                    rows={p.unpaid.map((u) => [`${u.number} · ${u.party}`, u.balance])}
                  />
                  <FyList
                    title={t('fy.list.cheques')}
                    rows={p.openCheques.map((c) => [`${c.number} · ${c.party}`, c.amount])}
                  />
                </div>
              </>
            )}
          </section>
          <section className="card stack fy-step" data-tour="fy-confirm">
            <h2>
              <span className="fy-num">3</span> {t('fy.step3')}
            </h2>
            <p className="muted">{t('fy.step3Body')}</p>
            <Checkbox label={t('fy.reset')} checked={reset} onCheckedChange={setReset} />
            <div>
              <Button disabled={!backup || busy || !p} onClick={() => setConfirming(true)}>
                <Lock size={16} /> {t('fy.closeButton', { label: next.label })}
              </Button>
              {!backup && <p className="muted small">{t('fy.backupFirst')}</p>}
            </div>
          </section>
        </>
      )}
      {history.length > 0 && (
        <section className="card stack">
          <h2>{t('fy.history')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('fy.col.year')}</th>
                <th>{t('fy.col.closedOn')}</th>
                <th>{t('fy.col.status')}</th>
                <th>{t('sales.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.label}</td>
                  <td>{date(h.closedAt.slice(0, 10))}</td>
                  <td>{t(h.reopenedAt ? 'fy.status.reopened' : 'fy.status.closed')}</td>
                  <td>
                    {h.id === latestOpen?.id && (
                      <Button variant="ghost" onClick={reopen}>
                        <LockOpen size={16} /> {t('fy.reopen')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('fy.confirmTitle', { label: next?.label ?? '' })}
        onConfirm={() => {
          setConfirming(false);
          void close();
        }}
      >
        {t('fy.confirmBody', { end: next ? date(next.end) : '' })}
      </ConfirmDialog>
    </div>
  );
}

function FyList({ title, rows }: { title: string; rows: [string, number][] }) {
  const { t } = useTranslation();
  return (
    <details className="fy-list">
      <summary>
        {title} ({rows.length})
      </summary>
      {!rows.length ? (
        <p className="muted small">{t('fy.list.empty')}</p>
      ) : (
        <ul>
          {rows.slice(0, 200).map(([label, value], i) => (
            <li key={i}>
              <span>{label}</span>
              <MoneyText value={value} />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
