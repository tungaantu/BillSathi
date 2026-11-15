import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Field,
  HelpTip,
  Input,
  NumberInput,
  Skeleton,
  Switch,
  useToast,
} from '../../components/ui';
import { useApp } from '../../app/state';
import { unwrap, type FirmInput } from '../../../shared/types';
import { isValidUpiId } from '../../../shared/upi-utils';
import type { PaymentConfig, PaymentConfigInput, TestOutcome } from '../../../shared/payments-api';
import './payments.css';

/** Settings → Payments: UPI ID, QR on invoices, and the optional YouPI-PG connection. */
export function PaymentSettings() {
  const { firm } = useApp();
  const query = useQuery({
    queryKey: ['payment-config', firm!.id],
    queryFn: async () => unwrap(await window.api.payments.config(firm!.id)),
  });
  if (!query.data) return <Skeleton />;
  return <PaymentForm key={firm!.id} config={query.data} />;
}

function SecretField({
  id,
  label,
  help,
  saved,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  saved: boolean;
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field id={id} label={label} help={help}>
      <div className="collect-actions">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          disabled={disabled}
          placeholder={
            saved ? `••••••••  (${t('payments.youpi.saved')}) ${t('payments.youpi.keep')}` : ''
          }
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {saved && value !== '' && (
          <Button variant="ghost" onClick={() => onChange('')}>
            {t('payments.youpi.remove')}
          </Button>
        )}
      </div>
    </Field>
  );
}

function PaymentForm({ config }: { config: PaymentConfig }) {
  const { t } = useTranslation(),
    { firm, settings, saveSetting, error } = useApp(),
    toast = useToast(),
    client = useQueryClient();
  const [upiId, setUpiId] = useState(config.upiId),
    [draft, setDraft] = useState<PaymentConfigInput>({
      payeeName: config.payeeName,
      youpiEnabled: config.youpiEnabled,
      baseUrl: config.baseUrl,
      merchantId: config.merchantId,
      webhookEnabled: config.webhookEnabled,
      webhookPort: config.webhookPort,
    }),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState<TestOutcome | null>(null),
    [upiError, setUpiError] = useState(false);
  const change = (patch: Partial<PaymentConfigInput>) => setDraft((d) => ({ ...d, ...patch }));
  const locked = !config.secureStorage;

  async function save() {
    if (upiId.trim() && !isValidUpiId(upiId)) return setUpiError(true);
    setUpiError(false);
    setBusy(true);
    try {
      if (upiId.trim() !== config.upiId) {
        const rest = Object.fromEntries(
          Object.entries(firm!).filter(([key]) => !['id', 'logo', 'signature'].includes(key)),
        ) as FirmInput;
        unwrap(await window.api.firm.update(firm!.id, { ...rest, upiId: upiId.trim() }));
      }
      unwrap(await window.api.payments.saveConfig(firm!.id, draft));
      await client.invalidateQueries();
      toast(t('payments.settings.saved'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(unwrap(await window.api.payments.testYoupi(firm!.id, draft)));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, help: string, control: ReactNode) => (
    <div className="setting-row">
      <div className="field-label">
        <span>{label}</span>
        <HelpTip id={help} />
      </div>
      {control}
    </div>
  );

  return (
    <form
      className="stack payments-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="card settings-card">
        <h3>{t('payments.settings.title')}</h3>
        <p className="muted">{t('payments.settings.body')}</p>
        <Field
          id="pay-upi"
          label={t('payments.settings.upiId')}
          help="payments-upiid"
          error={upiError ? t('payments.settings.upiIdError') : undefined}
        >
          <Input
            id="pay-upi"
            value={upiId}
            autoComplete="off"
            placeholder={t('payments.settings.upiIdPlaceholder')}
            aria-invalid={upiError || undefined}
            onChange={(e) => setUpiId(e.target.value)}
          />
        </Field>
        <Field id="pay-payee" label={t('payments.settings.payee')} help="payments-payee">
          <Input
            id="pay-payee"
            value={draft.payeeName}
            maxLength={50}
            placeholder={firm?.name ?? t('payments.settings.payeePlaceholder')}
            onChange={(e) => change({ payeeName: e.target.value })}
          />
        </Field>
        {row(
          t('payments.settings.showQr'),
          'payments-showqr',
          <Switch
            label={t('payments.settings.showQr')}
            checked={Boolean(settings.printQr)}
            onCheckedChange={(value) => void saveSetting('printQr', value).catch(() => {})}
          />,
        )}
      </section>

      <section className="card settings-card">
        <h3>
          {t('payments.youpi.title')} <HelpTip id="payments-youpi" />
        </h3>
        <p className="muted">{t('payments.youpi.explain')}</p>
        {locked && (
          <p className="field-error" role="alert">
            {t('payments.youpi.noStorage')}
          </p>
        )}
        {row(
          t('payments.youpi.enabled'),
          'payments-youpi',
          <Switch
            label={t('payments.youpi.enabled')}
            checked={draft.youpiEnabled}
            onCheckedChange={(youpiEnabled) => change({ youpiEnabled })}
          />,
        )}
        {draft.youpiEnabled && (
          <div className="setting-block">
            <Field id="pay-url" label={t('payments.youpi.baseUrl')} help="payments-baseurl">
              <Input
                id="pay-url"
                value={draft.baseUrl}
                inputMode="url"
                onChange={(e) => change({ baseUrl: e.target.value })}
              />
            </Field>
            <Field
              id="pay-merchant"
              label={t('payments.youpi.merchantId')}
              help="payments-merchant"
            >
              <Input
                id="pay-merchant"
                value={draft.merchantId}
                autoComplete="off"
                onChange={(e) => change({ merchantId: e.target.value })}
              />
            </Field>
            <SecretField
              id="pay-key"
              label={t('payments.youpi.apiKey')}
              help="payments-apikey"
              saved={config.hasApiKey}
              value={draft.apiKey}
              disabled={locked}
              onChange={(apiKey) => change({ apiKey })}
            />
            <SecretField
              id="pay-admin"
              label={t('payments.youpi.adminToken')}
              help="payments-admintoken"
              saved={config.hasAdminToken}
              value={draft.adminToken}
              disabled={locked}
              onChange={(adminToken) => change({ adminToken })}
            />
            <p className="muted">{t('payments.youpi.privacy')}</p>
            <div className="collect-actions">
              <Button variant="secondary" disabled={busy} onClick={() => void test()}>
                {t(busy ? 'payments.youpi.testing' : 'payments.youpi.test')}
              </Button>
            </div>
            {outcome && (
              <div
                className={`test-result ${outcome.ok && outcome.credentials === 'ok' ? '' : 'is-error'}`}
                role="status"
              >
                {outcome.ok ? (
                  <>
                    <strong>
                      {t(
                        outcome.credentials === 'ok'
                          ? 'payments.youpi.test.ok'
                          : 'payments.youpi.test.okNoKeys',
                      )}
                    </strong>
                    <p>
                      {t(
                        `payments.youpi.test.${outcome.tier === 'unknown' ? 'red' : outcome.tier}`,
                      )}
                    </p>
                  </>
                ) : (
                  <strong>{t(`payments.problem.${outcome.problem}`)}</strong>
                )}
              </div>
            )}
            <h4>
              {t('payments.webhook.title')} <HelpTip id="payments-webhook" />
            </h4>
            {row(
              t('payments.webhook.enabled'),
              'payments-webhook',
              <Switch
                label={t('payments.webhook.enabled')}
                checked={draft.webhookEnabled}
                onCheckedChange={(webhookEnabled) => change({ webhookEnabled })}
              />,
            )}
            {draft.webhookEnabled && (
              <>
                <Field id="pay-port" label={t('payments.webhook.port')} help="payments-webhook">
                  <NumberInput
                    id="pay-port"
                    min={1024}
                    max={65535}
                    value={draft.webhookPort}
                    onChange={(e) => change({ webhookPort: Number(e.target.value) })}
                  />
                </Field>
                <SecretField
                  id="pay-secret"
                  label={t('payments.webhook.secret')}
                  help="payments-webhook"
                  saved={config.hasWebhookSecret}
                  value={draft.webhookSecret}
                  disabled={locked}
                  onChange={(webhookSecret) => change({ webhookSecret })}
                />
                <p className="muted">{t('payments.webhook.note')}</p>
              </>
            )}
          </div>
        )}
      </section>
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {t('payments.settings.save')}
        </Button>
      </div>
    </form>
  );
}
