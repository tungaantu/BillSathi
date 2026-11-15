import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field, Input, MoneyInput } from '../../components/ui';
import { useMasters } from '../masters/common';
import { unwrap } from '../../../shared/types';
export function useSales() {
  const app = useMasters(),
    f = app.firmId;
  const parties = useQuery({
    queryKey: ['parties', f],
    queryFn: async () => unwrap(await window.api.masters.parties(f)),
  });
  const items = useQuery({
    queryKey: ['items', f],
    queryFn: async () => unwrap(await window.api.masters.items(f)),
  });
  const accounts = useQuery({
    queryKey: ['accounts', f],
    queryFn: async () => unwrap(await window.api.sales.accounts(f)),
  });
  const txns = useQuery({
    queryKey: ['sales', f],
    queryFn: async () => unwrap(await window.api.sales.list(f)),
  });
  return {
    ...app,
    parties: parties.data ?? [],
    items: items.data ?? [],
    accounts: accounts.data ?? [],
    txns: txns.data ?? [],
  };
}
export function SaleField({ name, children }: { name: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Field id={`sale-${name}`} label={t(`sales.${name}`)} help={`sale-${name}`}>
      {children}
    </Field>
  );
}
export function SaleText({
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
    <SaleField name={name}>
      <Input
        id={`sale-${name}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </SaleField>
  );
}
export function SaleMoney({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <SaleField name={name}>
      <MoneyInput id={`sale-${name}`} value={value} onValueChange={onChange} />
    </SaleField>
  );
}
export const salesTour = [
  { target: '[data-tour="sales-new"]', title: 'sales.tourNew', body: 'sales.tourNewBody' },
  { target: '[data-tour="sales-work"]', title: 'sales.tourWork', body: 'sales.tourWorkBody' },
  {
    target: '[data-tour="sales-actions"]',
    title: 'sales.tourActions',
    body: 'sales.tourActionsBody',
  },
];
