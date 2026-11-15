import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Monitor, ExternalLink } from 'lucide-react';
import { Button, Dialog, Field, Input, MoneyInput, MoneyText, useToast } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatINR } from '../../../shared/money';
import { isValidLast4, isValidUtr } from '../../../shared/upi-utils';
import type { CollectionView, PollResult } from '../../../shared/payments-api';
import { CollectTips } from './CollectTips';
import './payments.css';

const POLL_MS = 3000;
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/** The Collect via UPI dialog: QR, countdown, gateway status and recording the payment. */
export function CollectDialog({
  invoiceId,
  balance,
  onClose,
}: {
  invoiceId: number;
  balance: number;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    { firm, error } = useApp(),
    { navigate } = useNavigation(),
    toast = useToast(),
    client = useQueryClient();
  const firmId = firm!.id;
  const [amount, setAmount] = useState(balance),
    [view, setView] = useState<CollectionView | null>(null),
    [gateway, setGateway] = useState<PollResult['gateway']>('manual'),
    [now, setNow] = useState(() => Date.now()),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(false),
    [typedUtr, setTypedUtr] = useState<string | null>(null),
    [last4, setLast4] = useState(''),
    [fieldError, setFieldError] = useState(''),
    [second, setSecond] = useState(false),
    [blocker, setBlocker] = useState('');
  const started = useRef(false),
    polling = useRef(false),
    current = useRef<CollectionView | null>(null);
  useEffect(() => {
    current.current = view;
  });

  const begin = useCallback(
    async (value: number, previous?: CollectionView | null) => {
      setBusy(true);
      setBlocker('');
      try {
        if (previous && ['open', 'seen', 'expired'].includes(previous.status))
          unwrap(await window.api.payments.cancel(firmId, previous.id));
        const outcome = unwrap(await window.api.payments.start(firmId, invoiceId, value));
        if (!outcome.ok) {
          setBlocker(outcome.reason);
          return;
        }
        setView(outcome.collection);
        setAmount(outcome.collection.amount);
        setGateway(outcome.collection.provider === 'youpi' ? 'waiting' : 'manual');
        setNow(Date.now());
      } catch (e) {
        error(e);
      } finally {
        setBusy(false);
      }
    },
    [firmId, invoiceId, error],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin(balance);
  }, [begin, balance]);

  // Countdown tick.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ask the main process for the latest status every 3 seconds.
  const active = view && ['open', 'seen'].includes(view.status);
  const viewId = view?.id;
  useEffect(() => {
    if (!active || viewId === undefined) return;
    const timer = setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void window.api.payments
        .poll(firmId, viewId)
        .then(unwrap)
        .then((result) => {
          if (current.current?.id !== result.collection.id) return;
          setView(result.collection);
          setGateway(result.gateway);
        })
        .catch(() => {})
        .finally(() => {
          polling.current = false;
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, viewId, firmId]);

  // Seen payments open the record form for the owner's click.
  const seen = view?.status === 'seen';
  const utr = typedUtr ?? (seen && view ? view.seenUtr : '');

  const left = view ? Date.parse(view.expiresAt) - now : 0;
  const expired = Boolean(
    view &&
    (view.status === 'expired' ||
      (view.provider === 'manual' && left <= 0 && view.status === 'open')),
  );

  async function record() {
    if (!view) return;
    const needsUtr = !seen || utr.length > 0;
    if (needsUtr && !isValidUtr(utr)) return setFieldError('badUtr');
    if (!isValidLast4(last4)) return setFieldError('badLast4');
    setFieldError('');
    setBusy(true);
    try {
      const outcome = unwrap(await window.api.payments.record(firmId, view.id, { utr, last4 }));
      if (!outcome.ok) {
        if (outcome.reason === 'badUtr' || outcome.reason === 'badLast4')
          setFieldError(outcome.reason);
        else toast(t(`payments.error.${outcome.reason}`), { error: true });
        return;
      }
      await client.invalidateQueries();
      toast(t('payments.recordedToast'));
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  async function secondScreen() {
    if (!view) return;
    try {
      unwrap(await window.api.payments.display(firmId, view.id, !second));
      setSecond(!second);
      if (!second) toast(t('payments.secondScreenOpened'));
    } catch (e) {
      error(e);
    }
  }

  async function close(cancelQr = false) {
    try {
      if (view && second) await window.api.payments.display(firmId, view.id, false);
      if (view && cancelQr) await window.api.payments.cancel(firmId, view.id);
    } catch {
      /* Closing must always work. */
    }
    onClose();
  }

  const noParty = view !== null && !view.hasParty;
  const showForm = view && (manual || seen) && !noParty && view.status !== 'recorded';
  const statusClass = seen
    ? 'is-seen'
    : gateway === 'review' || gateway === 'failed' || gateway === 'offline'
      ? 'is-warn'
      : '';

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) void close();
        }}
        title={t('payments.collect.title')}
        description={t('payments.collect.desc')}
        className="collect-dialog"
      >
        {/* The dialog may open from inside another form; keep Enter and submit events local. */}
        <div
          onSubmit={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
        >
          {blocker ? (
            <div className="stack">
              <p role="alert" className="field-error">
                {t(`payments.error.${blocker}`)}
              </p>
              <div className="form-actions">
                {blocker === 'noUpiId' && (
                  <Button
                    onClick={() => {
                      onClose();
                      navigate('settings/payments');
                    }}
                  >
                    {t('payments.goSettings')}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => void close()}>
                  {t('payments.close')}
                </Button>
              </div>
            </div>
          ) : !view ? (
            <p className="muted">{t('payments.collect.starting')}</p>
          ) : (
            <div className="collect-layout">
              <div className={`collect-qr ${expired ? 'is-dim' : ''}`} data-tip="qr">
                <img src={view.qr} alt={t('payments.collect.desc')} />
                <div className="collect-amount">{formatINR(view.amount)}</div>
                <dl className="collect-facts">
                  <dt>{t('payments.payTo')}</dt>
                  <dd>{view.upiId}</dd>
                  <dt>{t('payments.invoice')}</dt>
                  <dd>{view.invoiceLabel}</dd>
                  <dt>{t('payments.customer')}</dt>
                  <dd>{view.partyName || t('payments.walkIn')}</dd>
                </dl>
                <span className="collect-timer" aria-live="off">
                  {expired ? t('payments.expired') : t('payments.timeLeft', { time: clock(left) })}
                </span>
              </div>
              <div className="collect-side">
                <form
                  className="collect-amount-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (amount !== view.amount) void begin(amount, view);
                  }}
                >
                  <Field id="collect-amount" label={t('payments.amount')} help="payments-amount">
                    <MoneyInput
                      id="collect-amount"
                      value={amount}
                      onValueChange={setAmount}
                      disabled={view.status === 'recorded'}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={
                      busy || amount === view.amount || amount <= 0 || amount > view.balance
                    }
                  >
                    {t('payments.updateQr')}
                  </Button>
                </form>
                <p className="muted">
                  {t('payments.balance')}: <MoneyText value={view.balance} />
                </p>

                <div
                  className={`collect-status ${statusClass}`}
                  data-tip="status"
                  aria-live="polite"
                >
                  {view.youpiProblem && (
                    <p className="field-error" role="alert">
                      {t(`payments.problem.${view.youpiProblem}`)} {t('payments.problem.fallback')}
                    </p>
                  )}
                  {seen ? (
                    <>
                      <strong>{t('payments.status.seen')}</strong>
                      <span>
                        {view.seenUtr
                          ? t('payments.status.seenBody', {
                              amount: formatINR(view.amount),
                              utr: view.seenUtr,
                            })
                          : t('payments.status.seenNoUtr', { amount: formatINR(view.amount) })}
                      </span>
                      <span className="muted">{t('payments.status.seenNote')}</span>
                    </>
                  ) : gateway === 'review' ? (
                    <span>{t('payments.status.review')}</span>
                  ) : gateway === 'failed' || view.status === 'failed' ? (
                    <span>{t('payments.status.failed')}</span>
                  ) : gateway === 'offline' ? (
                    <span>{t('payments.status.offline')}</span>
                  ) : expired ? (
                    <>
                      <span>{t('payments.expired')}</span>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void begin(amount, view)}
                      >
                        {t('payments.newQr')}
                      </Button>
                    </>
                  ) : view.provider === 'youpi' ? (
                    <>
                      <strong>{t('payments.gatewayUsed')}</strong>
                      <span>{t('payments.status.watching')}</span>
                      {view.checkoutUrl && (
                        <>
                          <span className="muted">{t('payments.openCheckoutHelp')}</span>
                          <div>
                            <Button
                              variant="secondary"
                              onClick={() => void window.api.payments.openCheckout(firmId, view.id)}
                            >
                              <ExternalLink size={15} />
                              {t('payments.openCheckout')}
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span>{t('payments.status.waiting')}</span>
                      <span className="muted">{t('payments.manualOnly')}</span>
                    </>
                  )}
                </div>

                <div data-tip="manual" className="stack">
                  {noParty && <p className="muted">{t('payments.needParty')}</p>}
                  {!manual && !seen && !noParty && view.status !== 'recorded' && (
                    <div>
                      <Button variant="secondary" onClick={() => setManual(true)}>
                        {t('payments.customerSaysPaid')}
                      </Button>
                    </div>
                  )}
                  {showForm && (
                    <form
                      className="stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void record();
                      }}
                    >
                      <Field
                        id="collect-utr"
                        label={t('payments.utr')}
                        help="payments-utr"
                        error={fieldError === 'badUtr' ? t('payments.error.badUtr') : undefined}
                      >
                        <Input
                          id="collect-utr"
                          autoFocus
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={t('payments.utrPlaceholder')}
                          value={utr}
                          aria-invalid={fieldError === 'badUtr' || undefined}
                          onChange={(e) => setTypedUtr(digits(e.target.value, 12))}
                        />
                      </Field>
                      <Field
                        id="collect-last4"
                        label={t('payments.last4')}
                        help="payments-last4"
                        error={fieldError === 'badLast4' ? t('payments.error.badLast4') : undefined}
                      >
                        <Input
                          id="collect-last4"
                          inputMode="numeric"
                          autoComplete="off"
                          value={last4}
                          onChange={(e) => setLast4(digits(e.target.value, 4))}
                        />
                      </Field>
                      <div>
                        <Button type="submit" disabled={busy}>
                          {t(seen ? 'payments.recordSeen' : 'payments.recordPayment')}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                <CollectTips />

                <div className="collect-actions">
                  <Button variant="secondary" onClick={() => void secondScreen()}>
                    <Monitor size={16} />
                    {t(second ? 'payments.secondScreenClose' : 'payments.secondScreen')}
                  </Button>
                  {view.status !== 'recorded' && (
                    <Button variant="ghost" onClick={() => void close(true)}>
                      {t('payments.cancelQr')}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => void close()}>
                    {t('payments.close')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
