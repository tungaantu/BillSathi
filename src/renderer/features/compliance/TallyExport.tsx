import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Dialog, Field, HelpTip, Input, useToast } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import {
  DEFAULT_TALLY_LEDGERS,
  TALLY_VOUCHER_KINDS,
  type TallyLedgerNames,
  type TallyOptions,
  type TallyVoucherKind,
} from '../../../shared/compliance-api';
import { Guide } from './parts';
import { financialYearStart } from './dates';

const LEDGER_KEYS = Object.keys(DEFAULT_TALLY_LEDGERS) as (keyof TallyLedgerNames)[];

function Body({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { firm, firmId, error } = useMasters();
  const [options, setOptions] = useState<TallyOptions>({
    from: financialYearStart(),
    to: today(),
    masters: true,
    vouchers: true,
    voucherKinds: [...TALLY_VOUCHER_KINDS],
    openingBalances: false,
    companyName: firm?.name ?? '',
    ledgers: { ...DEFAULT_TALLY_LEDGERS },
  });
  const [debounced, setDebounced] = useState(options),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(options), 400);
    return () => clearTimeout(timer);
  }, [options]);
  const set = <K extends keyof TallyOptions>(key: K, value: TallyOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));
  const noKinds = options.vouchers && options.voucherKinds.length === 0;
  const valid =
    (options.masters || options.vouchers) &&
    !noKinds &&
    options.from <= options.to &&
    options.companyName.trim() !== '' &&
    LEDGER_KEYS.every((k) => options.ledgers[k].trim() !== '');
  const counts = useQuery({
    queryKey: ['tally-count', firmId, debounced],
    queryFn: async () => unwrap(await window.api.compliance.tallyCount(firmId, debounced)),
    placeholderData: keepPreviousData,
    enabled:
      (debounced.masters || debounced.vouchers) &&
      debounced.voucherKinds.length > 0 &&
      debounced.from <= debounced.to &&
      debounced.companyName.trim() !== '' &&
      LEDGER_KEYS.every((k) => debounced.ledgers[k].trim() !== ''),
  });
  async function save() {
    setBusy(true);
    try {
      const done = unwrap(await window.api.compliance.tallySave(firmId, options));
      if (done) toast(t('compliance.tally.done', { count: done.paths.length }));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const toggleKind = (kind: TallyVoucherKind, on: boolean) =>
    set(
      'voucherKinds',
      on
        ? TALLY_VOUCHER_KINDS.filter((k) => k === kind || options.voucherKinds.includes(k))
        : options.voucherKinds.filter((k) => k !== kind),
    );
  return (
    <div className="compliance-body">
      <p className="muted">
        {t('compliance.tally.intro')} <HelpTip id="compliance-tally-overview" />
      </p>
      <Guide id="tally" prefix="compliance.tally.guide" />
      <div className="form-grid">
        <Field id="tally-from" label={t('compliance.tally.from')} help="compliance-tally-range">
          <Input
            id="tally-from"
            type="date"
            value={options.from}
            max={options.to}
            onChange={(e) => set('from', e.target.value)}
          />
        </Field>
        <Field id="tally-to" label={t('compliance.tally.to')} help="compliance-tally-range">
          <Input
            id="tally-to"
            type="date"
            value={options.to}
            min={options.from}
            onChange={(e) => set('to', e.target.value)}
          />
        </Field>
      </div>
      <div className="compliance-checks">
        <div className="button-row">
          <Checkbox
            checked={options.masters}
            onCheckedChange={(v) => set('masters', v)}
            label={t('compliance.tally.masters')}
          />
          <HelpTip id="compliance-tally-masters" />
        </div>
        <div className="button-row">
          <Checkbox
            checked={options.vouchers}
            onCheckedChange={(v) => set('vouchers', v)}
            label={t('compliance.tally.vouchers')}
          />
          <HelpTip id="compliance-tally-vouchers" />
        </div>
        {options.vouchers && (
          <div className="compliance-checks" role="group" aria-label={t('compliance.tally.kinds')}>
            {TALLY_VOUCHER_KINDS.map((kind) => (
              <Checkbox
                key={kind}
                checked={options.voucherKinds.includes(kind)}
                onCheckedChange={(v) => toggleKind(kind, v)}
                label={t(`compliance.tally.kind.${kind}`)}
              />
            ))}
          </div>
        )}
        {options.masters && (
          <div className="button-row">
            <Checkbox
              checked={options.openingBalances}
              onCheckedChange={(v) => set('openingBalances', v)}
              label={t('compliance.tally.opening')}
            />
            <HelpTip id="compliance-tally-opening" />
          </div>
        )}
      </div>
      <Field
        id="tally-company"
        label={t('compliance.tally.company')}
        help="compliance-tally-company"
      >
        <Input
          id="tally-company"
          value={options.companyName}
          maxLength={200}
          onChange={(e) => set('companyName', e.target.value)}
        />
      </Field>
      <details>
        <summary>
          {t('compliance.tally.ledgers')} <HelpTip id="compliance-tally-ledgers" />
        </summary>
        <div className="form-grid">
          {LEDGER_KEYS.map((key) => (
            <Field key={key} id={`tally-ledger-${key}`} label={t(`compliance.tally.ledger.${key}`)}>
              <Input
                id={`tally-ledger-${key}`}
                value={options.ledgers[key]}
                maxLength={100}
                onChange={(e) => set('ledgers', { ...options.ledgers, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </details>
      <section className="compliance-checks" aria-live="polite">
        {!options.masters && !options.vouchers && (
          <p className="danger">{t('compliance.tally.pickOne')}</p>
        )}
        {noKinds && <p className="danger">{t('compliance.tally.pickKinds')}</p>}
        {counts.data && valid && (
          <>
            <p className="compliance-summary">{t('compliance.tally.counts', { ...counts.data })}</p>
            {counts.data.warnings.map((w) => (
              <p key={w.code} className="muted">
                {t(`compliance.tally.warn.${w.code}`, { count: w.count })}
              </p>
            ))}
          </>
        )}
        {counts.isError && <p className="danger">{t('storage')}</p>}
      </section>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('compliance.close')}
        </Button>
        <Button disabled={busy || !valid} onClick={() => void save()}>
          {t('compliance.tally.export')}
        </Button>
      </div>
    </div>
  );
}

export function TallyExport({
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
      title={t('compliance.tally.title')}
      className="compliance-dialog"
    >
      <Body onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
