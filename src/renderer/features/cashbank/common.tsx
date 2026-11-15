import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Field, Input, MoneyInput, Select, useToast } from '../../components/ui';
import { useSales } from '../sales/common';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { unwrap } from '../../../shared/types';
export function useFinance() {
  const app = useSales(),
    { firmId } = app;
  const query = useQuery({
    queryKey: ['finance-accounts', firmId],
    queryFn: async () => unwrap(await window.api.finance.accounts(firmId)),
  });
  return { ...app, banks: query.data ?? [], accountQuery: query };
}
export function FinanceField({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Field id={`finance-${name}`} label={t(`finance.${name}`)} help={`finance-${name}`}>
      {children}
    </Field>
  );
}
export function FinanceText({
  name,
  value,
  onChange,
  type = 'text',
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <FinanceField name={name}>
      <Input
        id={`finance-${name}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </FinanceField>
  );
}
export function FinanceMoney({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <FinanceField name={name}>
      <MoneyInput id={`finance-${name}`} value={value} onValueChange={onChange} />
    </FinanceField>
  );
}
export function AccountSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (id: number) => void;
}) {
  const { t } = useTranslation(),
    { banks } = useFinance();
  return (
    <FinanceField name={name}>
      <Select
        label={t(`finance.${name}`)}
        value={String(value || '')}
        options={banks
          .filter((a) => ['cash', 'bank'].includes(a.type))
          .map((a) => ({
            value: String(a.id),
            label: a.type === 'cash' ? t('nav.cashHand') : a.name,
          }))}
        onChange={(v) => onChange(Number(v))}
      />
    </FinanceField>
  );
}
export function FinanceDialog({
  title,
  onClose,
  onSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<unknown>;
  children: ReactNode;
}) {
  const { t } = useTranslation(),
    { error, invalidate } = useFinance(),
    toast = useToast(),
    form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  useSaveShortcut(form);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={title}
    >
      <form
        ref={form}
        className="stack"
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || form.current?.querySelector('[aria-invalid="true"]')) return;
          setBusy(true);
          void onSave()
            .then(async () => {
              await invalidate();
              toast(t('saved'));
              onClose();
            })
            .catch(error)
            .finally(() => setBusy(false));
        }}
      >
        {children}
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export const financeTour = [
  { target: '[data-tour="finance-new"]', title: 'finance.tourNew', body: 'finance.tourNewBody' },
  { target: '[data-tour="finance-work"]', title: 'finance.tourWork', body: 'finance.tourWorkBody' },
  {
    target: '[data-tour="finance-actions"]',
    title: 'finance.tourActions',
    body: 'finance.tourActionsBody',
  },
];
