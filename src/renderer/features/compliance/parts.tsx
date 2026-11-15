import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, HelpTip, Input, Select } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { validateGSTIN } from '../../../shared/gstin';
import {
  TRANSPORT_MODES,
  isValidVehicle,
  type ComplianceIssue,
  type FixTarget,
  type Transport,
} from '../../../shared/compliance-api';
import { formatINR } from '../../../shared/money';
import './compliance.css';

const FIX_ROUTE: Record<Exclude<FixTarget, null>, string> = {
  profile: 'profile',
  party: 'parties',
  item: 'items',
  invoice: 'invoices',
};

/** Missing/invalid data, each with a plain-language message and a jump to the screen that fixes it. */
export function IssueList({
  issues,
  onNavigate,
}: {
  issues: ComplianceIssue[];
  onNavigate?: () => void;
}) {
  const { t } = useTranslation(),
    { navigate } = useNavigation();
  if (!issues.length)
    return (
      <p className="success" role="status">
        {t('compliance.issues.none')}
      </p>
    );
  return (
    <ul className="issue-list" aria-label={t('compliance.issues')}>
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={`issue ${issue.severity}`}>
          <div>
            <strong>
              {t(issue.severity === 'error' ? 'compliance.mustFix' : 'compliance.check')}
            </strong>
            {t(`compliance.issue.${issue.code}`, issue.params ?? {})}
          </div>
          {issue.fix && (
            <Button
              variant="secondary"
              onClick={() => {
                onNavigate?.();
                navigate(FIX_ROUTE[issue.fix!]);
              }}
            >
              {t('compliance.fix')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SummaryLine({
  summary,
}: {
  summary: { total: number; taxable: number; tax: number; items: number };
}) {
  const { t } = useTranslation();
  return (
    <p className="compliance-summary">
      {t('compliance.summary', {
        total: formatINR(summary.total),
        taxable: formatINR(summary.taxable),
        tax: formatINR(summary.tax),
        items: summary.items,
      })}
    </p>
  );
}

/** A three-step walkthrough shown inside a dialog (the app tour cannot sit above a modal). */
export function Guide({ id, prefix, steps = 3 }: { id: string; prefix: string; steps?: number }) {
  const { t } = useTranslation(),
    { settings, saveSetting } = useApp();
  const key = `tour.compliance-${id}`;
  // Shown automatically the first time; the dialog remounts this on every open.
  const [step, setStep] = useState<number | null>(() => (settings[key] ? null : 0));
  const finish = () => {
    setStep(null);
    void saveSetting(key, true, true).catch(() => {});
  };
  if (step === null)
    return (
      <div>
        <Button variant="ghost" onClick={() => setStep(0)}>
          {t('compliance.guide.show')}
        </Button>
      </div>
    );
  return (
    <section className="guide-card" role="region" aria-label={t('compliance.guide.show')}>
      <span className="eyebrow">
        {t('compliance.guide.step', { current: step + 1, total: steps })}
      </span>
      <strong>{t(`${prefix}${step + 1}.title`)}</strong>
      <p>{t(`${prefix}${step + 1}.body`)}</p>
      <div className="button-row">
        <Button variant="ghost" onClick={finish}>
          {t('compliance.guide.skip')}
        </Button>
        <Button onClick={() => (step === steps - 1 ? finish() : setStep(step + 1))}>
          {t(step === steps - 1 ? 'compliance.guide.done' : 'compliance.guide.next')}
        </Button>
      </div>
    </section>
  );
}

/** Transport details shared by the single-invoice and bulk e-way bill dialogs. */
export function TransportFields({
  value,
  onChange,
  prefix,
}: {
  value: Transport;
  onChange: (value: Transport) => void;
  prefix: string;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof Transport>(key: K, next: Transport[K]) =>
    onChange({ ...value, [key]: next });
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <div className="form-grid">
      <Field
        id={id('transporterName')}
        label={t('compliance.eway.transporterName')}
        help="compliance-eway-transporter"
      >
        <Input
          id={id('transporterName')}
          value={value.transporterName}
          maxLength={120}
          onChange={(e) => set('transporterName', e.target.value)}
        />
      </Field>
      <Field
        id={id('transporterId')}
        label={t('compliance.eway.transporterId')}
        help="compliance-eway-transporter"
        error={
          value.transporterId && !validateGSTIN(value.transporterId)
            ? t('compliance.issue.transporterId')
            : undefined
        }
      >
        <Input
          id={id('transporterId')}
          value={value.transporterId}
          maxLength={15}
          onChange={(e) => set('transporterId', e.target.value.toUpperCase())}
        />
      </Field>
      <Field id={id('mode')} label={t('compliance.eway.mode')} help="compliance-eway-mode">
        <Select
          label={t('compliance.eway.mode')}
          value={value.mode}
          onChange={(v) => set('mode', v as Transport['mode'])}
          options={TRANSPORT_MODES.map((m) => ({
            value: m,
            label: t(`compliance.eway.mode.${m}`),
          }))}
        />
      </Field>
      <Field
        id={id('distance')}
        label={t('compliance.eway.distance')}
        help="compliance-eway-distance"
      >
        <Input
          id={id('distance')}
          type="number"
          min={0}
          max={4000}
          inputMode="numeric"
          value={value.distanceKm}
          onChange={(e) =>
            set('distanceKm', Math.max(0, Math.min(4000, Math.trunc(Number(e.target.value)) || 0)))
          }
        />
      </Field>
      <Field
        id={id('vehicleNo')}
        label={t('compliance.eway.vehicleNo')}
        help="compliance-eway-vehicle"
        error={isValidVehicle(value.vehicleNo) ? undefined : t('compliance.issue.vehicleFormat')}
      >
        <Input
          id={id('vehicleNo')}
          value={value.vehicleNo}
          maxLength={20}
          placeholder="KA01AB1234"
          onChange={(e) => set('vehicleNo', e.target.value.toUpperCase())}
        />
      </Field>
      <Field
        id={id('vehicleType')}
        label={t('compliance.eway.vehicleType')}
        help="compliance-eway-vehicleType"
      >
        <Select
          label={t('compliance.eway.vehicleType')}
          value={value.vehicleType}
          onChange={(v) => set('vehicleType', v as Transport['vehicleType'])}
          options={(['regular', 'odc'] as const).map((v) => ({
            value: v,
            label: t(`compliance.eway.vehicleType.${v}`),
          }))}
        />
      </Field>
      <Field id={id('docNo')} label={t('compliance.eway.docNo')} help="compliance-eway-docNo">
        <Input
          id={id('docNo')}
          value={value.docNo}
          maxLength={15}
          onChange={(e) => set('docNo', e.target.value)}
        />
      </Field>
      <Field id={id('docDate')} label={t('compliance.eway.docDate')} help="compliance-eway-docDate">
        <Input
          id={id('docDate')}
          type="date"
          value={value.docDate}
          onChange={(e) => set('docDate', e.target.value)}
        />
      </Field>
    </div>
  );
}

export function LabelWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <span className="field-label">
      {label}
      <HelpTip id={help} />
    </span>
  );
}
